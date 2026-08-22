import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, LogoGithub, Renew, Reset } from "@carbon/icons-react";
import { Button, Column, Grid, InlineLoading, InlineNotification, Tag, Tile } from "@carbon/react";
import { formatBytes } from "@/lib/format";
import { localApi, type UpdateInfo } from "@/lib/local-api";
import { useNotifications } from "@/lib/notifications";

export const Route = createFileRoute("/_app/about")({
  head: () => ({ meta: [{ title: "About & updates — wFileManager" }] }),
  component: About,
});

function About() {
  const { notify } = useNotifications();
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);

  const check = useCallback(
    async (announce = false) => {
      setChecking(true);
      try {
        const result = await localApi.updateInfo();
        setUpdate(result);
        if (announce) {
          notify({
            kind: result.updateAvailable ? "info" : "success",
            title: result.updateAvailable ? "Update available" : "Already up to date",
            subtitle: result.updateAvailable
              ? `Version ${result.latestVersion} is available.`
              : undefined,
          });
        }
      } catch (error) {
        if (announce) {
          notify({
            kind: "error",
            title: "Unable to check for updates",
            subtitle:
              error instanceof Error ? error.message : "The update service did not respond.",
          });
        }
      } finally {
        setChecking(false);
      }
    },
    [notify],
  );

  useEffect(() => {
    void check(false);
  }, [check]);

  const waitForUpdate = async (noticeId: string, action: "update" | "rollback") => {
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
      try {
        const result = await localApi.updateStatus();
        setUpdate(result);
        if (result.state.status === "completed") {
          notify({
            id: noticeId,
            kind: "success",
            title: action === "update" ? "Update completed" : "Rollback completed",
            subtitle: result.state.message || undefined,
            timeout: 4000,
          });
          window.setTimeout(() => window.location.reload(), 700);
          return;
        }
        if (result.state.status === "failed") {
          notify({
            id: noticeId,
            kind: "error",
            title: action === "update" ? "Update failed" : "Rollback failed",
            subtitle: result.state.error || result.state.message || undefined,
            timeout: 0,
          });
          setBusy(false);
          return;
        }
        notify({
          id: noticeId,
          kind: "info",
          title: action === "update" ? "Updating wFileManager" : "Rolling back wFileManager",
          subtitle: result.state.message || "Operation in progress…",
          timeout: 0,
        });
      } catch {
        // The local service can be briefly unavailable while systemd activates the new runtime.
      }
    }

    notify({
      id: noticeId,
      kind: "warning",
      title:
        action === "update"
          ? "Update is taking longer than expected"
          : "Rollback is taking longer than expected",
      subtitle: "Check the updater service from the server shell.",
      timeout: 0,
    });
    setBusy(false);
  };

  const install = async () => {
    setBusy(true);
    const noticeId = notify({
      kind: "info",
      title: "Starting update",
      subtitle: "Preparing the verified release…",
      timeout: 0,
    });
    try {
      await localApi.installUpdate();
      await waitForUpdate(noticeId, "update");
    } catch (error) {
      notify({
        id: noticeId,
        kind: "error",
        title: "Unable to start update",
        subtitle: error instanceof Error ? error.message : "The updater did not start.",
        timeout: 0,
      });
      setBusy(false);
    }
  };

  const rollback = async () => {
    setBusy(true);
    const noticeId = notify({
      kind: "info",
      title: "Starting rollback",
      subtitle: "Preparing the previous verified runtime…",
      timeout: 0,
    });
    try {
      await localApi.rollbackUpdate();
      await waitForUpdate(noticeId, "rollback");
    } catch (error) {
      notify({
        id: noticeId,
        kind: "error",
        title: "Unable to start rollback",
        subtitle: error instanceof Error ? error.message : "The updater did not start.",
        timeout: 0,
      });
      setBusy(false);
    }
  };

  return (
    <section className="wfm-page" aria-labelledby="about-title">
      <header className="wfm-page__header">
        <div>
          <h1 id="about-title" className="wfm-page__heading">
            About & updates
          </h1>
          <p className="wfm-page__description">
            Local installation details and verified prebuilt updates with atomic activation and
            rollback.
          </p>
        </div>
        <Button
          kind="ghost"
          size="sm"
          renderIcon={Renew}
          disabled={busy || checking}
          onClick={() => void check(true)}
        >
          {checking ? "Checking…" : "Check for updates"}
        </Button>
      </header>

      <Grid fullWidth condensed className="wfm-about-grid">
        <Column sm={4} md={4} lg={8}>
          <Tile className="wfm-panel-tile">
            <h2 className="wfm-section-title">Installation</h2>
            <dl className="wfm-definition-list">
              <div className="wfm-definition-list__row">
                <dt>Version</dt>
                <dd className="wfm-mono">{update?.currentVersion || "—"}</dd>
              </div>
              <div className="wfm-definition-list__row">
                <dt>Database</dt>
                <dd>Local SQLite</dd>
              </div>
              <div className="wfm-definition-list__row">
                <dt>Interface</dt>
                <dd>IBM Carbon Design System</dd>
              </div>
              <div className="wfm-definition-list__row">
                <dt>Source</dt>
                <dd>
                  <Button
                    kind="ghost"
                    size="sm"
                    renderIcon={LogoGithub}
                    href="https://github.com/KmerHosting/wfilemanager"
                    target="_blank"
                    rel="noreferrer"
                  >
                    GitHub
                  </Button>
                </dd>
              </div>
              <div className="wfm-definition-list__row">
                <dt>License</dt>
                <dd>MIT</dd>
              </div>
            </dl>
          </Tile>
        </Column>

        <Column sm={4} md={4} lg={8}>
          <Tile className="wfm-panel-tile">
            <div className="wfm-button-row wfm-between">
              <h2 className="wfm-section-title">Updates</h2>
              {update ? (
                <Tag type={update.updateAvailable ? "blue" : "green"}>
                  {update.updateAvailable ? "Update available" : "Current"}
                </Tag>
              ) : null}
            </div>

            {checking && !update ? <InlineLoading description="Checking release channel…" /> : null}

            <dl className="wfm-definition-list">
              <div className="wfm-definition-list__row">
                <dt>Installed</dt>
                <dd className="wfm-mono">{update?.currentVersion || "—"}</dd>
              </div>
              <div className="wfm-definition-list__row">
                <dt>Latest</dt>
                <dd className="wfm-mono">{update?.latestVersion || "Not checked"}</dd>
              </div>
              {update?.size != null ? (
                <div className="wfm-definition-list__row">
                  <dt>Download</dt>
                  <dd>{formatBytes(update.size)}</dd>
                </div>
              ) : null}
            </dl>

            {update?.state.status === "failed" ? (
              <InlineNotification
                kind="error"
                lowContrast
                hideCloseButton
                title="Last updater operation failed"
                subtitle={update.state.error || update.state.message || "Unknown updater error"}
              />
            ) : null}

            <div className="wfm-update-actions">
              {update?.updateAvailable ? (
                <Button renderIcon={Download} disabled={busy} onClick={() => void install()}>
                  Install {update.latestVersion}
                </Button>
              ) : null}
              {update?.rollbackAvailable ? (
                <Button
                  kind="secondary"
                  renderIcon={Reset}
                  disabled={busy}
                  onClick={() => void rollback()}
                >
                  Rollback
                </Button>
              ) : null}
            </div>
          </Tile>
        </Column>
      </Grid>

      <InlineNotification
        kind="info"
        lowContrast
        hideCloseButton
        title="Release integrity"
        subtitle="wFileManager installs prebuilt releases and uses atomic activation with rollback. No application compilation is required on the server."
      />
    </section>
  );
}
