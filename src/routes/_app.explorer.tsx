import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import {
  Add,
  ArrowUp,
  Copy,
  Document,
  Download,
  Edit,
  Folder,
  Move,
  Renew,
  TrashCan,
  Upload,
} from "@carbon/icons-react";
import {
  Button,
  InlineLoading,
  InlineNotification,
  Modal,
  ProgressBar,
  Search,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TextArea,
  TextInput,
} from "@carbon/react";
import { formatBytes, formatDate } from "@/lib/format";
import {
  localApi,
  type LocalFileEntry,
  type OperationJob,
  type ProgressState,
} from "@/lib/local-api";
import { useNotifications } from "@/lib/notifications";

const searchSchema = z.object({
  path: z.string().optional(),
  q: z.string().optional(),
});

export const Route = createFileRoute("/_app/explorer")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "File Explorer — wFileManager" }] }),
  component: Explorer,
});

type CreateKind = "file" | "directory";
type TransferKind = "copy" | "move";

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

function Explorer() {
  const { path = "/", q = "" } = Route.useSearch();
  const navigate = useNavigate({ from: "/explorer" });
  const { notify } = useNotifications();
  const currentPath = normalizePath(path);
  const uploadInput = useRef<HTMLInputElement>(null);

  const [entries, setEntries] = useState<LocalFileEntry[]>([]);
  const [pathInput, setPathInput] = useState(currentPath);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createKind, setCreateKind] = useState<CreateKind | null>(null);
  const [createName, setCreateName] = useState("");
  const [renameEntry, setRenameEntry] = useState<LocalFileEntry | null>(null);
  const [renameName, setRenameName] = useState("");
  const [deleteEntry, setDeleteEntry] = useState<LocalFileEntry | null>(null);
  const [transfer, setTransfer] = useState<{ kind: TransferKind; entry: LocalFileEntry } | null>(
    null,
  );
  const [destination, setDestination] = useState(currentPath);
  const [previewEntry, setPreviewEntry] = useState<LocalFileEntry | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);

  const setPath = (value: string) => {
    navigate({
      search: (previous: { path?: string; q?: string }) => ({
        ...previous,
        path: normalizePath(value),
      }),
    });
  };

  const setSearch = (value: string) => {
    navigate({
      search: (previous: { path?: string; q?: string }) => ({
        ...previous,
        q: value || undefined,
      }),
    });
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await localApi.list(currentPath);
      setEntries(result.entries);
      setPathInput(result.path);
    } catch (cause) {
      setEntries([]);
      setError(cause instanceof Error ? cause.message : "Unable to load this directory");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [currentPath]);

  const visibleEntries = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter((entry) => !needle || entry.name.toLowerCase().includes(needle));
  }, [entries, q]);

  const openEntry = async (entry: LocalFileEntry) => {
    if (entry.kind === "directory") {
      setPath(entry.path);
      return;
    }

    setPreviewEntry(entry);
    setPreviewLoading(true);
    setEditorContent("");
    try {
      const result = await localApi.read(entry.path);
      setEditorContent(result.content);
    } catch (cause) {
      notify({
        kind: "error",
        title: "Unable to open file",
        subtitle: cause instanceof Error ? cause.message : "This file cannot be previewed as text.",
      });
      setPreviewEntry(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const create = async () => {
    const name = createName.trim();
    if (!createKind || !name) return;
    try {
      if (createKind === "file") await localApi.createFile(currentPath, name);
      else await localApi.createDirectory(currentPath, name);
      notify({
        kind: "success",
        title: createKind === "file" ? "File created" : "Folder created",
        subtitle: name,
      });
      setCreateKind(null);
      setCreateName("");
      await load();
    } catch (cause) {
      notify({
        kind: "error",
        title: "Creation failed",
        subtitle: cause instanceof Error ? cause.message : "Unable to create the item.",
      });
    }
  };

  const rename = async () => {
    if (!renameEntry || !renameName.trim()) return;
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
    }
  };

  const remove = async () => {
    if (!deleteEntry) return;
    try {
      await localApi.trash.move(deleteEntry.path);
      notify({ kind: "success", title: "Moved to trash", subtitle: deleteEntry.name });
      setDeleteEntry(null);
      await load();
    } catch (cause) {
      notify({
        kind: "error",
        title: "Delete failed",
        subtitle: cause instanceof Error ? cause.message : "Unable to move the item to trash.",
      });
    }
  };

  const transferEntry = async () => {
    if (!transfer || !destination.trim()) return;
    const action = transfer.kind === "copy" ? "Copy" : "Move";
    const noticeId = notify({
      kind: "info",
      title: `${action} started`,
      subtitle: transfer.entry.name,
      timeout: 0,
    });
    const report = (job: OperationJob) => {
      notify({
        id: noticeId,
        kind: "info",
        title: `${action} in progress · ${Math.max(0, Math.min(100, job.progress))}%`,
        subtitle: job.currentItem || transfer.entry.name,
        timeout: 0,
      });
    };

    try {
      if (transfer.kind === "copy") {
        await localApi.copy(transfer.entry.path, destination.trim(), report);
      } else {
        await localApi.move(transfer.entry.path, destination.trim(), report);
      }
      notify({
        id: noticeId,
        kind: "success",
        title: `${action} completed`,
        subtitle: transfer.entry.name,
        timeout: 3500,
      });
      setTransfer(null);
      await load();
    } catch (cause) {
      notify({
        id: noticeId,
        kind: "error",
        title: `${action} failed`,
        subtitle: cause instanceof Error ? cause.message : "The operation did not complete.",
        timeout: 0,
      });
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

  return (
    <section className="wfm-page" aria-labelledby="explorer-title">
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
            onClick={() => {
              setCreateKind("directory");
              setCreateName("");
            }}
          >
            New folder
          </Button>
          <Button
            kind="tertiary"
            size="sm"
            renderIcon={Add}
            onClick={() => {
              setCreateKind("file");
              setCreateName("");
            }}
          >
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
          <Button
            type="button"
            kind="ghost"
            size="md"
            renderIcon={ArrowUp}
            disabled={currentPath === "/"}
            onClick={() => setPath(parentPath(currentPath))}
          >
            Up
          </Button>
          <TextInput
            id="current-path"
            labelText="Path"
            value={pathInput}
            onChange={(event) => setPathInput(event.target.value)}
            onBlur={() => setPathInput(normalizePath(pathInput))}
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

      {error ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Unable to load this directory"
          subtitle={error}
        />
      ) : null}

      <div className="wfm-table-wrap">
        <TableContainer
          title={currentPath}
          description={`${visibleEntries.length} visible item(s)`}
        >
          <Table size="lg" useZebraStyles={false}>
            <TableHead>
              <TableRow>
                <TableHeader>Name</TableHeader>
                <TableHeader>Size</TableHeader>
                <TableHeader>Modified</TableHeader>
                <TableHeader>Actions</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4}>
                    <InlineLoading description="Loading directory…" />
                  </TableCell>
                </TableRow>
              ) : visibleEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4}>This folder is empty.</TableCell>
                </TableRow>
              ) : (
                visibleEntries.map((entry) => (
                  <TableRow key={entry.path}>
                    <TableCell>
                      <Button
                        kind="ghost"
                        size="sm"
                        renderIcon={entry.kind === "directory" ? Folder : Document}
                        onClick={() => void openEntry(entry)}
                      >
                        {entry.name}
                      </Button>
                    </TableCell>
                    <TableCell>{entry.kind === "file" ? formatBytes(entry.size) : "—"}</TableCell>
                    <TableCell>{formatDate(entry.modifiedAt)}</TableCell>
                    <TableCell>
                      <div className="wfm-table-actions">
                        {entry.kind === "file" ? (
                          <Button
                            kind="ghost"
                            size="sm"
                            renderIcon={Download}
                            onClick={() => void download(entry)}
                          >
                            Download
                          </Button>
                        ) : null}
                        <Button
                          kind="ghost"
                          size="sm"
                          renderIcon={Edit}
                          onClick={() => {
                            setRenameEntry(entry);
                            setRenameName(entry.name);
                          }}
                        >
                          Rename
                        </Button>
                        <Button
                          kind="ghost"
                          size="sm"
                          renderIcon={Copy}
                          onClick={() => {
                            setTransfer({ kind: "copy", entry });
                            setDestination(currentPath);
                          }}
                        >
                          Copy
                        </Button>
                        <Button
                          kind="ghost"
                          size="sm"
                          renderIcon={Move}
                          onClick={() => {
                            setTransfer({ kind: "move", entry });
                            setDestination(currentPath);
                          }}
                        >
                          Move
                        </Button>
                        <Button
                          kind="danger--ghost"
                          size="sm"
                          renderIcon={TrashCan}
                          onClick={() => setDeleteEntry(entry)}
                        >
                          Trash
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </div>

      <Modal
        open={Boolean(createKind)}
        size="sm"
        modalHeading={`Create ${createKind === "file" ? "file" : "folder"}`}
        primaryButtonText="Create"
        secondaryButtonText="Cancel"
        primaryButtonDisabled={!createName.trim()}
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
        primaryButtonText="Rename"
        secondaryButtonText="Cancel"
        primaryButtonDisabled={!renameName.trim()}
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
        modalHeading={transfer?.kind === "copy" ? "Copy item" : "Move item"}
        primaryButtonText={transfer?.kind === "copy" ? "Copy" : "Move"}
        secondaryButtonText="Cancel"
        primaryButtonDisabled={!destination.trim()}
        selectorPrimaryFocus="#destination-path"
        onRequestClose={() => setTransfer(null)}
        onRequestSubmit={() => void transferEntry()}
      >
        <div className="wfm-modal-stack">
          <p className="wfm-form-helper">Enter the destination directory.</p>
          <TextInput
            id="destination-path"
            labelText="Destination"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={Boolean(previewEntry)}
        size="lg"
        hasScrollingContent
        modalHeading={previewEntry?.name || "File editor"}
        modalLabel={previewEntry?.path}
        primaryButtonText={saving ? "Saving…" : "Save"}
        secondaryButtonText="Close"
        primaryButtonDisabled={saving || previewLoading}
        onRequestClose={() => setPreviewEntry(null)}
        onRequestSubmit={() => void save()}
      >
        {previewLoading ? (
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
        open={Boolean(deleteEntry)}
        danger
        size="sm"
        modalHeading="Move this item to trash?"
        modalLabel={deleteEntry?.path}
        primaryButtonText="Move to trash"
        secondaryButtonText="Cancel"
        onRequestClose={() => setDeleteEntry(null)}
        onRequestSubmit={() => void remove()}
      >
        The item can be restored later from Trash until it is permanently deleted.
      </Modal>
    </section>
  );
}
