import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Dashboard, FolderOpen, Renew, TrashCan } from "@carbon/icons-react";
import { Button, Column, Grid, InlineNotification, Tag, Tile } from "@carbon/react";
import { formatBytes } from "@/lib/format";
import { localApi } from "@/lib/local-api";

export const Route = createFileRoute("/_app/")({
  head: () => ({ meta: [{ title: "Overview — wFileManager" }] }),
  component: Overview,
});

type OverviewInfo = Awaited<ReturnType<typeof localApi.overview>>;

function formatUptime(seconds: number | undefined) {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return "—";

  const totalMinutes = Math.floor(seconds / 60);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

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
    <section className="wfm-page" aria-labelledby="overview-title">
      <header className="wfm-page__header">
        <div>
          <h1 id="overview-title" className="wfm-page__heading">
            Overview
          </h1>
          <p className="wfm-page__description">
            Local server health, filesystem access and direct access to everyday file management.
          </p>
        </div>
        <div className="wfm-page__actions">
          <Tag type={loading ? "cool-gray" : error ? "red" : "green"}>
            {loading ? "Checking" : error ? "Unavailable" : "Ready"}
          </Tag>
          <Button kind="ghost" size="sm" renderIcon={Renew} onClick={() => void load()}>
            Refresh
          </Button>
        </div>
      </header>

      {error ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Unable to read this server"
          subtitle={error}
        />
      ) : null}

      <Grid fullWidth condensed className="wfm-kpi-grid">
        <Column sm={4} md={4} lg={4}>
          <Tile className="wfm-kpi-tile">
            <div className="wfm-kpi-tile__label">Uptime</div>
            <div className="wfm-kpi-tile__value wfm-mono">{formatUptime(summary?.uptime)}</div>
            <div className="wfm-kpi-tile__helper">Since the last server boot</div>
          </Tile>
        </Column>
        <Column sm={4} md={4} lg={4}>
          <Tile className="wfm-kpi-tile">
            <div className="wfm-kpi-tile__label">Login users</div>
            <div className="wfm-kpi-tile__value">{summary?.loginUsers ?? "—"}</div>
            <div className="wfm-kpi-tile__helper">Interactive Linux accounts</div>
          </Tile>
        </Column>
        <Column sm={4} md={4} lg={4}>
          <Tile className="wfm-kpi-tile">
            <div className="wfm-kpi-tile__label">Storage free</div>
            <div className="wfm-kpi-tile__value">
              {summary?.rootFilesystem.freeBytes != null
                ? formatBytes(summary.rootFilesystem.freeBytes)
                : "—"}
            </div>
            <div className="wfm-kpi-tile__helper">
              {summary?.rootFilesystem.totalBytes != null
                ? `${formatBytes(summary.rootFilesystem.totalBytes)} total on /`
                : "Root filesystem"}
            </div>
          </Tile>
        </Column>
        <Column sm={4} md={4} lg={4}>
          <Tile className="wfm-kpi-tile">
            <div className="wfm-kpi-tile__label">Memory used</div>
            <div className="wfm-kpi-tile__value">
              {summary ? formatBytes(summary.memory.totalBytes - summary.memory.freeBytes) : "—"}
            </div>
            <div className="wfm-kpi-tile__helper">
              {summary ? `${formatBytes(summary.memory.totalBytes)} total` : "System memory"}
            </div>
          </Tile>
        </Column>
      </Grid>

      <Grid fullWidth condensed>
        <Column sm={4} md={4} lg={8}>
          <Tile className="wfm-panel-tile">
            <h2 className="wfm-section-title">Server</h2>
            <dl className="wfm-definition-list">
              <div className="wfm-definition-list__row">
                <dt>Hostname</dt>
                <dd className="wfm-mono">{summary?.hostname || "—"}</dd>
              </div>
              <div className="wfm-definition-list__row">
                <dt>Operating system</dt>
                <dd>{summary?.os.prettyName || "—"}</dd>
              </div>
              <div className="wfm-definition-list__row">
                <dt>Architecture</dt>
                <dd>{summary?.architecture || "—"}</dd>
              </div>
              <div className="wfm-definition-list__row">
                <dt>IPv4</dt>
                <dd className="wfm-mono">{summary?.ipv4 || "—"}</dd>
              </div>
            </dl>
          </Tile>
        </Column>
        <Column sm={4} md={4} lg={8}>
          <Tile className="wfm-panel-tile">
            <h2 className="wfm-section-title">Quick access</h2>
            <div className="wfm-quick-actions">
              <Button href="/explorer?path=%2F" renderIcon={FolderOpen}>
                Open File Explorer
              </Button>
              <Button href="/trash" kind="secondary" renderIcon={TrashCan}>
                Trash ({trashCount})
              </Button>
              <Button href="/about" kind="tertiary" renderIcon={Dashboard}>
                About & updates
              </Button>
            </div>
          </Tile>
        </Column>
      </Grid>
    </section>
  );
}
