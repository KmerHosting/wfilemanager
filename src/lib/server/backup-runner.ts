import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { access, chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LocalApiError } from "@/lib/server/local-runtime";

const keyFile = "/etc/wfilemanager/backup-transfer.key";
const workers = [
  process.env.WFILEMANAGER_BACKUP_WORKER,
  "/usr/local/sbin/wfilemanager-backup-worker",
  join(process.cwd(), "deploy", "wfilemanager-backup-worker"),
].filter((value): value is string => Boolean(value));

async function resolveWorker() {
  for (const worker of workers) {
    try {
      await access(worker, constants.X_OK);
      return worker;
    } catch {
      // Try the next supported worker location.
    }
  }
  throw new LocalApiError(503, "Backup worker is not available in this release");
}

async function ensureTransferKey() {
  try {
    await access(keyFile, constants.R_OK);
  } catch {
    await mkdir("/etc/wfilemanager", { recursive: true, mode: 0o700 });
    await writeFile(keyFile, randomBytes(48).toString("base64"), { mode: 0o600 });
  }
  await chmod(keyFile, 0o600);
}

export async function startRemoteBackup(source: unknown, jobId: unknown, signedUrl: unknown) {
  const sourcePath = String(source || "").trim();
  const id = String(jobId || "").trim();
  const url = String(signedUrl || "").trim();
  if (!sourcePath.startsWith("/") || !/^[0-9a-f-]{36}$/i.test(id) || !url.startsWith("https://"))
    throw new LocalApiError(400, "Invalid backup worker request");
  const worker = await resolveWorker();
  await ensureTransferKey();
  const child = spawn(worker, ["upload", sourcePath, id, url], { detached: true, stdio: "ignore" });
  child.unref();
  return { accepted: true, jobId: id };
}
