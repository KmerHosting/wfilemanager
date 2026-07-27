import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArchiveRestore, FolderPlus, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_app/backups")({ component: Backups });
type Source = { id: string; source_path: string; label: string };
type Job = {
  id: string;
  status: string;
  progress: number;
  retention_days: number;
  traffic_bytes: number;
  error?: string;
};
type Data = {
  sources: Source[];
  jobs: Job[];
  entitlement: {
    capacityGiB: number;
    trafficUsedBytes: number;
    trafficQuotaBytes: number;
    billingStatus: string;
  };
};
async function api(action: string, init?: RequestInit) {
  const response = await fetch("/api/gateway?scope=backup&action=" + action, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value.error || "Backup request failed");
  return value;
}
function Backups() {
  const [data, setData] = useState<Data | null>(null);
  const [path, setPath] = useState("");
  const [retention, setRetention] = useState(30);
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    try {
      setData((await api("status")) as Data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load backups");
    }
  };
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(timer);
  }, []);
  const add = async () => {
    setBusy(true);
    try {
      await api("sources", { method: "POST", body: JSON.stringify({ sourcePath: path }) });
      setPath("");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to add folder");
    } finally {
      setBusy(false);
    }
  };
  const start = async () => {
    setBusy(true);
    try {
      const queued = (await api("jobs", {
        method: "POST",
        body: JSON.stringify({ retentionDays: retention }),
      })) as { job: { id: string } };
      const transfer = (await api("transfer-url", {
        method: "POST",
        body: JSON.stringify({ jobId: queued.job.id, direction: "upload" }),
      })) as { signedUrl: string };
      const worker = await fetch("/api/local?action=backup-run", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: data?.sources.map((source) => source.source_path),
          jobId: queued.job.id,
          signedUrl: transfer.signedUrl,
        }),
      });
      if (!worker.ok)
        throw new Error(
          (await worker.json().catch(() => ({}))).error || "Unable to launch backup worker",
        );
      toast.success("Encrypted backup started");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to start backup");
    } finally {
      setBusy(false);
    }
  };
  const cancel = async (id: string) => {
    try {
      await api("cancel", { method: "POST", body: JSON.stringify({ id }) });
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to cancel backup");
    }
  };
  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold">Remote backups</h1>
        <p className="text-sm text-muted-foreground">
          Encrypted Pro backups. Retention is selectable from 1 day to 1 year; restores never
          overwrite live files.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Capacity</CardTitle>
          </CardHeader>
          <CardContent>{data?.entitlement.capacityGiB ?? 5} GiB</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Traffic</CardTitle>
          </CardHeader>
          <CardContent>
            {data
              ? Math.round((data.entitlement.trafficUsedBytes / 1024 ** 3) * 100) / 100 +
                " / " +
                Math.round(data.entitlement.trafficQuotaBytes / 1024 ** 3) +
                " GiB"
              : "…"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Billing</CardTitle>
          </CardHeader>
          <CardContent className="capitalize">{data?.entitlement.billingStatus || "…"}</CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Protected folders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="/srv/application-data"
            />
            <Button disabled={!path || busy} onClick={() => void add()}>
              <FolderPlus className="mr-2 h-4 w-4" />
              Add folder
            </Button>
          </div>
          {data?.sources.map((source) => (
            <div key={source.id} className="rounded border p-3 font-mono text-sm">
              {source.label} <span className="text-muted-foreground">{source.source_path}</span>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create backup</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="retention">Retention days</Label>
            <Input
              id="retention"
              className="mt-1 w-32"
              type="number"
              min="1"
              max="365"
              value={retention}
              onChange={(event) => setRetention(Number(event.target.value))}
            />
          </div>
          <Button disabled={busy || !data?.sources.length} onClick={() => void start()}>
            <ArchiveRestore className="mr-2 h-4 w-4" />
            Start encrypted backup
          </Button>
          <Button variant="outline" onClick={() => void refresh()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data?.jobs.map((job) => (
            <div key={job.id} className="rounded border p-3">
              <div className="flex justify-between gap-3 text-sm">
                <span className="capitalize">
                  {job.status} · {job.retention_days} days
                </span>
                {["queued", "running", "uploading", "verifying"].includes(job.status) && (
                  <Button size="sm" variant="destructive" onClick={() => void cancel(job.id)}>
                    <X className="mr-1 h-3 w-3" />
                    Cancel
                  </Button>
                )}
              </div>
              <Progress className="mt-2" value={job.progress} />
              {job.traffic_bytes > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {Math.ceil(job.traffic_bytes / 1024 / 1024)} MB debited from monthly backup
                  traffic.
                </p>
              )}
              {job.error && <p className="mt-2 text-xs text-destructive">{job.error}</p>}
            </div>
          ))}
          {!data?.jobs.length && (
            <p className="text-sm text-muted-foreground">No backup jobs yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
