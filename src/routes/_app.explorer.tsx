import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import {
  Add,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Copy,
  Cut,
  Document,
  Edit,
  Folder,
  Information,
  Paste,
  Renew,
  TrashCan,
  Upload,
  Zip,
} from "@carbon/icons-react";
import {
  Button,
  InlineLoading,
  InlineNotification,
  Modal,
  ProgressBar,
  Search,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TextArea,
  TextInput,
  Toggle,
} from "@carbon/react";
import { formatBytes, formatDate } from "@/lib/format";
import {
  localApi,
  type ConflictPolicy,
  type LocalFileEntry,
  type OperationJob,
  type ProgressState,
} from "@/lib/local-api";
import { useNotifications } from "@/lib/notifications";
import { useExplorerSelection } from "@/components/explorer/use-explorer-selection";

const searchSchema = z.object({ path: z.string().optional(), q: z.string().optional() });

export const Route = createFileRoute("/_app/explorer")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "File Explorer — wFileManager" }] }),
  component: Explorer,
});

type CreateKind = "file" | "directory";
type TransferKind = "copy" | "move";
type SortKey = "name" | "size" | "modifiedAt" | "kind";
type SortDirection = "asc" | "desc";
type ClipboardState = { kind: TransferKind; entries: LocalFileEntry[] } | null;
type ContextState = { x: number; y: number } | null;
type ArchiveState =
  { kind: "create"; entries: LocalFileEntry[] } | { kind: "extract"; entry: LocalFileEntry } | null;

const ARCHIVE_PATTERN = /\.(?:zip|tar|tar\.gz|tgz|tar\.bz2|tbz2?|tar\.xz|txz|7z|rar)$/i;

function normalizePath(value: string) {
  const parts = value.split("/").filter(Boolean);
  const safe: string[] = [];
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") safe.pop();
    else safe.push(part);
  }
  return `/${safe.join("/")}` || "/";
}

function parentPath(value: string) {
  const parts = normalizePath(value).split("/").filter(Boolean);
  parts.pop();
  return `/${parts.join("/")}` || "/";
}

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function mediaKind(entry: LocalFileEntry) {
  if (entry.mime.startsWith("image/")) return "image";
  if (entry.mime.startsWith("audio/")) return "audio";
  if (entry.mime.startsWith("video/")) return "video";
  if (entry.mime === "application/pdf") return "pdf";
  return "text";
}

function fileUrl(entry: LocalFileEntry) {
  return `/api/local?${new URLSearchParams({ action: "download", path: entry.path })}`;
}

