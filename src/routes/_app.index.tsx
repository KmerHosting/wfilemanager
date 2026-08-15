import { useEffect, useState, type ComponentType } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CircleCheck,
  FileText,
  FolderCheck,
  FolderTree,
  RefreshCw,
  Server,
  ShieldCheck,
  TerminalSquare,
  Trash2,
  Users,
} from "@/components/ui/icons";
import { localApi } from "@/lib/local-api";
import { formatBytes } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/")({
  head: () => ({ meta: [{ title: "Overview — wFileManager" }] }),
  component: Overview,
});

type OverviewInfo = Awaited<ReturnType<typeof localApi.overview>>;

function Stat({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="wfm-overview-stat">
      <CardHeader className="wfm-overview-stat__header">
        <CardTitle>{label}</CardTitle>
        <Icon className="wfm-overview-stat__icon" />
      </CardHeader>
      <CardContent className="wfm-overview-stat__content">
        <strong>{value}</strong>
        <p>{detail}</p>
      </CardContent>
    </Card>
  );
}

function StatusBar({ label, value, percent }: { label: string; value: string; percent: number }) {
  return (
    <div className="wfm-overview-bar">
      <div className="wfm-overview-bar__label">
        <span>{label}</span>
        <span className="font-mono">{value}</span>
      </div>
      <Progress value={percent} />
    </div>
  );
}

function Overview() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<OverviewInfo | null>(null);
  const [trash, setTrash] = useState({ items: 0, size: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryResult, trashResult] = await Promise.all([
        localApi.overview(),
        localApi.trash.list().catch(() => ({ items: [], totalSize: 0 })),
      ]);
      setSummary(summaryResult);
      setTrash({ items: trashResult.items.length, size: trashResult.totalSize });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to connect to the local wFileManager engine",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const availablePercent = summary?.totalCommonLocations
    ? Math.round((summary.availableLocations / summary.totalCommonLocations) * 100)
    : 0;
  const writablePercent = summary?.totalCommonLocations
    ? Math.round((summary.writableLocations / summary.totalCommonLocations) * 100)
    : 0;

  return (
    <div className="wfm-page wfm-overview-page">
      <header className="wfm-page__header">
        <div>
          <p className="wfm-eyebrow">Workspace control center</p>
          <h1>Overview</h1>
          <p>See what is available, writable and ready for file operations.</p>
        </div>
        <div className="wfm-page__actions">
          <Badge
            variant="outline"
            className={error ? "wfm-status-badge wfm-status-badge--error" : "wfm-status-badge"}
          >
            <span className="wfm-status-badge__dot" />
            {loading ? "Connecting" : error ? "Engine unavailable" : "Local engine connected"}
          </Badge>
          <Button
            size="icon"
            variant="outline"
            onClick={() => void load()}
            aria-label="Refresh overview"
          >
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
        </div>
      </header>

      {error && (
        <Card className="wfm-overview-alert">
          <CardContent>{error}</CardContent>
        </Card>
      )}

      <section className="wfm-overview-stats" aria-label="Workspace summary">
        <Stat
          label="Root items"
          value={summary?.root.entries == null ? "—" : summary.root.entries.toLocaleString()}
          detail={
            summary?.root.readable
              ? "Visible in the root directory"
              : "Root directory is not readable"
          }
          icon={FolderTree}
        />
        <Stat
          label="Accessible locations"
          value={summary ? `${summary.availableLocations}/${summary.totalCommonLocations}` : "—"}
          detail="Common server paths available to File Explorer"
          icon={FolderCheck}
        />
        <Stat
          label="Server users"
          value={summary ? summary.loginUsers.toLocaleString() : "—"}
          detail="Linux accounts with interactive login access"
          icon={Users}
        />
        <Stat
          label="Trash"
          value={loading ? "—" : String(trash.items)}
          detail={trash.items ? `${formatBytes(trash.size)} waiting for action` : "Trash is empty"}
          icon={Trash2}
        />
      </section>

      <section className="wfm-overview-layout">
        <Card className="wfm-overview-health">
          <CardHeader>
            <CardTitle>File manager health</CardTitle>
            <CardDescription>
              Signals that affect navigation, editing and transfers.
            </CardDescription>
          </CardHeader>
          <CardContent className="wfm-overview-health__content">
            <div className="wfm-overview-facts">
              <div>
                <span>Hostname</span>
                <strong>{summary?.hostname || "—"}</strong>
              </div>
              <div>
                <span>Operating system</span>
                <strong>{summary?.os.prettyName || "—"}</strong>
              </div>
              <div>
                <span>Kernel / architecture</span>
                <strong>{summary ? `${summary.release} · ${summary.architecture}` : "—"}</strong>
              </div>
              <div>
                <span>Service port</span>
                <strong>127.0.0.1:1973</strong>
              </div>
            </div>
            <div className="wfm-overview-bars">
              <StatusBar
                label="Common locations readable"
                value={
                  summary ? `${summary.availableLocations} of ${summary.totalCommonLocations}` : "—"
                }
                percent={availablePercent}
              />
              <StatusBar
                label="Common locations writable"
                value={
                  summary ? `${summary.writableLocations} of ${summary.totalCommonLocations}` : "—"
                }
                percent={writablePercent}
              />
            </div>
            <div className="wfm-overview-limits">
              <div>
                <span>Text editor limit</span>
                <strong>{summary ? formatBytes(summary.editorLimitBytes) : "—"}</strong>
              </div>
              <div>
                <span>Upload request limit</span>
                <strong>{summary ? formatBytes(summary.uploadLimitBytes) : "—"}</strong>
              </div>
              <div>
                <span>Protected pseudo-filesystems</span>
                <strong>{summary ? summary.protectedPseudoFilesystems.length : "—"}</strong>
              </div>
            </div>
            <div className="wfm-overview-note">
              <CircleCheck /> File and command endpoints require a valid session and the appropriate
              permission.
            </div>
          </CardContent>
        </Card>

        <Card className="wfm-overview-access">
          <CardHeader>
            <CardTitle>Quick access</CardTitle>
            <CardDescription>Open common server locations and admin tools.</CardDescription>
          </CardHeader>
          <CardContent className="wfm-overview-access__content">
            {["/", "/root", "/etc", "/var/www", "/opt"].map((path) => (
              <Button key={path} asChild variant="outline" className="wfm-overview-access__link">
                <Link to="/explorer" search={{ path }}>
                  <FolderTree /> <span>Open</span>
                  <code>{path}</code>
                </Link>
              </Button>
            ))}
            {user?.isAdmin && (
              <Button asChild className="wfm-overview-access__link">
                <Link to="/terminal">
                  <TerminalSquare /> Open terminal
                </Link>
              </Button>
            )}
            {user?.isAdmin && (
              <Button asChild variant="outline" className="wfm-overview-access__link">
                <Link to="/users">
                  <Users /> Manage users
                </Link>
              </Button>
            )}
            <Button asChild variant="outline" className="wfm-overview-access__link">
              <Link to="/explorer" search={{ path: "/" }}>
                <FileText /> Browse files
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="wfm-overview-callout">
        <div>
          <ShieldCheck />
          <div>
            <strong>Ready for controlled file operations</strong>
            <p>
              Use the Explorer for files, Uploads for transfers and Terminal only when elevated
              access is required.
            </p>
          </div>
        </div>
        <Server aria-hidden="true" />
      </section>
    </div>
  );
}
