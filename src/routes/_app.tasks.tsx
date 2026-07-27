import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CheckCircle2,
  Copy,
  Loader2,
  MoveRight,
  RefreshCw,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  localApi,
  type BackgroundUploadTask,
  type OperationJob,
} from "@/lib/local-api";
import { formatBytes } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/tasks")({
  head: () => ({ meta: [{ title: "Background tasks — wFileManager" }] }),
  component: Tasks,
});

const ACTIVE = new Set(["queued", "running", "cancelling"]);

function operationIcon(operation: OperationJob["operation"]) {
  return operation === "copy" ? Copy : operation === "move" ? MoveRight : Trash2;
}

function Tasks() {
  const [jobs, setJobs] = useState<OperationJob[]>([]);
  const [uploads, setUploads] = useState<BackgroundUploadTask[]>(localApi.backgroundUploads());
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const result = await localApi.jobs();
      setJobs(result.jobs);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to load background tasks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1_500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => localApi.subscribeBackgroundUploads(() => setUploads(localApi.backgroundUploads())), []);

  const cancelJob = async (job: OperationJob) => {
    setCancelling(job.id);
    try {
      await localApi.cancelJob(job.id);
      await refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to cancel this task");
    } finally {
      setCancelling(null);
    }
  };

  const activeCount = jobs.filter((job) => ACTIVE.has(job.status)).length + uploads.filter((upload) => ACTIVE.has(upload.status)).length;

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Background tasks</h1>
          <p className="text-sm text-muted-foreground">
            Uploads and file operations continue while you use other parts of wFileManager.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={activeCount ? "default" : "outline"}>{activeCount} active</Badge>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {uploads.map((upload) => (
          <Card key={upload.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {upload.status === "running" || upload.status === "cancelling" ? (
                    <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
                  ) : upload.status === "completed" ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                  ) : (
                    <X className="h-5 w-5 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0">
                    <CardTitle className="text-base">Upload</CardTitle>
                    <CardDescription className="truncate font-mono text-xs">
                      {upload.currentFile || `${upload.files.length} file(s)`} → {upload.destination}
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="capitalize">{upload.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={upload.progress} />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{formatBytes(upload.loaded)} of {formatBytes(upload.total)} · {upload.progress}%</span>
                {upload.status === "running" && (
                  <Button size="sm" variant="destructive" onClick={() => localApi.cancelBackgroundUpload(upload.id)}>
                    Cancel upload
                  </Button>
                )}
              </div>
              {upload.error && <p className="text-xs text-destructive">{upload.error}</p>}
            </CardContent>
          </Card>
        ))}

        {jobs.map((job) => {
          const Icon = operationIcon(job.operation);
          return (
            <Card key={job.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Icon className="h-5 w-5 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <CardTitle className="capitalize text-base">{job.operation}</CardTitle>
                      <CardDescription className="truncate font-mono text-xs">{job.currentItem || job.source}</CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="capitalize">{job.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Progress value={job.progress} />
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{job.processedItems} of {job.totalItems || "…"} items · {job.progress}%</span>
                  {job.cancellable && ACTIVE.has(job.status) && (
                    <Button size="sm" variant="destructive" disabled={cancelling === job.id} onClick={() => void cancelJob(job)}>
                      {cancelling === job.id ? "Cancelling…" : "Cancel task"}
                    </Button>
                  )}
                </div>
                {job.error && <p className="text-xs text-destructive">{job.error}</p>}
              </CardContent>
            </Card>
          );
        })}

        {!loading && jobs.length === 0 && uploads.length === 0 && (
          <Card>
            <CardContent className="grid place-items-center gap-2 py-16 text-center text-sm text-muted-foreground">
              <UploadCloud className="h-6 w-6 text-primary" />
              No background tasks yet.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
