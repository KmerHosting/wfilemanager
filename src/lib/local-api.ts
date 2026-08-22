export interface LocalFileEntry {
  name: string;
  path: string;
  kind: "file" | "directory" | "symlink" | "other";
  size: number;
  mode: string;
  uid: number;
  gid: number;
  modifiedAt: string;
  createdAt: string;
  accessedAt: string;
  hidden: boolean;
  linkTarget?: string;
  linkKind?: "file" | "directory" | "other";
  mime: string;
  readable: boolean;
  writable: boolean;
}

export interface DirectoryResult {
  path: string;
  realPath: string;
  entries: LocalFileEntry[];
  total?: number;
  nextCursor?: string | null;
  truncated?: boolean;
}

export interface TrashItem {
  id: string;
  name: string;
  originalPath: string;
  deletedAt: string;
  deletedBy: string;
  size: number;
  kind: LocalFileEntry["kind"];
}

export interface TrashResult {
  items: TrashItem[];
  totalSize: number;
}

export interface ProgressState {
  loaded: number;
  total: number;
  percent: number;
  detail?: string;
}

const OPERATION_JOB_STATUSES = {
  queued: "queued",
  running: "running",
  cancelling: "cancelling",
  cancelled: "cancelled",
  completed: "completed",
  failed: "failed",
  interrupted: "interrupted",
} as const;

export type OperationJobStatus =
  (typeof OPERATION_JOB_STATUSES)[keyof typeof OPERATION_JOB_STATUSES];

export interface OperationJob {
  id: string;
  operation: "copy" | "move" | "delete";
  status: OperationJobStatus;
  progress: number;
  processedBytes: number;
  totalBytes: number;
  processedItems: number;
  totalItems: number;
  currentItem?: string;
  error?: string;
  source: string;
  destinationDirectory?: string;
  cancellable: boolean;
  result?: Record<string, unknown>;
}

export type ConflictPolicy = "error" | "skip" | "replace" | "keep-both";

export type OperationProgressCallback = (job: OperationJob) => void;

export interface FileManagerOverview {
  hostname: string;
  ipv4: string | null;
  platform: string;
  release: string;
  architecture: string;
  uptime: number;
  node: string;
  loginUsers: number;
  root: { path: string; entries: number | null; readable: boolean; writable: boolean };
  locations: Array<{
    path: string;
    exists: boolean;
    readable: boolean;
    writable: boolean;
    entries: number | null;
  }>;
  availableLocations: number;
  writableLocations: number;
  totalCommonLocations: number;
  editorLimitBytes: number;
  uploadLimitBytes: number;
  protectedPseudoFilesystems: string[];
  os: { id: string; name: string; versionId: string; versionCodename: string; prettyName: string };
  generatedAt: string;
}

export type UpdatePhase =
  | "idle"
  | "checking"
  | "downloading"
  | "verifying"
  | "extracting"
  | "switching"
  | "restarting"
  | "health-check"
  | "completed"
  | "failed"
  | "rolling-back";

export interface UpdateState {
  status: UpdatePhase;
  progress: number;
  message: string;
  currentVersion?: string | null;
  targetVersion?: string | null;
  previousVersion?: string | null;
  startedAt?: string | null;
  updatedAt?: string | null;
  error?: string | null;
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  sourceConfigured: boolean;
  downloadUrl?: string | null;
  notes?: string | null;
  publishedAt?: string | null;
  size?: number | null;
  sha256?: string | null;
  channel?: string | null;
  checkedAt: string;
  state: UpdateState;
  rollbackAvailable: boolean;
}

async function parse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      (payload as { error?: string }).error || `Local API request failed (${response.status})`,
    );
  }
  return payload as T;
}

async function get<T>(action: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams({ action, ...params });
  return parse<T>(
    await fetch(`/api/local?${query}`, {
      credentials: "same-origin",
      cache: "no-store",
    }),
  );
}

