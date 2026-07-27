import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LocalApiError } from "@/lib/server/local-runtime";

const keyFile = "/etc/wfilemanager/backup-transfer.key";
const instanceSecretFile =
  process.env.WFILEMANAGER_INSTANCE_SECRET_FILE || "/etc/wfilemanager/instance-secret.key";
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

async function reportJob(jobId: string, status: "completed" | "failed", error?: string) {
  const baseUrl = String(process.env.WFILEMANAGER_SUPABASE_URL || "").replace(/\/$/, "");
  const instanceKey = String(process.env.WFILEMANAGER_INSTANCE_KEY || "").trim();
  if (!baseUrl || !instanceKey) return;
  const instanceSecret = (await readFile(instanceSecretFile, "utf8").catch(() => "")).trim();
  if (!instanceSecret) return;
  await fetch(baseUrl + "/functions/v1/wfilemanager-backup-worker-api/" + status, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-wfilemanager-instance": instanceKey,
      "x-wfilemanager-instance-secret": instanceSecret,
    },
    body: JSON.stringify({ jobId, error: error?.slice(0, 1200) }),
  }).catch(() => undefined);
}

export async function startRemoteBackup(source: unknown, jobId: unknown, signedUrl: unknown) {
  const sourcePaths = (Array.isArray(source) ? source : [source])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const id = String(jobId || "").trim();
  const url = String(signedUrl || "").trim();
  if (
    !sourcePaths.length ||
    sourcePaths.some((item) => !item.startsWith("/")) ||
    !/^[0-9a-f-]{36}$/i.test(id) ||
    !url.startsWith("https://")
  )
    throw new LocalApiError(400, "Invalid backup worker request");
  const worker = await resolveWorker();
  await ensureTransferKey();
  const child = spawn(worker, ["upload", id, url, ...sourcePaths], {
    detached: true,
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr = (stderr + String(chunk)).slice(-1200);
  });
  child.once("error", (error) => void reportJob(id, "failed", error.message));
  child.once(
    "close",
    (code) =>
      void reportJob(id, code === 0 ? "completed" : "failed", stderr || "Backup worker failed"),
  );
  child.unref();
  return { accepted: true, jobId: id };
}
