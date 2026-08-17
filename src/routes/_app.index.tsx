import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FolderTree, RefreshCw, Trash2 } from "@/components/ui/icons";
import { localApi } from "@/lib/local-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_app/")({
  head: () => ({ meta: [{ title: "Overview — wFileManager" }] }),
  component: Overview,
});

type OverviewInfo = Awaited<ReturnType<typeof localApi.overview>>;

function Overview() {
  const [summary, setSummary] = useState<OverviewInfo | null>(null);
  const [trashCount, setTrashCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [overview, trash] = await Promise.all([
        localApi.overview(),
        localApi.trash.list().catch(() => ({ items: [], totalSize: 0 })),
      ]);
      setSummary(overview);
      setTrashCount(trash.items.length);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to read the local server");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="wfm-page wfm-overview-page">
      <header className="wfm-page__header">
        <div>
          <p className="wfm-eyebrow">Local file manager</p>
          <h1>Overview</h1>
          <p>One administrator. One local database. Direct access to this server's files.</p>
        </div>
        <div className="wfm-page__actions">
          <Badge variant="outline">{loading ? "Checking" : error ? "Unavailable" : "Ready"}</Badge>
          <Button size="icon" variant="outline" onClick={() => void load()} aria-label="Refresh">
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-destructive/30 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Server</CardTitle>
            <CardDescription>Runtime information used by the file manager.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Hostname</span>
              <strong>{summary?.hostname || "—"}</strong>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Operating system</span>
              <strong>{summary?.os.prettyName || "—"}</strong>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Architecture</span>
              <strong>{summary?.architecture || "—"}</strong>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Readable locations</span>
              <strong>
                {summary ? `${summary.availableLocations}/${summary.totalCommonLocations}` : "—"}
              </strong>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick access</CardTitle>
            <CardDescription>The two places needed for day-to-day file management.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button asChild>
              <Link to="/explorer" search={{ path: "/" }}>
                <FolderTree className="mr-2 h-4 w-4" />
                Open File Explorer
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/trash">
                <Trash2 className="mr-2 h-4 w-4" />
                Trash ({trashCount})
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