async function post<T>(action: string, body: Record<string, unknown>) {
  return parse<T>(
    await fetch(`/api/local?action=${encodeURIComponent(action)}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function uploadSingleFile(
  directory: string,
  file: File,
  completed: number,
  total: number,
  onProgress?: (progress: ProgressState) => void,
) {
  return new Promise<LocalFileEntry>((resolve, reject) => {
    const query = new URLSearchParams({ action: "upload-raw", path: directory, name: file.name });
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/local?${query}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      const loaded = Math.min(total, completed + event.loaded);
      onProgress?.({
        loaded,
        total,
        percent: total ? Math.round((loaded / total) * 100) : 100,
        detail: file.name,
      });
    };
    xhr.onerror = () => reject(new Error(`Upload connection failed for ${file.name}`));
    xhr.onload = () => {
      let payload: unknown = {};
      try {
        payload = JSON.parse(xhr.responseText || "{}");
      } catch {
        /* handled below */
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(
          new Error(
            (payload as { error?: string }).error ||
              `Upload failed for ${file.name} (${xhr.status})`,
          ),
        );
        return;
      }
      resolve(payload as LocalFileEntry);
    };
    xhr.send(file);
  });
}

async function uploadFiles(
  directory: string,
  files: FileList | File[],
  onProgress?: (progress: ProgressState) => void,
) {
  const values = Array.from(files);
  const total = values.reduce((sum, file) => sum + file.size, 0);
  let completed = 0;
  const uploaded: LocalFileEntry[] = [];

  onProgress?.({ loaded: 0, total, percent: 0 });
  for (const file of values) {
    const entry = await uploadSingleFile(directory, file, completed, total, onProgress);
    completed += file.size;
    uploaded.push(entry);
  }
  onProgress?.({ loaded: total, total, percent: 100 });
  return { uploaded };
}

async function runJob(
  operation: "copy" | "move" | "delete",
  source: string,
  destination: string | undefined,
  onProgress?: OperationProgressCallback,
  conflict: ConflictPolicy = "error",
) {
  const started = await post<{ job: OperationJob }>("job-start", {
    operation,
    source,
    destination,
    conflict,
  });
  onProgress?.(started.job);

  const deadline = Date.now() + 24 * 60 * 60 * 1000;
  let delay = 400;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(1500, Math.round(delay * 1.25));
    const current = await get<{ job: OperationJob }>("job", { id: started.job.id });
    onProgress?.(current.job);
    if (current.job.status === "completed") return current.job;
    if (["failed", "cancelled", "interrupted"].includes(current.job.status)) {
      throw new Error(current.job.error || `${operation} ${current.job.status}`);
    }
  }

  throw new Error(`${operation} did not complete within 24 hours`);
}

async function runBatchJobs(
  operation: "copy" | "move" | "delete",
  sources: string[],
  destination: string | undefined,
  conflict: ConflictPolicy,
  onProgress?: OperationProgressCallback,
) {
  const jobs: OperationJob[] = [];
  for (const source of sources) {
    jobs.push(await runJob(operation, source, destination, onProgress, conflict));
  }
  return { jobs };
}

function startBrowserDownload(path: string, filename: string) {
  const query = new URLSearchParams({ action: "download", path });
  const link = document.createElement("a");
  link.href = `/api/local?${query}`;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  return Promise.resolve({ downloaded: path, started: true });
}

export const localApi = {
  list: (path: string, cursor?: string, query?: string, limit?: number) =>
    get<DirectoryResult>("list", {
      path,
      ...(cursor ? { cursor } : {}),
      ...(query ? { q: query } : {}),
      ...(limit ? { limit: String(limit) } : {}),
    }),
  read: (path: string) =>
    get<{
      path: string;
      content: string;
      size: number;
      mime: string;
      modifiedAt: string;
      mode: string;
    }>("read", { path }),
  createFile: (path: string, name: string) => post<LocalFileEntry>("create-file", { path, name }),
  createDirectory: (path: string, name: string) =>
    post<LocalFileEntry>("create-directory", { path, name }),
  save: (path: string, content: string, expectedModifiedAt?: string) =>
    post<LocalFileEntry>("save", { path, content, expectedModifiedAt }),
  rename: (path: string, name: string) =>
    post<{ source: string; destination: string }>("rename", { path, name }),
  copy: (source: string, destination: string, onProgress?: OperationProgressCallback) =>
    runJob("copy", source, destination, onProgress),
  move: (source: string, destination: string, onProgress?: OperationProgressCallback) =>
    runJob("move", source, destination, onProgress),
  copyMany: (
    sources: string[],
    destination: string,
    conflict: ConflictPolicy,
    onProgress?: OperationProgressCallback,
  ) => runBatchJobs("copy", sources, destination, conflict, onProgress),
  moveMany: (
    sources: string[],
    destination: string,
    conflict: ConflictPolicy,
    onProgress?: OperationProgressCallback,
  ) => runBatchJobs("move", sources, destination, conflict, onProgress),
  deleteMany: (sources: string[], onProgress?: OperationProgressCallback) =>
    runBatchJobs("delete", sources, undefined, "error", onProgress),
  jobs: {
    list: () => get<{ jobs: OperationJob[] }>("jobs"),
    cancel: (id: string) => post<{ job: OperationJob }>("job-cancel", { id }),
  },
  upload: uploadFiles,
  download: startBrowserDownload,
  trash: {
    list: () => get<TrashResult>("trash-list"),
    move: (path: string) => post<{ item: TrashItem }>("trash-move", { path }),
    moveMany: (paths: string[]) => post<{ items: TrashItem[] }>("trash-move-many", { paths }),
    restore: (id: string) => post<{ restored: string }>("trash-restore", { id }),
    delete: (id: string) => post<{ deleted: string }>("trash-delete", { id }),
    empty: () => post<{ deletedItems: number; deletedBytes: number }>("trash-empty", {}),
  },
  chmod: (path: string, mode: string) =>
    post<{ path: string; mode: string }>("chmod", { path, mode }),
  chown: (path: string, uid: number, gid: number) =>
    post<{ path: string; uid: number; gid: number }>("chown", { path, uid, gid }),
  archive: {
    create: (input: {
      sources: string[];
      destination: string;
      name: string;
      format: "zip" | "tar.gz";
    }) => post<{ path: string; name: string; format: string }>("archive-create", input),
    extract: (input: {
      archive: string;
      destination: string;
      mode: "here" | "subfolder";
      conflict: "skip" | "replace" | "keep-both";
    }) =>
      post<{ archive: string; committed: string[]; entries: number; bytes: number }>(
        "archive-extract",
        input,
      ),
  },
  overview: () => get<FileManagerOverview>("overview"),
  updateInfo: () => get<UpdateInfo>("update-info"),
  updateStatus: () => get<UpdateInfo>("update-status"),
  installUpdate: () => post<{ success: true; state: UpdateState }>("update-install", {}),
  rollbackUpdate: () => post<{ success: true; state: UpdateState }>("update-rollback", {}),
};
