import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-wfilemanager-automation-secret",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Cache-Control": "no-store",
};
const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const BUCKET = "wfilemanager-backups";
const MAGIC = encoder.encode("WFMBAK1");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
function hex(bytes: Uint8Array) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function digest(bytes: Uint8Array) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}
function safeEqual(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
async function keyFromSecret(secret: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(secret)));
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function encrypt(secret: string, value: unknown) {
  const key = await keyFromSecret(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(value));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
  const output = new Uint8Array(MAGIC.length + iv.length + encrypted.length);
  output.set(MAGIC, 0);
  output.set(iv, MAGIC.length);
  output.set(encrypted, MAGIC.length + iv.length);
  return output;
}
async function decrypt(secret: string, bytes: Uint8Array) {
  const magic = bytes.slice(0, MAGIC.length);
  if (!safeEqual(hex(magic), hex(MAGIC))) throw new Error("Invalid backup format");
  const iv = bytes.slice(MAGIC.length, MAGIC.length + 12);
  const ciphertext = bytes.slice(MAGIC.length + 12);
  const key = await keyFromSecret(secret);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(decoder.decode(plaintext));
}
async function configHash() {
  const { data, error } = await db.from("wfilemanager_pro_subscription_config")
    .select("automation_secret_hash").eq("id", true).maybeSingle();
  if (error) throw error;
  return String(data?.automation_secret_hash || "");
}
async function authorize(request: Request) {
  const secret = String(request.headers.get("x-wfilemanager-automation-secret") || "").trim();
  if (!secret) return null;
  const supplied = await digest(encoder.encode(secret));
  if (!safeEqual(supplied, await configHash())) return null;
  return secret;
}
function policy(now = new Date()) {
  if (now.getUTCDate() === 1) return { snapshotType: "monthly", retentionDays: 190 };
  if (now.getUTCDay() === 0) return { snapshotType: "weekly", retentionDays: 35 };
  return { snapshotType: "automatic", retentionDays: 8 };
}
async function rows(table: string, instanceId: string) {
  const { data, error } = await db.from(table).select("*").eq("instance_id", instanceId);
  if (error) throw error;
  return data || [];
}
async function createSnapshot(secret: string, instance: Record<string, unknown>) {
  const now = new Date();
  const selectedPolicy = policy(now);
  const [roles, users, settings, notifications, pathRules, auditLogs] = await Promise.all([
    rows("wfilemanager_roles", String(instance.id)),
    rows("wfilemanager_users", String(instance.id)),
    rows("wfilemanager_settings", String(instance.id)),
    rows("wfilemanager_notifications", String(instance.id)),
    rows("wfilemanager_path_rules", String(instance.id)),
    rows("wfilemanager_audit_logs", String(instance.id)),
  ]);
  const document = {
    format: "wfilemanager-pro-snapshot-v1",
    encrypted: true,
    createdAt: now.toISOString(),
    instance: {
      id: instance.id,
      instanceKey: instance.instance_key,
      name: instance.name,
      hostname: instance.hostname,
      baseUrl: instance.base_url,
      paidUntil: instance.paid_until,
      storageQuotaBytes: instance.storage_quota_bytes,
    },
    data: { roles, users, settings, notifications, pathRules, auditLogs },
  };
  const encrypted = await encrypt(secret, document);
  const checksum = await digest(encrypted);
  const safeKey = String(instance.instance_key).replace(/[^A-Za-z0-9._-]/g, "_");
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const storagePath = `instances/${safeKey}/${now.toISOString().slice(0, 10)}/${stamp}.wfmbackup`;
  const retentionUntil = new Date(now.getTime() + selectedPolicy.retentionDays * 86400000).toISOString();
  const upload = await db.storage.from(BUCKET).upload(storagePath, encrypted, {
    contentType: "application/octet-stream",
    cacheControl: "3600",
    upsert: false,
  });
  if (upload.error) throw upload.error;
  const { data: snapshot, error } = await db.from("wfilemanager_backup_snapshots").insert({
    instance_id: instance.id,
    snapshot_type: selectedPolicy.snapshotType,
    status: "available",
    size_bytes: encrypted.byteLength,
    checksum_sha256: checksum,
    storage_path: storagePath,
    retention_until: retentionUntil,
    manifest: {
      format: document.format,
      encrypted: true,
      cipher: "AES-256-GCM",
      counts: {
        roles: roles.length,
        users: users.length,
        settings: settings.length,
        notifications: notifications.length,
        pathRules: pathRules.length,
        auditLogs: auditLogs.length,
      },
    },
  }).select("id").single();
  if (error) {
    await db.storage.from(BUCKET).remove([storagePath]);
    throw error;
  }
  try {
    const downloaded = await db.storage.from(BUCKET).download(storagePath);
    if (downloaded.error) throw downloaded.error;
    const verificationBytes = new Uint8Array(await downloaded.data.arrayBuffer());
    if (!safeEqual(checksum, await digest(verificationBytes))) throw new Error("Backup checksum mismatch");
    const verifiedDocument = await decrypt(secret, verificationBytes);
    if (verifiedDocument?.format !== document.format || verifiedDocument?.instance?.id !== instance.id) {
      throw new Error("Backup content verification failed");
    }
    await db.from("wfilemanager_backup_snapshots").update({
      verified_at: new Date().toISOString(), verification_error: null,
    }).eq("id", snapshot.id);
  } catch (verificationError) {
    await db.from("wfilemanager_backup_snapshots").update({
      status: "failed",
      verification_error: verificationError instanceof Error ? verificationError.message : "Verification failed",
    }).eq("id", snapshot.id);
    throw verificationError;
  }
  return { snapshotId: snapshot.id, storagePath, sizeBytes: encrypted.byteLength, checksum, retentionUntil };
}
async function runSnapshots(secret: string) {
  const { data: instances, error } = await db.from("wfilemanager_instances").select("*")
    .eq("service_plan", "pro").in("data_status", ["active","frozen","suspended"]).limit(100);
  if (error) throw error;
  const results: unknown[] = [];
  for (const instance of instances || []) {
    const { data: latest } = await db.from("wfilemanager_backup_snapshots")
      .select("created_at,status").eq("instance_id", instance.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (latest && new Date(latest.created_at).getTime() > Date.now() - 20 * 3600000) {
      results.push({ instance: instance.instance_key, skipped: "recent_snapshot" });
      continue;
    }
    try {
      results.push({ instance: instance.instance_key, snapshot: await createSnapshot(secret, instance) });
    } catch (value) {
      results.push({ instance: instance.instance_key, error: value instanceof Error ? value.message : "Snapshot failed" });
    }
  }
  return { checked: instances?.length || 0, results };
}
async function cleanupExpired() {
  const { data: snapshots, error } = await db.from("wfilemanager_backup_snapshots")
    .select("id,storage_path").lt("retention_until", new Date().toISOString()).limit(500);
  if (error) throw error;
  const paths = (snapshots || []).map((snapshot) => snapshot.storage_path).filter(Boolean);
  if (paths.length) {
    const removal = await db.storage.from(BUCKET).remove(paths);
    if (removal.error) throw removal.error;
  }
  const ids = (snapshots || []).map((snapshot) => snapshot.id);
  if (ids.length) {
    const deletion = await db.from("wfilemanager_backup_snapshots").delete().in("id", ids);
    if (deletion.error) throw deletion.error;
  }
  return { deleted: ids.length };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    const action = new URL(request.url).pathname.split("/").filter(Boolean).pop() || "status";
    if (action === "status") return json({
      ok: true,
      encryptedSnapshots: true,
      cipher: "AES-256-GCM",
      checksumVerification: true,
      restoreValidation: true,
      retention: { dailyDays: 8, weeklyDays: 35, monthlyDays: 190 },
    });
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const secret = await authorize(request);
    if (!secret) return json({ error: "Unauthorized backup request" }, 401);
    if (action === "run" || action === "snapshot") return json({
      ok: true,
      snapshots: await runSnapshots(secret),
      cleanup: await cleanupExpired(),
    });
    if (action === "cleanup") return json({ ok: true, cleanup: await cleanupExpired() });
    return json({ error: "Not found" }, 404);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Backup automation failed" }, 500);
  }
});
