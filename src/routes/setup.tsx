import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button, InlineNotification, PasswordInput, TextInput } from "@carbon/react";
import { AuthShell } from "@/components/auth/auth-shell";
import {
  ADMIN_PASSWORD_POLICY_TEXT,
  administratorPasswordError,
} from "@/lib/admin-password-policy";
import { useAuth } from "@/lib/auth";
import { useNotifications } from "@/lib/notifications";

export const Route = createFileRoute("/setup")({
  head: () => ({ meta: [{ title: "Set up wFileManager" }] }),
  component: Setup,
});

function Setup() {
  const navigate = useNavigate();
  const auth = useAuth();
  const { notify } = useNotifications();
  const [setupCode, setSetupCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.loading && auth.user) navigate({ to: "/explorer" });
    if (!auth.loading && auth.configured === true && !auth.user) navigate({ to: "/login" });
  }, [auth.loading, auth.user, auth.configured, navigate]);

  const policyError = password ? administratorPasswordError(password) : null;
  const confirmationError = confirm && password !== confirm ? "Passwords do not match." : null;
  const valid = Boolean(setupCode.trim() && password && !policyError && password === confirm);

  const completeSetup = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await auth.setup({ password, setupCode: setupCode.trim() });
      notify({
        kind: "success",
        title: "wFileManager is ready",
        subtitle: "Administrator created.",
      });
      navigate({ to: "/explorer" });
    } catch (value) {
      setError(value instanceof Error ? value.message : "Setup failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Set up wFileManager"
      desc="Create the initial administrator account for this server."
    >
      {error ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Setup failed"
          subtitle={error}
        />
      ) : null}

      <div className="wfm-form-stack">
        <div className="wfm-auth-account-note">
          Administrator username: <strong>admin</strong>
        </div>
        <TextInput
          id="setup-code"
          labelText="Setup code"
          helperText="Use the one-time setup code printed by the installer in the server terminal."
          autoFocus
          autoComplete="off"
          spellCheck={false}
          value={setupCode}
          onChange={(event) => setSetupCode(event.target.value)}
        />
        <PasswordInput
          id="setup-password"
          labelText="Password"
          helperText={ADMIN_PASSWORD_POLICY_TEXT}
          invalid={Boolean(policyError)}
          invalidText={policyError || undefined}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <PasswordInput
          id="setup-confirm"
          labelText="Confirm password"
          invalid={Boolean(confirmationError)}
          invalidText={confirmationError || undefined}
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
        <Button
          className="wfm-full-width-button"
          disabled={!valid || submitting}
          onClick={() => void completeSetup()}
        >
          {submitting ? "Creating administrator…" : "Finish setup"}
        </Button>
        <p className="wfm-form-helper">
          The password can always be reset with <code>sudo wfilemanager-reset-admin-password</code>.
        </p>
      </div>
    </AuthShell>
  );
}
