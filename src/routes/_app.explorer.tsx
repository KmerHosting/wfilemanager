import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import {
  ArrowUp,
  Copy,
  Download,
  File as FileIcon,
  FilePlus2,
  Folder,
  FolderPlus,
  MoveRight,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Trash2,
  UploadCloud,
} from "@/components/ui/icons";
import { toast } from "sonner";
import { localApi, type LocalFileEntry, type ProgressState } from "@/lib/local-api";
import { formatBytes, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
  const [transfer, setTransfer] = useState<{ kind: TransferKind; entry: LocalFileEntry } | null>(null);
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
      toast.error(cause instanceof Error ? cause.message : "This file cannot be previewed as text");
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
      toast.success(createKind === "file" ? "File created" : "Folder created");
      setCreateKind(null);
      setCreateName("");
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Creation failed");
    }
  };

  const rename = async () => {
    if (!renameEntry || !renameName.trim()) return;
    try {
      await localApi.rename(renameEntry.path, renameName.trim());
      toast.success("Renamed");
      setRenameEntry(null);
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Rename failed");
    }
  };

  const remove = async () => {
    if (!deleteEntry) return;
    try {
      await localApi.trash.move(deleteEntry.path);
      toast.success("Moved to trash");
      setDeleteEntry(null);
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Delete failed");
    }
  };

  const transferEntry = async () => {
    if (!transfer || !destination.trim()) return;
    try {
      if (transfer.kind === "copy") await localApi.copy(transfer.entry.path, destination.trim());
      else await localApi.move(transfer.entry.path, destination.trim());
      toast.success(transfer.kind === "copy" ? "Copied" : "Moved");
      setTransfer(null);
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "File operation failed");
    }
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setProgress({ loaded: 0, total: 0, percent: 0 });
    try {
      await localApi.upload(currentPath, files, setProgress);
      toast.success(`${files.length} file(s) uploaded`);
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Upload failed");
    } finally {
      window.setTimeout(() => setProgress(null), 800);
      if (uploadInput.current) uploadInput.current.value = "";
    }
  };

  const download = async (entry: LocalFileEntry) => {
    try {
      await localApi.download(entry.path, entry.name);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Download failed");
    }
  };

  const save = async () => {
    if (!previewEntry) return;
    setSaving(true);
    try {
      await localApi.save(previewEntry.path, editorContent, previewEntry.modifiedAt);
      toast.success("File saved");
      setPreviewEntry(null);
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="wfm-page">
      <header className="wfm-page__header">
        <div>
          <p className="wfm-eyebrow">Server files</p>
          <h1>File Explorer</h1>
          <p>Browse and manage files directly on this Linux server.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="icon" onClick={() => void load()} aria-label="Refresh">
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
          <Button variant="outline" onClick={() => { setCreateKind("directory"); setCreateName(""); }}>
            <FolderPlus className="mr-2 h-4 w-4" />Folder
          </Button>
          <Button variant="outline" onClick={() => { setCreateKind("file"); setCreateName(""); }}>
            <FilePlus2 className="mr-2 h-4 w-4" />File
          </Button>
          <Button onClick={() => uploadInput.current?.click()}>
            <UploadCloud className="mr-2 h-4 w-4" />Upload
          </Button>
          <input ref={uploadInput} type="file" multiple className="hidden" onChange={(event) => void upload(event.target.files)} />
        </div>
      </header>

      <div className="mb-4 flex flex-col gap-2 md:flex-row">
        <form
          className="flex flex-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setPath(pathInput);
          }}
        >
          <Button type="button" variant="outline" size="icon" disabled={currentPath === "/"} onClick={() => setPath(parentPath(currentPath))}>
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Input value={pathInput} onChange={(event) => setPathInput(event.target.value)} className="font-mono" />
        </form>
        <div className="relative md:w-80">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(event) => setSearch(event.target.value)} placeholder="Search this folder" className="pl-9" />
        </div>
      </div>

      {progress && (
        <div className="mb-4 rounded-md border p-3">
          <div className="mb-2 flex justify-between text-xs text-muted-foreground">
            <span>{progress.detail || "Uploading"}</span>
            <span>{progress.percent}%</span>
          </div>
          <Progress value={progress.percent} />
        </div>
      )}

      {error && <div className="mb-4 rounded-md border border-destructive/30 p-3 text-sm text-destructive">{error}</div>}

      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-28">Size</TableHead>
              <TableHead className="w-44">Modified</TableHead>
              <TableHead className="w-80 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="py-12 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : visibleEntries.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="py-12 text-center text-muted-foreground">This folder is empty.</TableCell></TableRow>
            ) : (
              visibleEntries.map((entry) => (
                <TableRow key={entry.path}>
                  <TableCell>
                    <button className="flex max-w-full items-center gap-2 text-left hover:underline" onClick={() => void openEntry(entry)}>
                      {entry.kind === "directory" ? <Folder className="h-4 w-4 shrink-0" /> : <FileIcon className="h-4 w-4 shrink-0" />}
                      <span className="truncate">{entry.name}</span>
                    </button>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{entry.kind === "file" ? formatBytes(entry.size) : "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(entry.modifiedAt)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {entry.kind === "file" && (
                        <Button size="sm" variant="ghost" onClick={() => void download(entry)}><Download className="mr-1 h-3.5 w-3.5" />Download</Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => { setRenameEntry(entry); setRenameName(entry.name); }}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => { setTransfer({ kind: "copy", entry }); setDestination(currentPath); }}><Copy className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => { setTransfer({ kind: "move", entry }); setDestination(currentPath); }}><MoveRight className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteEntry(entry)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(createKind)} onOpenChange={(open) => !open && setCreateKind(null)}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Create {createKind === "file" ? "file" : "folder"}</DialogTitle></DialogHeader>
          <Input autoFocus value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder="Name" />
          <DialogFooter><Button onClick={() => void create()} disabled={!createName.trim()}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(renameEntry)} onOpenChange={(open) => !open && setRenameEntry(null)}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Rename</DialogTitle></DialogHeader>
          <Input autoFocus value={renameName} onChange={(event) => setRenameName(event.target.value)} />
          <DialogFooter><Button onClick={() => void rename()} disabled={!renameName.trim()}>Rename</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(transfer)} onOpenChange={(open) => !open && setTransfer(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{transfer?.kind === "copy" ? "Copy" : "Move"}</DialogTitle>
            <DialogDescription>Enter the destination directory.</DialogDescription>
          </DialogHeader>
          <Input autoFocus value={destination} onChange={(event) => setDestination(event.target.value)} className="font-mono" />
          <DialogFooter><Button onClick={() => void transferEntry()} disabled={!destination.trim()}>{transfer?.kind === "copy" ? "Copy" : "Move"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(previewEntry)} onOpenChange={(open) => !open && setPreviewEntry(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{previewEntry?.name}</DialogTitle>
            <DialogDescription>Simple text editor. Binary or oversized files are not opened here.</DialogDescription>
          </DialogHeader>
          {previewLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
          ) : (
            <textarea
              className="min-h-[55vh] w-full resize-y rounded-md border bg-background p-3 font-mono text-sm outline-none"
              value={editorContent}
              onChange={(event) => setEditorContent(event.target.value)}
            />
          )}
          <DialogFooter>
            <Button onClick={() => void save()} disabled={saving || previewLoading}>
              <Save className="mr-2 h-4 w-4" />{saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteEntry)} onOpenChange={(open) => !open && setDeleteEntry(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move to trash?</AlertDialogTitle>
            <AlertDialogDescription>{deleteEntry?.path}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()}>Move to trash</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
