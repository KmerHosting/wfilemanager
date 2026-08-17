import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, UserCircle2 } from "@/components/ui/icons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { wfilemanagerApi } from "@/lib/wfilemanager-api";
import { ADMIN_PASSWORD_POLICY_TEXT, administratorPasswordError } from "@/lib/admin-password-policy";

export const Route = createFileRoute("/_app/account")({
  head: () => ({ meta: [{ title: "Administrator — wFileManager" }] }),
  component: Administrator,
});

function Administrator() {
  const [password, setPassword] = useState({ current: "", next: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const policyError = password.next ? administratorPasswordError(password.next) : null;
  const mismatch = password.confirm && password.next !== password.confirm;

  const changePassword = async () => {
    setSaving(true);
    try {
      await wfilemanagerApi.changePassword(password.current, password.next);
      setPassword({ current: "", next: "", confirm: "" });
      toast.success("Administrator password changed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to change the password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="wfm-page wfm-account-page">
      <header className="wfm-page__header">
        <div>
          <p className="wfm-eyebrow">Local administrator</p>
          <h1>Administrator</h1>
          <p>wFileManager has one account with the fixed username <strong>admin</strong>.</p>
        </div>
        <UserCircle2 className="h-5 w-5" />
      </header>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" /> Change password
          </CardTitle>
          <CardDescription>
            This password protects the local wFileManager administrator account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={password.current}
                onChange={(event) => setPassword({ ...password, current: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password.next}
                onChange={(event) => setPassword({ ...password, next: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="confirm-password">Confirm</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={password.confirm}
                onChange={(event) => setPassword({ ...password, confirm: event.target.value })}
              />
            </div>
          </div>
          <p className={policyError || mismatch ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            {policyError || (mismatch ? "Passwords do not match." : ADMIN_PASSWORD_POLICY_TEXT)}
          </p>
          <div className="flex justify-end">
            <Button
              disabled={saving || !password.current || !password.next || Boolean(policyError) || Boolean(mismatch) || !password.confirm}
              onClick={() => void changePassword()}
            >
              {saving ? "Changing…" : "Change password"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4 max-w-3xl">
        <CardHeader>
          <CardTitle className="text-base">Lost the password?</CardTitle>
          <CardDescription>Password recovery is intentionally available only from the server shell.</CardDescription>
        </CardHeader>
        <CardContent>
          <code className="block rounded-md border bg-muted/30 p-3 text-sm">sudo wfilemanager-reset-admin-password</code>
        </CardContent>
      </Card>
    </div>
  );
}
