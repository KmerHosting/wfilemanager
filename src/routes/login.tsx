import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button, Checkbox, InlineNotification, PasswordInput } from "@carbon/react";
import { AuthShell } from "@/components/auth/auth-shell";
import { useAuth } from "@/lib/auth";
import { useNotifications } from "@/lib/notifications";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — wFileManager" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const { notify } = useNotifications();
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!auth.loading && auth.user) navigate({ to: "/explorer" });
    if (!auth.loading && auth.configured === false) navigate({ to: "/setup" });
  }, [auth.loading, auth.user, auth.configured, navigate]);

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await auth.login(password, remember);
      notify({ kind: "success", title: "Signed in", subtitle: "Administrator session started." });
      navigate({ to: "/explorer" });
    } catch (value) {
      setError(value instanceof Error ? value.message : "Sign-in failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Administrator sign in"
      desc="Enter the password for the local administrator account on this server."
    >
      {error ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Unable to sign in"
          subtitle={error}
        />
      ) : null}

      <form
        className="wfm-form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="wfm-auth-account-note">
          Account: <strong>admin</strong>
        </div>
        <PasswordInput
          id="login-password"
          labelText="Password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Checkbox
          id="remember-session"
          labelText="Keep me signed in on this device"
          checked={remember}
          onChange={(_, data) => setRemember(data.checked)}
        />
        <Button
          type="submit"
          className="wfm-full-width-button"
          disabled={submitting || !password}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
        <p className="wfm-form-helper">
          Lost the password? Run <code>sudo wfilemanager-reset-admin-password</code> on the server.
        </p>
      </form>
    </AuthShell>
  );
}
