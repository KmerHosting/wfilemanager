import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { LocalApiError } from "@/lib/server/local-runtime";

const worker =
  process.env.WFILEMANAGER_BACKUP_WORKER || "/usr/local/sbin/wfilemanager-backup-worker";
export async function startRemoteBackup(source: unknown, jobId: unknown, signedUrl: unknown) {
  const sourcePath = String(source || "").trim();
  const id = String(jobId || "").trim();
  const url = String(signedUrl || "").trim();
  if (!sourcePath.startsWith("/") || !/^[0-9a-f-]{36}$/i.test(id) || !url.startsWith("https://"))
    throw new LocalApiError(400, "Invalid backup worker request");
  await access(worker, constants.X_OK).catch(() => {
    throw new LocalApiError(503, "Backup worker is not installed");
  });
  const child = spawn(worker, ["upload", sourcePath, id, url], { detached: true, stdio: "ignore" });
  child.unref();
  return { accepted: true, jobId: id };
}
