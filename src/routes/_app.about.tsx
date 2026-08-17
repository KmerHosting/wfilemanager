import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Download, Github, RefreshCw, RotateCcw } from "@/components/ui/icons";
import { localApi, type UpdateInfo } from "@/lib/local-api";
import { formatBytes } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/about")({
  head: () => ({ meta: [{ title: "About & updates — wFileManager" }] }),
  component: About,
});

function About() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [busy, setBusy] = useState(false);

  const check = async (notify = false) => {
    const toastId = notify ? toast.loading("Checking for updates…") : undefined;
    try {
      const result = await localApi.updateInfo();
      setUpdate(result);
      if (notify)
        toast.success(
          result.updateAvailable
            ? `Version ${result.latestVersion} is available`
            : "Already up to date",
          { id: toastId },
        );
    } catch (error) {
      if (notify)
        toast.error(error instanceof Error ? error.message : "Unable to check for updates", {
          id: toastId,
        });
    }
  };

  useEffect(() => {
    void check(false);
  }, []);

  const waitForUpdate = async (toastId: string | number, action: "update" | "rollback") => {
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
      try {
        const result = await localApi.updateStatus();
        setUpdate(result);
        if (result.state.status === "completed") {
          toast.success(action === "update" ? "Update completed" : "Rollback completed", {
            id: toastId,
          });
          window.setTimeout(() => window.location.reload(), 700);
          return;
        }
        if (result.state.status === "failed") {
          toast.error(result.state.error || result.state.message || `${action} failed`, {
            id: toastId,
          });
          setBusy(false);
          return;
        }
        toast.loading(result.state.message || `${action} in progress…`, { id: toastId });
      } catch {
        // The service may be briefly unavailable while systemd restarts it.
      }
    }
    toast.error(`${action === "update" ? "Update" : "Rollback"} is taking longer than expected`, {
      id: toastId,
    });
    setBusy(false);
  };

  const install = async () => {
    setBusy(true);
    const toastId = toast.loading("Starting update…");
    try {
      await localApi.installUpdate();
      toast.loading("Update in progress…", { id: toastId });
      await waitForUpdate(toastId, "update");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to start the update", {
        id: toastId,
      });
      setBusy(false);
    }
  };

  const rollback = async () => {
    setBusy(true);
    const toastId = toast.loading("Starting rollback…");
    try {
      await localApi.rollbackUpdate();
      toast.loading("Rollback in progress…", { id: toastId });
      await waitForUpdate(toastId, "rollback");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to start rollback", {
        id: toastId,
      });
      setBusy(false);
    }
  };

  return (
    <div className="wfm-page wfm-about-page">
      <div className="wfm-page__header">
        <div>
          <p className="wfm-eyebrow">Application</p>
          <h1>About & updates</h1>
          <p>wFileManager is a local, single-administrator file manager for Linux servers.</p>
        </div>
        <Button asChild size="icon" variant="outline" aria-label="Open wFileManager on GitHub">
          <a
            href="https://github.com/KmerHosting/wfilemanager"
            target="_blank"
            rel="noreferrer"
            title="GitHub repository"
          >
            <Github className="h-4 w-4" />
          </a>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Installation</CardTitle>
            <CardDescription>
              No hosted database, licence key or multi-user service.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Version</span>
              <strong className="font-mono">{update?.currentVersion || "—"}</strong>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Database</span>
              <strong>Local SQLite</strong>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Account model</span>
              <strong>Single administrator</strong>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">License</span>
              <strong>MIT</strong>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Updates</CardTitle>
                <CardDescription>
                  Verified prebuilt releases with atomic activation and rollback.
                </CardDescription>
              </div>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void check(true)}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Check
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Latest</span>
                <strong className="font-mono">{update?.latestVersion || "Not checked"}</strong>
              </div>
              {update?.size != null && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Download</span>
                  <strong>{formatBytes(update.size)}</strong>
                </div>
              )}
            </div>

            {update?.state.status === "failed" && (
              <Alert variant="destructive">
                <AlertDescription>{update.state.error || update.state.message}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap gap-2">
              {update?.updateAvailable && (
                <Button disabled={busy} onClick={() => void install()}>
                  <Download className="mr-2 h-4 w-4" />
                  Install {update.latestVersion}
                </Button>
              )}
              {update?.rollbackAvailable && (
                <Button variant="outline" disabled={busy} onClick={() => void rollback()}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Rollback
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