function Explorer() {
  const { path = "/", q = "" } = Route.useSearch();
  const navigate = useNavigate({ from: "/explorer" });
  const { notify } = useNotifications();
  const currentPath = normalizePath(path);
  const uploadInput = useRef<HTMLInputElement>(null);
  const pathInputRef = useRef<HTMLInputElement>(null);
  const explorerRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);

  const [entries, setEntries] = useState<LocalFileEntry[]>([]);
  const [pathInput, setPathInput] = useState(currentPath);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [showHidden, setShowHidden] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [clipboard, setClipboard] = useState<ClipboardState>(null);
  const [contextMenu, setContextMenu] = useState<ContextState>(null);
  const [createKind, setCreateKind] = useState<CreateKind | null>(null);
  const [createName, setCreateName] = useState("");
  const [renameEntry, setRenameEntry] = useState<LocalFileEntry | null>(null);
  const [renameName, setRenameName] = useState("");
  const [deleteEntries, setDeleteEntries] = useState<LocalFileEntry[]>([]);
  const [permanentDelete, setPermanentDelete] = useState(false);
  const [transfer, setTransfer] = useState<{
    kind: TransferKind;
    entries: LocalFileEntry[];
  } | null>(null);
  const [destination, setDestination] = useState(currentPath);
  const [conflict, setConflict] = useState<ConflictPolicy>("keep-both");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPath, setPickerPath] = useState(currentPath);
  const [pickerEntries, setPickerEntries] = useState<LocalFileEntry[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<LocalFileEntry | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [propertiesEntry, setPropertiesEntry] = useState<LocalFileEntry | null>(null);
  const [propertyMode, setPropertyMode] = useState("");
  const [propertyUid, setPropertyUid] = useState("");
  const [propertyGid, setPropertyGid] = useState("");
  const [archive, setArchive] = useState<ArchiveState>(null);
  const [archiveName, setArchiveName] = useState("archive");
  const [archiveFormat, setArchiveFormat] = useState<"zip" | "tar.gz">("zip");
  const [extractMode, setExtractMode] = useState<"here" | "subfolder">("subfolder");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [activeJob, setActiveJob] = useState<OperationJob | null>(null);

  useEffect(() => {
    setShowHidden(window.localStorage.getItem("wfm:show-hidden") === "true");
    const storedSort = window.localStorage.getItem("wfm:sort-key");
    if (["name", "size", "modifiedAt", "kind"].includes(storedSort || ""))
      setSortKey(storedSort as SortKey);
    setSortDirection(window.localStorage.getItem("wfm:sort-direction") === "desc" ? "desc" : "asc");
  }, []);

  const setPath = useCallback(
    (value: string) => {
      navigate({
        search: (previous: { path?: string; q?: string }) => ({
          ...previous,
          path: normalizePath(value),
          q: undefined,
        }),
      });
    },
    [navigate],
  );

  const setSearch = (value: string) => {
    navigate({
      replace: true,
      search: (previous: { path?: string; q?: string }) => ({
        ...previous,
        q: value || undefined,
      }),
    });
  };

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await localApi.list(currentPath, undefined, q || undefined, 500);
      if (id !== requestId.current) return;
      setEntries(result.entries);
      setPathInput(result.path);
      setNextCursor(result.nextCursor || null);
      setTotal(result.total ?? result.entries.length);
    } catch (cause) {
      if (id !== requestId.current) return;
      setEntries([]);
      setError(cause instanceof Error ? cause.message : "Unable to load this directory");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [currentPath, q]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), q ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, q]);

  useEffect(() => {
    let disposed = false;
    const refreshJobs = async () => {
      try {
        const result = await localApi.jobs.list();
        if (disposed) return;
        const running = result.jobs.find((job) =>
          ["queued", "running", "cancelling"].includes(job.status),
        );
        setActiveJob(running || null);
      } catch {
        // Directory operations still surface their own request errors.
      }
    };
    void refreshJobs();
    const timer = window.setInterval(() => void refreshJobs(), 2_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await localApi.list(currentPath, nextCursor, q || undefined, 500);
      setEntries((current) => [...current, ...result.entries]);
      setNextCursor(result.nextCursor || null);
      setTotal(result.total ?? total);
    } catch (cause) {
      notify({
        kind: "error",
        title: "Unable to load more items",
        subtitle:
          cause instanceof Error ? cause.message : "The next directory page could not be loaded.",
      });
    } finally {
      setLoadingMore(false);
    }
  };

  const visibleEntries = useMemo(() => {
    const filtered = showHidden ? entries : entries.filter((entry) => !entry.hidden);
    return [...filtered].sort((left, right) => {
      if (sortKey === "name" && left.kind !== right.kind) {
        if (left.kind === "directory") return -1;
        if (right.kind === "directory") return 1;
      }
      let comparison = 0;
      if (sortKey === "size") comparison = left.size - right.size;
      else if (sortKey === "modifiedAt")
        comparison = left.modifiedAt.localeCompare(right.modifiedAt);
      else if (sortKey === "kind") comparison = left.kind.localeCompare(right.kind);
      else
        comparison = left.name.localeCompare(right.name, undefined, {
          numeric: true,
          sensitivity: "base",
        });
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [entries, showHidden, sortDirection, sortKey]);

  const {
    selected,
    setSelected,
    selectedEntries,
    anchorPath,
    focusedPath,
    selectOnly,
    selectEntry,
    clearSelection,
  } = useExplorerSelection(visibleEntries);

  useEffect(() => {
    clearSelection();
  }, [clearSelection, currentPath, q]);

  const openEntry = useCallback(
    async (entry: LocalFileEntry) => {
      if (
        entry.kind === "directory" ||
        (entry.kind === "symlink" && entry.linkKind === "directory")
      ) {
        setPath(entry.path);
        return;
      }
      if (entry.kind !== "file" && entry.kind !== "symlink") {
        notify({
          kind: "error",
          title: "Unable to open item",
          subtitle: "This filesystem entry type is not supported.",
        });
        return;
      }
      setPreviewEntry(entry);
      if (mediaKind(entry) !== "text") return;
      setPreviewLoading(true);
      setEditorContent("");
      try {
        const result = await localApi.read(entry.path);
        setEditorContent(result.content);
      } catch (cause) {
        notify({
          kind: "error",
          title: "Unable to open file",
          subtitle:
            cause instanceof Error ? cause.message : "This file cannot be previewed as text.",
        });
        setPreviewEntry(null);
      } finally {
        setPreviewLoading(false);
      }
    },
    [notify, setPath],
  );

  const startCreate = useCallback((kind: CreateKind) => {
    setCreateKind(kind);
    setCreateName("");
  }, []);

  const startRename = useCallback((entry: LocalFileEntry) => {
    setRenameEntry(entry);
    setRenameName(entry.name);
  }, []);

  const startProperties = useCallback((entry: LocalFileEntry) => {
    setPropertiesEntry(entry);
    setPropertyMode(entry.mode);
    setPropertyUid(String(entry.uid));
    setPropertyGid(String(entry.gid));
  }, []);

  const runPaste = useCallback(
    async (state = clipboard, target = currentPath) => {
      if (!state?.entries.length) return;
      const title = state.kind === "copy" ? "Copy" : "Move";
      const noticeId = notify({
        kind: "info",
        title: `${title} started`,
        subtitle: `${state.entries.length} item(s)`,
        timeout: 0,
      });
      try {
        const report = (job: OperationJob) => {
          setActiveJob(job);
          notify({
            id: noticeId,
            kind: "info",
            title: `${title} · ${job.progress}%`,
            subtitle: job.currentItem || job.source,
            timeout: 0,
          });
        };
        if (state.kind === "copy")
          await localApi.copyMany(
            state.entries.map((entry) => entry.path),
            target,
            conflict,
            report,
          );
        else
          await localApi.moveMany(
            state.entries.map((entry) => entry.path),
            target,
            conflict,
            report,
          );
        notify({
          id: noticeId,
          kind: "success",
          title: `${title} completed`,
          subtitle: `${state.entries.length} item(s)`,
          timeout: 3500,
        });
        if (state.kind === "move") setClipboard(null);
        setTransfer(null);
        setActiveJob(null);
        await load();
      } catch (cause) {
        notify({
          id: noticeId,
          kind: "error",
          title: "Operation failed",
          subtitle: cause instanceof Error ? cause.message : "The operation did not complete.",
          timeout: 0,
        });
      }
    },
    [clipboard, conflict, currentPath, load, notify],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!explorerRef.current?.contains(document.activeElement) || isTypingTarget(event.target))
        return;
      const ctrl = event.ctrlKey || event.metaKey;
      const currentIndex = visibleEntries.findIndex((entry) => entry.path === focusedPath);
      const focused = currentIndex >= 0 ? visibleEntries[currentIndex] : null;
      if (ctrl && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelected(new Set(visibleEntries.map((entry) => entry.path)));
      } else if (ctrl && event.key.toLowerCase() === "c" && selectedEntries.length) {
        event.preventDefault();
        setClipboard({ kind: "copy", entries: selectedEntries });
      } else if (ctrl && event.key.toLowerCase() === "x" && selectedEntries.length) {
        event.preventDefault();
        setClipboard({ kind: "move", entries: selectedEntries });
      } else if (ctrl && event.key.toLowerCase() === "v" && clipboard) {
        event.preventDefault();
        void runPaste();
      } else if (ctrl && event.key.toLowerCase() === "l") {
        event.preventDefault();
        pathInputRef.current?.focus();
        pathInputRef.current?.select();
      } else if (ctrl && event.shiftKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        startCreate("directory");
      } else if (event.altKey && event.key === "ArrowUp") {
        event.preventDefault();
        setPath(parentPath(currentPath));
      } else if (event.altKey && event.key === "ArrowLeft") {
        event.preventDefault();
        window.history.back();
      } else if (event.altKey && event.key === "ArrowRight") {
        event.preventDefault();
        window.history.forward();
      } else if (event.key === "F5") {
        event.preventDefault();
        void load();
      } else if (event.key === "Delete" && selectedEntries.length) {
        event.preventDefault();
        setPermanentDelete(event.shiftKey);
        setDeleteEntries(selectedEntries);
      } else if (event.key === "F2" && selectedEntries.length === 1) {
        event.preventDefault();
        startRename(selectedEntries[0]);
      } else if (event.key === "Enter" && selectedEntries.length === 1) {
        event.preventDefault();
        void openEntry(selectedEntries[0]);
      } else if (event.key === "Escape") {
        setSelected(new Set());
        setContextMenu(null);
      } else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
        event.preventDefault();
        const rect = explorerRef.current.getBoundingClientRect();
        setContextMenu({ x: rect.left + 48, y: rect.top + 96 });
      } else if (
        ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"].includes(event.key) &&
        visibleEntries.length
      ) {
        event.preventDefault();
        let nextIndex = currentIndex < 0 ? 0 : currentIndex;
        if (event.key === "ArrowDown" || event.key === "ArrowRight")
          nextIndex = Math.min(visibleEntries.length - 1, nextIndex + 1);
        if (event.key === "ArrowUp" || event.key === "ArrowLeft")
          nextIndex = Math.max(0, nextIndex - 1);
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = visibleEntries.length - 1;
        const next = visibleEntries[nextIndex];
        if (event.shiftKey && anchorPath) {
          const anchorIndex = visibleEntries.findIndex((entry) => entry.path === anchorPath);
          const range = visibleEntries.slice(
            Math.min(anchorIndex, nextIndex),
            Math.max(anchorIndex, nextIndex) + 1,
          );
          setSelected(new Set(range.map((entry) => entry.path)));
        } else selectOnly(next);
      } else if (event.key === " " && focused) {
        event.preventDefault();
        setSelected((current) => {
          const next = new Set(current);
          if (next.has(focused.path)) next.delete(focused.path);
          else next.add(focused.path);
          return next;
        });
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    anchorPath,
    clipboard,
    currentPath,
    focusedPath,
    load,
    openEntry,
    runPaste,
    selectOnly,
    selectedEntries,
    setPath,
    setSelected,
    startCreate,
    startRename,
    visibleEntries,
  ]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
    };
  }, []);

  const create = async () => {
    const name = createName.trim();
    if (!createKind || !name) return;
    setBusy(true);
    try {
      if (createKind === "file") await localApi.createFile(currentPath, name);
      else await localApi.createDirectory(currentPath, name);
      notify({
        kind: "success",
        title: createKind === "file" ? "File created" : "Folder created",
        subtitle: name,
      });
      setCreateKind(null);
      await load();
    } catch (cause) {
      notify({
        kind: "error",
        title: "Creation failed",
        subtitle: cause instanceof Error ? cause.message : "Unable to create the item.",
      });
    } finally {
      setBusy(false);
    }
  };

  const rename = async () => {
    if (!renameEntry || !renameName.trim()) return;
    setBusy(true);
    try {
      await localApi.rename(renameEntry.path, renameName.trim());
      notify({ kind: "success", title: "Renamed", subtitle: renameName.trim() });
      setRenameEntry(null);
      await load();
    } catch (cause) {
      notify({
        kind: "error",
        title: "Rename failed",
        subtitle: cause instanceof Error ? cause.message : "Unable to rename the item.",
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleteEntries.length) return;
    setBusy(true);
    try {
      if (permanentDelete) {
        await localApi.deleteMany(
          deleteEntries.map((entry) => entry.path),
          setActiveJob,
        );
      } else {
        await localApi.trash.moveMany(deleteEntries.map((entry) => entry.path));
      }
      notify({
        kind: "success",
        title: permanentDelete ? "Permanently deleted" : "Moved to trash",
        subtitle: `${deleteEntries.length} item(s)`,
      });
      setDeleteEntries([]);
      setPermanentDelete(false);
      await load();
    } catch (cause) {
      notify({
        kind: "error",
        title: "Delete failed",
        subtitle: cause instanceof Error ? cause.message : "Unable to move the selection to trash.",
      });
    } finally {
      setBusy(false);
    }
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setProgress({ loaded: 0, total: 0, percent: 0 });
    try {
      await localApi.upload(currentPath, files, setProgress);
      notify({
        kind: "success",
        title: "Upload completed",
        subtitle: `${files.length} file(s) uploaded.`,
      });
      await load();
    } catch (cause) {
      notify({
        kind: "error",
        title: "Upload failed",
        subtitle: cause instanceof Error ? cause.message : "Unable to upload the selected files.",
      });
    } finally {
      window.setTimeout(() => setProgress(null), 800);
      if (uploadInput.current) uploadInput.current.value = "";
    }
  };

  const download = async (entry: LocalFileEntry) => {
    try {
      await localApi.download(entry.path, entry.name);
      notify({ kind: "success", title: "Download started", subtitle: entry.name });
    } catch (cause) {
      notify({
        kind: "error",
        title: "Download failed",
        subtitle: cause instanceof Error ? cause.message : "Unable to download this file.",
      });
    }
  };

  const save = async () => {
    if (!previewEntry) return;
    setSaving(true);
    try {
      await localApi.save(previewEntry.path, editorContent, previewEntry.modifiedAt);
      notify({ kind: "success", title: "File saved", subtitle: previewEntry.name });
      setPreviewEntry(null);
      await load();
    } catch (cause) {
      notify({
        kind: "error",
        title: "Save failed",
        subtitle: cause instanceof Error ? cause.message : "Unable to save this file.",
      });
    } finally {
      setSaving(false);
    }
  };

  const saveProperties = async () => {
    if (!propertiesEntry) return;
    setBusy(true);
    try {
      if (propertyMode !== propertiesEntry.mode)
        await localApi.chmod(propertiesEntry.path, propertyMode);
      if (
        Number(propertyUid) !== propertiesEntry.uid ||
        Number(propertyGid) !== propertiesEntry.gid
      )
        await localApi.chown(propertiesEntry.path, Number(propertyUid), Number(propertyGid));
      notify({ kind: "success", title: "Properties updated", subtitle: propertiesEntry.name });
      setPropertiesEntry(null);
      await load();
    } catch (cause) {
      notify({
        kind: "error",
        title: "Properties update failed",
        subtitle: cause instanceof Error ? cause.message : "Unable to update this item.",
      });
    } finally {
      setBusy(false);
    }
  };

  const runArchive = async () => {
    if (!archive) return;
    setBusy(true);
    const noticeId = notify({
      kind: "info",
      title: archive.kind === "create" ? "Creating archive" : "Extracting archive",
      timeout: 0,
    });
    try {
      if (archive.kind === "create") {
        await localApi.archive.create({
          sources: archive.entries.map((entry) => entry.path),
          destination: currentPath,
          name: archiveName,
          format: archiveFormat,
        });
      } else {
        await localApi.archive.extract({
          archive: archive.entry.path,
          destination: currentPath,
          mode: extractMode,
          conflict: conflict === "error" ? "keep-both" : conflict,
        });
      }
      notify({
        id: noticeId,
        kind: "success",
        title: archive.kind === "create" ? "Archive created" : "Archive extracted",
        timeout: 3500,
      });
      setArchive(null);
      await load();
    } catch (cause) {
      notify({
        id: noticeId,
        kind: "error",
        title: "Archive operation failed",
        subtitle:
          cause instanceof Error ? cause.message : "The archive operation did not complete.",
        timeout: 0,
      });
    } finally {
      setBusy(false);
    }
  };

  const loadPicker = useCallback(
    async (target: string) => {
      setPickerLoading(true);
      try {
        const result = await localApi.list(target, undefined, undefined, 500);
        setPickerPath(result.path);
        setPickerEntries(result.entries.filter((entry) => entry.kind === "directory"));
      } catch (cause) {
        notify({
          kind: "error",
          title: "Unable to browse destination",
          subtitle: cause instanceof Error ? cause.message : "This folder cannot be opened.",
        });
      } finally {
        setPickerLoading(false);
      }
    },
    [notify],
  );

  useEffect(() => {
    if (pickerOpen) void loadPicker(destination);
  }, [destination, loadPicker, pickerOpen]);

  const toggleSort = (key: SortKey) => {
    const direction = key === sortKey && sortDirection === "asc" ? "desc" : "asc";
    setSortKey(key);
    setSortDirection(direction);
    localStorage.setItem("wfm:sort-key", key);
    localStorage.setItem("wfm:sort-direction", direction);
  };

  const openContextMenu = (event: ReactMouseEvent, entry?: LocalFileEntry) => {
    event.preventDefault();
    event.stopPropagation();
    if (entry && !selected.has(entry.path)) selectOnly(entry);
    if (!entry) setSelected(new Set());
    setContextMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 232)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 360)),
    });
  };

  const selectedSingle = selectedEntries.length === 1 ? selectedEntries[0] : null;
  const canExtract = selectedSingle?.kind === "file" && ARCHIVE_PATTERN.test(selectedSingle.name);

  return (
    <section className="wfm-page wfm-page--explorer" aria-labelledby="explorer-title">
      <header className="wfm-page__header">
        <div>
          <h1 id="explorer-title" className="wfm-page__heading">
            File Explorer
          </h1>
          <p className="wfm-page__description">
            Browse and manage files directly on this Linux server.
          </p>
        </div>
        <div className="wfm-page__actions">
          <Button kind="ghost" size="sm" renderIcon={Renew} onClick={() => void load()}>
            Refresh
          </Button>
          <Button
            kind="tertiary"
            size="sm"
            renderIcon={Folder}
            onClick={() => startCreate("directory")}
          >
            New folder
          </Button>
          <Button kind="tertiary" size="sm" renderIcon={Add} onClick={() => startCreate("file")}>
            New file
          </Button>
          <Button size="sm" renderIcon={Upload} onClick={() => uploadInput.current?.click()}>
            Upload
          </Button>
          <input
            ref={uploadInput}
            type="file"
            multiple
            hidden
            onChange={(event) => void upload(event.target.files)}
          />
        </div>
      </header>

      <div className="wfm-explorer-toolbar">
        <form
          className="wfm-path-controls"
          onSubmit={(event) => {
            event.preventDefault();
            setPath(pathInput);
          }}
        >
          <div className="wfm-history-controls">
            <Button
              hasIconOnly
              iconDescription="Back"
              kind="ghost"
              size="md"
              renderIcon={ArrowLeft}
              onClick={() => window.history.back()}
            />
            <Button
              hasIconOnly
              iconDescription="Forward"
              kind="ghost"
              size="md"
              renderIcon={ArrowRight}
              onClick={() => window.history.forward()}
            />
            <Button
              hasIconOnly
              iconDescription="Up"
              kind="ghost"
              size="md"
              renderIcon={ArrowUp}
              disabled={currentPath === "/"}
              onClick={() => setPath(parentPath(currentPath))}
            />
          </div>
          <TextInput
            ref={pathInputRef}
            id="current-path"
            labelText="Path"
            value={pathInput}
            onChange={(event) => setPathInput(event.target.value)}
          />
          <Button type="submit" kind="secondary" size="md">
            Go
          </Button>
        </form>
        <Search
          id="folder-search"
          labelText="Search this folder"
          placeholder="Search this folder"
          value={q}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="wfm-command-bar" aria-label="File actions">
        <span className="wfm-selection-summary">
          {selectedEntries.length ? `${selectedEntries.length} selected` : `${total} item(s)`}
        </span>
        <Button
          kind="ghost"
          size="sm"
          renderIcon={Cut}
          disabled={!selectedEntries.length}
          onClick={() => setClipboard({ kind: "move", entries: selectedEntries })}
        >
          Cut
        </Button>
        <Button
          kind="ghost"
          size="sm"
          renderIcon={Copy}
          disabled={!selectedEntries.length}
          onClick={() => setClipboard({ kind: "copy", entries: selectedEntries })}
        >
          Copy
        </Button>
        <Button
          kind="ghost"
          size="sm"
          renderIcon={Paste}
          disabled={!clipboard}
          onClick={() => void runPaste()}
        >
          Paste
        </Button>
        <Button
          kind="ghost"
          size="sm"
          renderIcon={Edit}
          disabled={!selectedSingle}
          onClick={() => selectedSingle && startRename(selectedSingle)}
        >
          Rename
        </Button>
        <Button
          kind="ghost"
          size="sm"
          renderIcon={Zip}
          disabled={!selectedEntries.length}
          onClick={() => {
            setArchive({ kind: "create", entries: selectedEntries });
            setArchiveName(selectedSingle?.name || "archive");
          }}
        >
          Compress
        </Button>
        <Button
          kind="ghost"
          size="sm"
          renderIcon={Information}
          disabled={!selectedSingle}
          onClick={() => selectedSingle && startProperties(selectedSingle)}
        >
          Properties
        </Button>
        <Button
          kind="danger--ghost"
          size="sm"
          renderIcon={TrashCan}
          disabled={!selectedEntries.length}
          onClick={() => {
            setPermanentDelete(false);
            setDeleteEntries(selectedEntries);
          }}
        >
          Trash
        </Button>
        <Toggle
          id="show-hidden"
          size="sm"
          labelText="Hidden files"
          labelA="Hide"
          labelB="Show"
          toggled={showHidden}
          onToggle={(value) => {
            setShowHidden(value);
            localStorage.setItem("wfm:show-hidden", String(value));
          }}
        />
      </div>

      {clipboard ? (
        <div className="wfm-clipboard-banner">
          <strong>{clipboard.kind === "copy" ? "Copying" : "Moving"}:</strong>{" "}
          {clipboard.entries.length} item(s). Navigate to a destination and paste.
        </div>
      ) : null}

      {progress ? (
        <div className="wfm-progress-block">
          <ProgressBar
            label={progress.detail || "Uploading"}
            value={progress.percent}
            max={100}
            helperText={`${progress.percent}%`}
          />
        </div>
      ) : null}

      {activeJob &&
      !["completed", "failed", "cancelled", "interrupted"].includes(activeJob.status) ? (
        <div className="wfm-progress-block wfm-operation-progress">
          <ProgressBar
            label={activeJob.currentItem || activeJob.operation}
            value={activeJob.progress}
            max={100}
            helperText={`${activeJob.progress}%`}
          />
          <Button
            kind="ghost"
            size="sm"
            disabled={!activeJob.cancellable}
            onClick={() => void localApi.jobs.cancel(activeJob.id)}
          >
            Cancel
          </Button>
        </div>
      ) : null}

      {error ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Unable to load this directory"
          subtitle={error}
        />
      ) : null}

      <div
        ref={explorerRef}
        className="wfm-table-wrap wfm-file-grid"
        tabIndex={0}
        role="grid"
        aria-multiselectable="true"
        aria-label={`Files in ${currentPath}`}
        onContextMenu={(event) => openContextMenu(event)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setSelected(new Set());
        }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) {
            event.preventDefault();
            event.currentTarget.classList.add("is-dragging");
          }
        }}
        onDragLeave={(event) => event.currentTarget.classList.remove("is-dragging")}
        onDrop={(event) => {
          event.preventDefault();
          event.currentTarget.classList.remove("is-dragging");
          void upload(event.dataTransfer.files);
        }}
      >
        <TableContainer title={currentPath} description={`${entries.length} loaded of ${total}`}>
          <Table size="lg" useZebraStyles={false}>
            <TableHead>
              <TableRow>
                <TableHeader className="wfm-select-column">
                  <input
                    type="checkbox"
                    aria-label="Select all loaded items"
                    checked={
                      visibleEntries.length > 0 && selectedEntries.length === visibleEntries.length
                    }
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? new Set(visibleEntries.map((entry) => entry.path))
                          : new Set(),
                      )
                    }
                  />
                </TableHeader>
                <TableHeader>
                  <button className="wfm-sort-button" onClick={() => toggleSort("name")}>
                    Name {sortKey === "name" ? (sortDirection === "asc" ? "↑" : "↓") : ""}
                  </button>
                </TableHeader>
                <TableHeader>
                  <button className="wfm-sort-button" onClick={() => toggleSort("kind")}>
                    Type {sortKey === "kind" ? (sortDirection === "asc" ? "↑" : "↓") : ""}
                  </button>
                </TableHeader>
                <TableHeader>
                  <button className="wfm-sort-button" onClick={() => toggleSort("size")}>
                    Size {sortKey === "size" ? (sortDirection === "asc" ? "↑" : "↓") : ""}
                  </button>
                </TableHeader>
                <TableHeader>
                  <button className="wfm-sort-button" onClick={() => toggleSort("modifiedAt")}>
                    Modified {sortKey === "modifiedAt" ? (sortDirection === "asc" ? "↑" : "↓") : ""}
                  </button>
                </TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <InlineLoading description="Loading directory…" />
                  </TableCell>
                </TableRow>
              ) : visibleEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>This folder is empty.</TableCell>
                </TableRow>
              ) : (
                visibleEntries.map((entry) => {
                  const isSelected = selected.has(entry.path);
                  const Icon =
                    entry.kind === "directory" || entry.linkKind === "directory"
                      ? Folder
                      : Document;
                  return (
                    <TableRow
                      key={entry.path}
                      className={isSelected ? "wfm-file-row is-selected" : "wfm-file-row"}
                      aria-selected={isSelected}
                      data-path={entry.path}
                      onClick={(event) => {
                        explorerRef.current?.focus({ preventScroll: true });
                        selectEntry(entry, event);
                      }}
                      onDoubleClick={(event) => {
                        event.preventDefault();
                        void openEntry(entry);
                      }}
                      onContextMenu={(event) => openContextMenu(event, entry)}
                    >
                      <TableCell className="wfm-select-column">
                        <input
                          type="checkbox"
                          aria-label={`Select ${entry.name}`}
                          checked={isSelected}
                          onChange={() => undefined}
                          tabIndex={-1}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="wfm-file-name">
                          <Icon size={20} />
                          <span>{entry.name}</span>
                          {entry.kind === "symlink" ? (
                            <span className="wfm-symlink-badge">Link</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        {entry.kind}
                        {entry.mime !== "application/octet-stream" && entry.kind === "file"
                          ? ` · ${entry.mime}`
                          : ""}
                      </TableCell>
                      <TableCell>{entry.kind === "file" ? formatBytes(entry.size) : "—"}</TableCell>
                      <TableCell>{formatDate(entry.modifiedAt)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
        {nextCursor ? (
          <div className="wfm-load-more">
            <Button kind="ghost" disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? "Loading…" : `Load more (${entries.length} of ${total})`}
            </Button>
          </div>
        ) : null}
      </div>

      {contextMenu ? (
        <div
          className="wfm-context-menu"
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          {selectedSingle ? (
            <button
              role="menuitem"
              onClick={() => {
                void openEntry(selectedSingle);
                setContextMenu(null);
              }}
            >
              Open
            </button>
          ) : null}
          {selectedEntries.length ? (
            <>
              <button
                role="menuitem"
                onClick={() => {
                  setClipboard({ kind: "move", entries: selectedEntries });
                  setContextMenu(null);
                }}
              >
                Cut
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setClipboard({ kind: "copy", entries: selectedEntries });
                  setContextMenu(null);
                }}
              >
                Copy
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setTransfer({ kind: "copy", entries: selectedEntries });
                  setDestination(currentPath);
                  setContextMenu(null);
                }}
              >
                Copy to…
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setTransfer({ kind: "move", entries: selectedEntries });
                  setDestination(currentPath);
                  setContextMenu(null);
                }}
              >
                Move to…
              </button>
            </>
          ) : (
            <button
              role="menuitem"
              disabled={!clipboard}
              onClick={() => {
                void runPaste();
                setContextMenu(null);
              }}
            >
              Paste
            </button>
          )}
          {selectedSingle?.kind === "file" ? (
            <button
              role="menuitem"
              onClick={() => {
                void download(selectedSingle);
                setContextMenu(null);
              }}
            >
              Download
            </button>
          ) : null}
          {selectedSingle ? (
            <button
              role="menuitem"
              onClick={() => {
                startRename(selectedSingle);
                setContextMenu(null);
              }}
            >
              Rename
            </button>
          ) : null}
          {selectedEntries.length ? (
            <button
              role="menuitem"
              onClick={() => {
                setArchive({ kind: "create", entries: selectedEntries });
                setArchiveName(selectedSingle?.name || "archive");
                setContextMenu(null);
              }}
            >
              Compress…
            </button>
          ) : null}
          {canExtract && selectedSingle ? (
            <button
              role="menuitem"
              onClick={() => {
                setArchive({ kind: "extract", entry: selectedSingle });
                setContextMenu(null);
              }}
            >
              Extract…
            </button>
          ) : null}
          {selectedSingle ? (
            <button
              role="menuitem"
              onClick={() => {
                startProperties(selectedSingle);
                setContextMenu(null);
              }}
            >
              Properties
            </button>
          ) : null}
          {selectedEntries.length ? (
            <button
              role="menuitem"
              className="is-danger"
              onClick={() => {
                setPermanentDelete(false);
                setDeleteEntries(selectedEntries);
                setContextMenu(null);
              }}
            >
              Move to trash
            </button>
          ) : (
            <>
              <button
                role="menuitem"
                onClick={() => {
                  startCreate("directory");
                  setContextMenu(null);
                }}
              >
                New folder
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  startCreate("file");
                  setContextMenu(null);
                }}
              >
                New file
              </button>
            </>
          )}
        </div>
      ) : null}

      <Modal
        open={Boolean(createKind)}
        size="sm"
        modalHeading={`Create ${createKind === "file" ? "file" : "folder"}`}
        primaryButtonText={busy ? "Creating…" : "Create"}
        secondaryButtonText="Cancel"
        primaryButtonDisabled={busy || !createName.trim()}
        selectorPrimaryFocus="#create-name"
        onRequestClose={() => setCreateKind(null)}
        onRequestSubmit={() => void create()}
      >
        <TextInput
          id="create-name"
          labelText="Name"
          value={createName}
          onChange={(event) => setCreateName(event.target.value)}
        />
      </Modal>

      <Modal
        open={Boolean(renameEntry)}
        size="sm"
        modalHeading="Rename item"
        primaryButtonText={busy ? "Renaming…" : "Rename"}
        secondaryButtonText="Cancel"
        primaryButtonDisabled={busy || !renameName.trim()}
        selectorPrimaryFocus="#rename-name"
        onRequestClose={() => setRenameEntry(null)}
        onRequestSubmit={() => void rename()}
      >
        <TextInput
          id="rename-name"
          labelText="New name"
          value={renameName}
          onChange={(event) => setRenameName(event.target.value)}
        />
      </Modal>

      <Modal
        open={Boolean(transfer)}
        size="sm"
        modalHeading={transfer?.kind === "copy" ? "Copy items" : "Move items"}
        primaryButtonText={transfer?.kind === "copy" ? "Copy" : "Move"}
        secondaryButtonText="Cancel"
        onRequestClose={() => setTransfer(null)}
        onRequestSubmit={() =>
          transfer && void runPaste({ kind: transfer.kind, entries: transfer.entries }, destination)
        }
      >
        <div className="wfm-modal-stack">
          <TextInput
            id="destination-path"
            labelText="Destination"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
          />
          <Button kind="tertiary" onClick={() => setPickerOpen(true)}>
            Browse folders
          </Button>
          <Select
            id="conflict-policy"
            labelText="If an item already exists"
            value={conflict}
            onChange={(event) => setConflict(event.target.value as ConflictPolicy)}
          >
            <SelectItem value="keep-both" text="Keep both" />
            <SelectItem value="skip" text="Skip" />
            <SelectItem value="replace" text="Replace" />
            <SelectItem value="error" text="Stop with an error" />
          </Select>
        </div>
      </Modal>

      <Modal
        open={pickerOpen}
        size="sm"
        modalHeading="Choose destination folder"
        primaryButtonText="Choose this folder"
        secondaryButtonText="Cancel"
        onRequestClose={() => setPickerOpen(false)}
        onRequestSubmit={() => {
          setDestination(pickerPath);
          setPickerOpen(false);
        }}
      >
        <div className="wfm-folder-picker">
          <div className="wfm-folder-picker__path">
            <Button
              hasIconOnly
              iconDescription="Parent folder"
              kind="ghost"
              renderIcon={ArrowUp}
              disabled={pickerPath === "/"}
              onClick={() => void loadPicker(parentPath(pickerPath))}
            />
            <code>{pickerPath}</code>
          </div>
          {pickerLoading ? (
            <InlineLoading description="Loading folders…" />
          ) : (
            pickerEntries.map((entry) => (
              <button key={entry.path} onClick={() => void loadPicker(entry.path)}>
                <Folder size={20} />
                {entry.name}
              </button>
            ))
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(previewEntry)}
        size="lg"
        hasScrollingContent
        modalHeading={previewEntry?.name || "File viewer"}
        modalLabel={previewEntry?.path}
        primaryButtonText={
          previewEntry && mediaKind(previewEntry) !== "text"
            ? "Download"
            : saving
              ? "Saving…"
              : "Save"
        }
        secondaryButtonText="Close"
        primaryButtonDisabled={saving || previewLoading}
        onRequestClose={() => setPreviewEntry(null)}
        onRequestSubmit={() =>
          previewEntry &&
          (mediaKind(previewEntry) === "text" ? void save() : void download(previewEntry))
        }
      >
        {previewEntry && mediaKind(previewEntry) === "image" ? (
          <img className="wfm-media-preview" src={fileUrl(previewEntry)} alt={previewEntry.name} />
        ) : previewEntry && mediaKind(previewEntry) === "audio" ? (
          <audio className="wfm-media-preview" src={fileUrl(previewEntry)} controls />
        ) : previewEntry && mediaKind(previewEntry) === "video" ? (
          <video className="wfm-media-preview" src={fileUrl(previewEntry)} controls />
        ) : previewEntry && mediaKind(previewEntry) === "pdf" ? (
          <iframe
            className="wfm-pdf-preview"
            src={fileUrl(previewEntry)}
            title={previewEntry.name}
          />
        ) : previewLoading ? (
          <InlineLoading description="Loading file…" />
        ) : (
          <TextArea
            id="file-editor"
            className="wfm-editor-textarea"
            labelText="File contents"
            rows={18}
            value={editorContent}
            onChange={(event) => setEditorContent(event.target.value)}
          />
        )}
      </Modal>

      <Modal
        open={deleteEntries.length > 0}
        danger
        size="sm"
        modalHeading={
          permanentDelete
            ? `Permanently delete ${deleteEntries.length} item(s)?`
            : `Move ${deleteEntries.length} item(s) to trash?`
        }
        primaryButtonText={
          busy ? "Working…" : permanentDelete ? "Delete permanently" : "Move to trash"
        }
        secondaryButtonText="Cancel"
        primaryButtonDisabled={busy}
        onRequestClose={() => {
          setDeleteEntries([]);
          setPermanentDelete(false);
        }}
        onRequestSubmit={() => void remove()}
      >
        {permanentDelete
          ? "This action cannot be undone. The selected items will not be moved to Trash."
          : "The selection can be restored later from Trash."}
      </Modal>

      <Modal
        open={Boolean(propertiesEntry)}
        size="sm"
        modalHeading="Properties"
        modalLabel={propertiesEntry?.path}
        primaryButtonText={busy ? "Saving…" : "Save changes"}
        secondaryButtonText="Cancel"
        primaryButtonDisabled={
          busy ||
          !/^[0-7]{3,4}$/.test(propertyMode) ||
          !/^\d+$/.test(propertyUid) ||
          !/^\d+$/.test(propertyGid)
        }
        onRequestClose={() => setPropertiesEntry(null)}
        onRequestSubmit={() => void saveProperties()}
      >
        {propertiesEntry ? (
          <div className="wfm-modal-stack">
            <dl className="wfm-properties">
              <dt>Type</dt>
              <dd>
                {propertiesEntry.kind} · {propertiesEntry.mime}
              </dd>
              <dt>Size</dt>
              <dd>{formatBytes(propertiesEntry.size)}</dd>
              <dt>Modified</dt>
              <dd>{formatDate(propertiesEntry.modifiedAt)}</dd>
              <dt>Accessed</dt>
              <dd>{formatDate(propertiesEntry.accessedAt)}</dd>
              {propertiesEntry.linkTarget ? (
                <>
                  <dt>Link target</dt>
                  <dd>{propertiesEntry.linkTarget}</dd>
                </>
              ) : null}
            </dl>
            <TextInput
              id="property-mode"
              labelText="Permissions (octal)"
              value={propertyMode}
              onChange={(event) => setPropertyMode(event.target.value)}
            />
            <TextInput
              id="property-uid"
              labelText="Owner UID"
              value={propertyUid}
              onChange={(event) => setPropertyUid(event.target.value)}
            />
            <TextInput
              id="property-gid"
              labelText="Group GID"
              value={propertyGid}
              onChange={(event) => setPropertyGid(event.target.value)}
            />
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(archive)}
        size="sm"
        modalHeading={archive?.kind === "create" ? "Compress selected items" : "Extract archive"}
        primaryButtonText={
          busy ? "Working…" : archive?.kind === "create" ? "Create archive" : "Extract"
        }
        secondaryButtonText="Cancel"
        primaryButtonDisabled={busy || (archive?.kind === "create" && !archiveName.trim())}
        onRequestClose={() => setArchive(null)}
        onRequestSubmit={() => void runArchive()}
      >
        <div className="wfm-modal-stack">
          {archive?.kind === "create" ? (
            <>
              <TextInput
                id="archive-name"
                labelText="Archive name"
                value={archiveName}
                onChange={(event) => setArchiveName(event.target.value)}
              />
              <Select
                id="archive-format"
                labelText="Format"
                value={archiveFormat}
                onChange={(event) => setArchiveFormat(event.target.value as "zip" | "tar.gz")}
              >
                <SelectItem value="zip" text="ZIP" />
                <SelectItem value="tar.gz" text="TAR.GZ" />
              </Select>
            </>
          ) : (
            <>
              <Select
                id="extract-mode"
                labelText="Destination"
                value={extractMode}
                onChange={(event) => setExtractMode(event.target.value as "here" | "subfolder")}
              >
                <SelectItem value="subfolder" text="New subfolder" />
                <SelectItem value="here" text="Extract here" />
              </Select>
              <Select
                id="extract-conflict"
                labelText="If an item already exists"
                value={conflict === "error" ? "keep-both" : conflict}
                onChange={(event) => setConflict(event.target.value as ConflictPolicy)}
              >
                <SelectItem value="keep-both" text="Keep both" />
                <SelectItem value="skip" text="Skip" />
                <SelectItem value="replace" text="Replace" />
              </Select>
            </>
          )}
        </div>
      </Modal>
    </section>
  );
}
