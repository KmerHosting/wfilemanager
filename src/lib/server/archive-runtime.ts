import crypto from "node:crypto";
import path from "node:path";
import { execFile } from "node:child_process";
import { lstat, mkdtemp, readdir, realpath, rename, rm, statfs } from "node:fs/promises";
import { promisify } from "node:util";
import { LocalApiError } from "@/lib/server/local-runtime";

const execFileAsync = promisify(execFile);
const BSDTAR = process.env.WFILEMANAGER_BSDTAR || "/usr/bin/bsdtar";
const MAX_ARCHIVE_ENTRIES = Math.max(
  100,
  Number(process.env.WFILEMANAGER_ARCHIVE_MAX_ENTRIES || 100_000),
);
const MAX_EXTRACTED_BYTES = Math.max(
  1024 * 1024,
  Number(process.env.WFILEMANAGER_ARCHIVE_MAX_EXTRACTED_BYTES || 50 * 1024 * 1024 * 1024),
);
const MIN_FREE_BYTES = Math.max(
  256 * 1024 * 1024,
  Number(process.env.WFILEMANAGER_MIN_FREE_BYTES || 1024 * 1024 * 1024),
);
const ARCHIVE_TIMEOUT_MS = Math.max(
  30_000,
  Number(process.env.WFILEMANAGER_ARCHIVE_TIMEOUT_MS || 60 * 60 * 1000),
);

export type ArchiveFormat = "zip" | "tar.gz";
export type ArchiveConflictPolicy = "skip" | "replace" | "keep-both";
export type ExtractMode = "here" | "subfolder";

function archiveExtension(format: ArchiveFormat) {
  return format === "zip" ? ".zip" : ".tar.gz";
}

function safeArchiveName(input: unknown, format: ArchiveFormat) {
  if (typeof input !== "string") throw new LocalApiError(400, "An archive name is required");
  const raw = input.trim();
  if (!raw || raw === "." || raw === ".." || raw.includes("/") || raw.includes("\\"))
    throw new LocalApiError(400, "Invalid archive name");
  const extension = archiveExtension(format);
  return raw.toLowerCase().endsWith(extension) ? raw : `${raw}${extension}`;
}

export function validateArchiveMemberName(name: string) {
  const normalized = name.replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized))
    throw new LocalApiError(415, `Unsafe archive member: ${name}`);
  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => part === ".." || part.includes("\0")))
    throw new LocalApiError(415, `Unsafe archive member: ${name}`);
}

async function ensureBsdtar() {
  try {
    await execFileAsync(BSDTAR, ["--version"], { timeout: 5_000 });
  } catch {
    throw new LocalApiError(
      503,
      "Archive support is unavailable. Install the libarchive-tools package.",
    );
  }
}

async function destinationExists(target: string) {
  return lstat(target)
    .then(() => true)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return false;
      throw error;
    });
}

async function keepBothPath(target: string) {
  if (!(await destinationExists(target))) return target;
  const parsed = path.parse(target);
  for (let index = 2; index < 10_000; index += 1) {
    const candidate = path.join(parsed.dir, `${parsed.name} (${index})${parsed.ext}`);
    if (!(await destinationExists(candidate))) return candidate;
  }
  throw new LocalApiError(409, `Unable to find an available name for ${path.basename(target)}`);
}

async function resolveConflict(target: string, policy: ArchiveConflictPolicy) {
  if (!(await destinationExists(target))) return target;
  if (policy === "skip") return null;
  if (policy === "keep-both") return keepBothPath(target);
  await rm(target, { recursive: true, force: true });
  return target;
}

async function availableBytes(target: string) {
  const filesystem = await statfs(target);
  return Number(filesystem.bavail) * Number(filesystem.bsize);
}

async function verifyExtractedTree(root: string) {
  let entries = 0;
  let bytes = 0;
  const canonicalRoot = await realpath(root);

  async function visit(target: string) {
    entries += 1;
    if (entries > MAX_ARCHIVE_ENTRIES)
      throw new LocalApiError(413, "The archive contains too many entries");
    const info = await lstat(target);
    if (info.isFile()) bytes += info.size;
    else if (info.isSymbolicLink()) {
      const resolved = await realpath(target).catch(() => null);
      if (
        !resolved ||
        (resolved !== canonicalRoot && !resolved.startsWith(`${canonicalRoot}${path.sep}`))
      )
        throw new LocalApiError(415, `Archive contains an unsafe symbolic link: ${target}`);
    } else if (!info.isDirectory()) {
      throw new LocalApiError(415, `Archive contains an unsupported filesystem entry: ${target}`);
    }
    if (bytes > MAX_EXTRACTED_BYTES)
      throw new LocalApiError(413, "The extracted archive exceeds the configured size limit");
    if (info.isDirectory()) {
      for (const name of await readdir(target)) await visit(path.join(target, name));
    }
  }

  for (const name of await readdir(root)) await visit(path.join(root, name));
  return { entries, bytes };
}

