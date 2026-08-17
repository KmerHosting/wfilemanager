import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/auth-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ADMIN_PASSWORD_POLICY_TEXT,
  administratorPasswordError,
} from "@/lib/admin-password-policy";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/setup")({
  head: () => ({ meta: [{ title: "Set up wFileManager" }] }),
  component: Setup,
});

function Setup() {
  const nav = useNavigate();
  const auth = useAuth();
  const [setupCode, setSetupCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.loading && auth.user) nav({ to: "/explorer" });
    if (!auth.loading && auth.configured === true && !auth.user) nav({ to: "/login" });
  }, [auth.loading, auth.user, auth.configured, nav]);

  const policyError = password ? administratorPasswordError(password) : null;
  const confirmationError = confirm && password !== confirm ? "Passwords do not match." : null;
  const valid = Boolean(setupCode.trim() && password && !policyError && password === confirm);

  const completeSetup = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await auth.setup({ password, setupCode: setupCode.trim() });
      toast.success("wFileManager is ready");
      nav({ to: "/explorer" });
    } catch (value) {
      setError(value instanceof Error ? value.message : "Setup failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Set up wFileManager"
      desc="Create the only administrator account for this server."
    >
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          Administrator username: <strong>admin</strong>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="setup-code">Setup code</Label>
          <Input
            id="setup-code"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            value={setupCode}
            onChange={(event) => setSetupCode(event.target.value)}
            placeholder="Code shown by the installer"
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Use the one-time setup code printed in the server terminal after installation.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="setup-password">Password</Label>
          <Input
            id="setup-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="setup-confirm">Confirm password</Label>
          <Input
            id="setup-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </div>
        <p
          className={
            policyError || confirmationError
              ? "text-xs text-destructive"
              : "text-xs text-muted-foreground"
          }
        >
          {policyError || confirmationError || ADMIN_PASSWORD_POLICY_TEXT}
        </p>
        <Button
          className="w-full"
          disabled={!valid || submitting}
          onClick={() => void completeSetup()}
        >
          {submitting ? "Creating administrator…" : "Finish setup"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          The password can always be reset from the server with{" "}
          <code>sudo wfilemanager-reset-admin-password</code>.
        </p>
      </div>
    </AuthShell>
  );
}
