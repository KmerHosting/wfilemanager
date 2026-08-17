import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Password } from "@carbon/icons-react";
import { Button, CodeSnippet, InlineNotification, PasswordInput, Tile } from "@carbon/react";
import {
  ADMIN_PASSWORD_POLICY_TEXT,
  administratorPasswordError,
} from "@/lib/admin-password-policy";
import { useNotifications } from "@/lib/notifications";
import { wfilemanagerApi } from "@/lib/wfilemanager-api";

export const Route = createFileRoute("/_app/account")({
  head: () => ({ meta: [{ title: "Administrator — wFileManager" }] }),
  component: Administrator,
});

function Administrator() {
  const { notify } = useNotifications();
  const [password, setPassword] = useState({ current: "", next: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const policyError = password.next ? administratorPasswordError(password.next) : null;
  const mismatch = password.confirm && password.next !== password.confirm;

  const changePassword = async () => {
    setSaving(true);
    try {
      await wfilemanagerApi.changePassword(password.current, password.next);
      setPassword({ current: "", next: "", confirm: "" });
      notify({
        kind: "success",
        title: "Password changed",
        subtitle: "The local administrator password was updated.",
      });
    } catch (error) {
      notify({
        kind: "error",
        title: "Unable to change password",
        subtitle: error instanceof Error ? error.message : "The request did not complete.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="wfm-page" aria-labelledby="administrator-title">
      <header className="wfm-page__header">
        <div>
          <h1 id="administrator-title" className="wfm-page__heading">
            Administrator
          </h1>
          <p className="wfm-page__description">
            wFileManager has one local account with the fixed username <strong>admin</strong>.
          </p>
        </div>
      </header>

      <Tile className="wfm-panel-tile wfm-account-form">
        <h2 className="wfm-section-title">Change password</h2>
        <div className="wfm-account-form__fields">
          <PasswordInput
            id="current-password"
            labelText="Current password"
            autoComplete="current-password"
            value={password.current}
            onChange={(event) => setPassword((current) => ({ ...current, current: event.target.value }))}
          />
          <PasswordInput
            id="new-password"
            labelText="New password"
            autoComplete="new-password"
            helperText={ADMIN_PASSWORD_POLICY_TEXT}
            invalid={Boolean(policyError)}
            invalidText={policyError || undefined}
            value={password.next}
            onChange={(event) => setPassword((current) => ({ ...current, next: event.target.value }))}
          />
          <PasswordInput
            id="confirm-password"
            labelText="Confirm password"
            autoComplete="new-password"
            invalid={Boolean(mismatch)}
            invalidText={mismatch ? "Passwords do not match." : undefined}
            value={password.confirm}
            onChange={(event) => setPassword((current) => ({ ...current, confirm: event.target.value }))}
          />
        </div>
        <div className="wfm-update-actions">
          <Button
            renderIcon={Password}
            disabled={
              saving ||
              !password.current ||
              !password.next ||
              Boolean(policyError) ||
              Boolean(mismatch) ||
              !password.confirm
            }
            onClick={() => void changePassword()}
          >
            {saving ? "Changing…" : "Change password"}
          </Button>
        </div>
      </Tile>

      <Tile className="wfm-panel-tile wfm-account-form wfm-space-top">
        <h2 className="wfm-section-title">Lost the password?</h2>
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title="Recovery is server-side only"
          subtitle="Run the reset command from a trusted shell on the server."
        />
        <div className="wfm-space-top">
          <CodeSnippet type="single">sudo wfilemanager-reset-admin-password</CodeSnippet>
        </div>
      </Tile>
    </section>
  );
}