function archiveBaseName(filename: string) {
  return (
    filename.replace(/\.(?:tar\.(?:gz|bz2|xz|zst)|tgz|tbz2?|txz|zip|7z|rar)$/i, "") || "archive"
  );
}

export async function createArchive(input: {
  sources: string[];
  destinationDirectory: string;
  name: unknown;
  format: ArchiveFormat;
}) {
  await ensureBsdtar();
  if (!input.sources.length) throw new LocalApiError(400, "Select at least one item");
  const parents = new Set(input.sources.map((source) => path.dirname(source)));
  if (parents.size !== 1)
    throw new LocalApiError(400, "All archived items must come from the same directory");
  const parent = input.sources.length ? path.dirname(input.sources[0]) : input.destinationDirectory;
  const filename = safeArchiveName(input.name, input.format);
  const destination = path.join(input.destinationDirectory, filename);
  if (await destinationExists(destination))
    throw new LocalApiError(409, "An archive with this name already exists");
  const temporary = path.join(
    input.destinationDirectory,
    `.${filename}.wfilemanager-${crypto.randomUUID()}${archiveExtension(input.format)}`,
  );
  const names = input.sources.map((source) => path.basename(source));
  try {
    const args =
      input.format === "zip"
        ? ["-a", "-cf", temporary, "--", ...names]
        : ["-czf", temporary, "--", ...names];
    await execFileAsync(BSDTAR, args, {
      cwd: parent,
      timeout: ARCHIVE_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
    });
    await rename(temporary, destination);
    return { path: destination, name: filename, format: input.format };
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    if (error instanceof LocalApiError) throw error;
    throw new LocalApiError(
      500,
      error instanceof Error ? error.message : "Archive creation failed",
    );
  }
}

export async function extractArchive(input: {
  archive: string;
  destinationDirectory: string;
  mode: ExtractMode;
  conflict: ArchiveConflictPolicy;
}) {
  await ensureBsdtar();
  const listOptions = {
    timeout: ARCHIVE_TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, LC_ALL: "C" },
  };
  const [{ stdout }, { stdout: verbose }] = await Promise.all([
    execFileAsync(BSDTAR, ["-tf", input.archive], listOptions),
    execFileAsync(BSDTAR, ["-tvf", input.archive], listOptions),
  ]).catch((error: Error) => {
    throw new LocalApiError(415, `Unable to read this archive: ${error.message}`);
  });
  const members = stdout.split("\n").filter(Boolean);
  if (members.length > MAX_ARCHIVE_ENTRIES)
    throw new LocalApiError(413, "The archive contains too many entries");
  for (const member of members) validateArchiveMemberName(member);
  for (const line of verbose.split("\n").filter(Boolean)) {
    const type = line.trimStart()[0];
    if (type && type !== "-" && type !== "d")
      throw new LocalApiError(
        415,
        "Archives containing links or special filesystem entries are not supported",
      );
  }
  if ((await availableBytes(input.destinationDirectory)) <= MIN_FREE_BYTES)
    throw new LocalApiError(507, "The destination filesystem does not have enough free space");

  const staging = await mkdtemp(path.join(input.destinationDirectory, ".wfm-extract-"));
  try {
    await execFileAsync(
      BSDTAR,
      ["--no-same-owner", "--no-same-permissions", "-xf", input.archive, "-C", staging],
      { timeout: ARCHIVE_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
    );
    const summary = await verifyExtractedTree(staging);
    const committed: string[] = [];
    if (input.mode === "subfolder") {
      let target = path.join(
        input.destinationDirectory,
        archiveBaseName(path.basename(input.archive)),
      );
      const resolved = await resolveConflict(target, input.conflict);
      if (resolved) {
        target = resolved;
        await rename(staging, target);
        committed.push(target);
      }
    } else {
      for (const name of await readdir(staging)) {
        const source = path.join(staging, name);
        const resolved = await resolveConflict(
          path.join(input.destinationDirectory, name),
          input.conflict,
        );
        if (!resolved) continue;
        await rename(source, resolved);
        committed.push(resolved);
      }
    }
    return { archive: input.archive, committed, ...summary };
  } catch (error) {
    if (error instanceof LocalApiError) throw error;
    throw new LocalApiError(
      500,
      error instanceof Error ? error.message : "Archive extraction failed",
    );
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
  }
}
