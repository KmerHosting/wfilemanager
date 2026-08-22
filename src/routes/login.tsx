import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button, Checkbox, InlineNotification, PasswordInput, TextInput } from "@carbon/react";
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
  const [username, setUsername] = useState("admin");
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
      await auth.login(username, password, remember);
      notify({ kind: "success", title: "Signed in", subtitle: "Your session is ready." });
      navigate({ to: "/explorer" });
    } catch (value) {
      setError(value instanceof Error ? value.message : "Sign-in failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title="Sign in" desc="Enter your local wFileManager account credentials.">
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
        <TextInput
          id="login-username"
          labelText="Username"
          autoFocus
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <PasswordInput
          id="login-password"
          labelText="Password"
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
          disabled={submitting || !username.trim() || !password}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
        <p className="wfm-form-helper">
          Administrators can recover access with <code>sudo wfilemanager-reset-admin-password</code>
          . Other users should contact an administrator.
        </p>
      </form>
    </AuthShell>
  );
}
