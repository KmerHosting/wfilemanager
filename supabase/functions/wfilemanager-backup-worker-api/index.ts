import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "content-type, x-wfilemanager-instance, x-wfilemanager-instance-secret",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Cache-Control": "no-store",
};
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const encoder = new TextEncoder();
const BUCKET = "wfilemanager-backups";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
const hash = async (value: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))))
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
function safeEqual(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1)
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
async function authenticate(request: Request) {
  const instanceKey = String(request.headers.get("x-wfilemanager-instance") || "").trim();
  const secret = String(request.headers.get("x-wfilemanager-instance-secret") || "").trim();
  if (!instanceKey || !secret) return null;
  const { data: instance } = await db
    .from("wfilemanager_instances")
    .select("id,instance_key")
    .eq("instance_key", instanceKey)
    .eq("status", "active")
    .maybeSingle();
  if (!instance) return null;
  const { data: credential } = await db
    .from("wfilemanager_instance_credentials")
    .select("id,secret_hash")
    .eq("instance_id", instance.id)
    .eq("credential_type", "heartbeat")
    .is("revoked_at", null)
    .maybeSingle();
  if (!credential?.secret_hash || !safeEqual(await hash(secret), credential.secret_hash))
    return null;
  return instance;
}
function validJobId(value: unknown) {
  const jobId = String(value || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error("Invalid backup job");
  return jobId;
}
async function markFailed(instanceId: string, jobId: string, error: unknown) {
  const message = String(error || "Backup worker failed").slice(0, 1200);
  const { error: updateError } = await db
    .from("wfilemanager_backup_jobs")
    .update({ status: "failed", error: message, completed_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("instance_id", instanceId)
    .in("status", ["queued", "running", "uploading", "verifying"]);
  if (updateError) throw updateError;
  return json({ status: "failed", error: message });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const instance = await authenticate(request);
    if (!instance) return json({ error: "Unauthorized" }, 401);
    const action = new URL(request.url).pathname.split("/").filter(Boolean).pop();
    const body = await request.json().catch(() => ({}));
    const jobId = validJobId(body.jobId);
    if (action === "failed") return await markFailed(instance.id, jobId, body.error);
    if (action !== "completed") return json({ error: "Not found" }, 404);
    const { data: job, error: jobError } = await db
      .from("wfilemanager_backup_jobs")
      .select("id,status,retention_days")
      .eq("id", jobId)
      .eq("instance_id", instance.id)
      .maybeSingle();
    if (jobError) throw jobError;
    if (!job) return json({ error: "Backup job not found" }, 404);
    if (job.status === "completed") return json({ status: "completed" });
    const objectPath = "remote/" + instance.id + "/" + jobId + ".tar.gz.enc";
    const { data: objects, error: listError } = await db.storage
      .from(BUCKET)
      .list("remote/" + instance.id, { search: jobId });
    if (listError) throw listError;
    const object = (objects || []).find((item) => item.name === jobId + ".tar.gz.enc");
    const bytes = Number(object?.metadata?.size || body.bytes || 0);
    if (!object || !Number.isFinite(bytes) || bytes <= 0)
      return await markFailed(instance.id, jobId, "Uploaded backup object was not found");
    const traffic = await db.rpc("wfilemanager_backup_consume_traffic", {
      p_instance_id: instance.id,
      p_bytes: bytes,
      p_direction: "upload",
      p_idempotency_key: "backup-upload-" + jobId,
    });
    if (traffic.error) return await markFailed(instance.id, jobId, traffic.error.message);
    const retentionUntil = new Date(
      Date.now() + Number(job.retention_days) * 86400000,
    ).toISOString();
    const { data: snapshot, error: snapshotError } = await db
      .from("wfilemanager_backup_snapshots")
      .insert({
        instance_id: instance.id,
        snapshot_type: "manual",
        status: "available",
        size_bytes: bytes,
        storage_path: objectPath,
        retention_until: retentionUntil,
        manifest: { format: "wfilemanager-remote-v1", encrypted: true, cipher: "AES-256-CBC" },
      })
      .select("id")
      .single();
    if (snapshotError) return await markFailed(instance.id, jobId, snapshotError.message);
    const { error: updateError } = await db
      .from("wfilemanager_backup_jobs")
      .update({
        status: "completed",
        progress: 100,
        bytes_processed: bytes,
        traffic_bytes: bytes,
        snapshot_id: snapshot.id,
        error: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .eq("instance_id", instance.id);
    if (updateError) throw updateError;
    return json({ status: "completed", bytes, retentionUntil });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Backup worker callback failed" },
      400,
    );
  }
});
