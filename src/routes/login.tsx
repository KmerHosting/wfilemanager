import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — wFileManager" }] }),
  component: LoginPage,
});

function LoginPage() {
  const nav = useNavigate();
  const auth = useAuth();
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const ticket = new URLSearchParams(window.location.search).get("kh_sso");
    if (!ticket) return;
    setSubmitting(true);
    fetch("/api/auth/kmerhosting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket }) })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Unable to sign in with KmerHosting Account.");
        nav({ to: payload.returnPath || "/", replace: true });
      })
      .catch((error) => setErr(error instanceof Error ? error.message : "Unable to sign in with KmerHosting Account."))
      .finally(() => setSubmitting(false));
  }, [nav]);

  useEffect(() => {
    if (!auth.loading && auth.user) nav({ to: "/" });
    if (!auth.loading && auth.configured === false) nav({ to: "/setup" });
  }, [auth.loading, auth.user, auth.configured, nav]);

  return (
    <AuthShell title="Sign in with KmerHosting Account" desc="Use your central KmerHosting Account to access wFileManager.">
      {err && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      )}
      {!new URLSearchParams(window.location.search).get("kh_sso") && <>
      <Button type="button" className="w-full" disabled={submitting} onClick={() => window.location.assign("https://dashboard.kmerhosting.com/login?service=wfilemanager")}>
        {submitting ? "Verifying account…" : "Continue with KmerHosting Account"}
      </Button>
      <p className="mt-4 text-sm text-muted-foreground">New to KmerHosting? Create your account on the central dashboard.</p>
      </>}
    </AuthShell>
  );
}
