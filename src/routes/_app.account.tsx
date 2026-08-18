import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Password } from "@carbon/icons-react";
import {
  Button,
  CodeSnippet,
  Form,
  InlineNotification,
  PasswordInput,
  Tile,
} from "@carbon/react";
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
  const disabled =
    saving ||
    !password.current ||
    !password.next ||
    Boolean(policyError) ||
    Boolean(mismatch) ||
    !password.confirm;

  const changePassword = async () => {
    if (disabled) return;

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

      <div className="wfm-account-stack">
        <section className="wfm-account-section" aria-labelledby="change-password-title">
          <h2 id="change-password-title" className="wfm-section-title">
            Change password
          </h2>
          <Form
            className="wfm-account-password-form"
            onSubmit={(event) => {
              event.preventDefault();
              void changePassword();
            }}
          >
            <div className="wfm-account-password-form__fields">
              <PasswordInput
                id="current-password"
                labelText="Current password"
                autoComplete="current-password"
                value={password.current}
                onChange={(event) =>
                  setPassword((current) => ({ ...current, current: event.target.value }))
                }
              />
              <PasswordInput
                id="new-password"
                labelText="New password"
                autoComplete="new-password"
                helperText={ADMIN_PASSWORD_POLICY_TEXT}
                invalid={Boolean(policyError)}
                invalidText={policyError || undefined}
                value={password.next}
                onChange={(event) =>
                  setPassword((current) => ({ ...current, next: event.target.value }))
                }
              />
              <PasswordInput
                id="confirm-password"
                labelText="Confirm password"
                autoComplete="new-password"
                invalid={Boolean(mismatch)}
                invalidText={mismatch ? "Passwords do not match." : undefined}
                value={password.confirm}
                onChange={(event) =>
                  setPassword((current) => ({ ...current, confirm: event.target.value }))
                }
              />
            </div>
            <div className="wfm-account-password-form__actions">
              <Button renderIcon={Password} type="submit" disabled={disabled}>
                {saving ? "Changing…" : "Change password"}
              </Button>
            </div>
          </Form>
        </section>

        <Tile className="wfm-panel-tile wfm-account-recovery">
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
      </div>
    </section>
  );
}
