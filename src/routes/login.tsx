import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AuthShell } from "@/components/auth/auth-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — wFileManager" }] }),
  component: LoginPage,
});

function LoginPage() {
  const nav = useNavigate();
  const auth = useAuth();
  const [pass, setPass] = useState("");
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!auth.loading && auth.user) nav({ to: "/explorer" });
    if (!auth.loading && auth.configured === false) nav({ to: "/setup" });
  }, [auth.loading, auth.user, auth.configured, nav]);

  return (
    <AuthShell
      title="Administrator sign in"
      desc="Enter the password for this wFileManager server."
    >
      {err && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      )}
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setErr(null);
          setSubmitting(true);
          try {
            await auth.login(pass, remember);
            toast.success("Signed in");
            nav({ to: "/explorer" });
          } catch (error) {
            setErr(error instanceof Error ? error.message : "Sign-in failed");
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          Account: <strong>admin</strong>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pass">Password</Label>
          <Input
            id="pass"
            autoFocus
            type="password"
            autoComplete="current-password"
            value={pass}
            onChange={(event) => setPass(event.target.value)}
            placeholder="••••••••••••"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={remember} onCheckedChange={(value) => setRemember(!!value)} />
          <span>Keep me signed in on this device</span>
        </label>
        <Button type="submit" className="w-full" disabled={submitting || !pass}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Lost the password? Run <code>sudo wfilemanager-reset-admin-password</code> on the server.
        </p>
      </form>
    </AuthShell>
  );
}
