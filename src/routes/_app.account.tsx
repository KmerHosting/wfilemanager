import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  MonitorSmartphone,
  RefreshCw,
  UserCircle2,
} from "@/components/ui/icons";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select as CarbonSelect, SelectItem as CarbonSelectItem } from "@carbon/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { wfilemanagerApi, type WFileManagerSession } from "@/lib/wfilemanager-api";
import { formatRelative } from "@/lib/format";

export const Route = createFileRoute("/_app/account")({
  head: () => ({ meta: [{ title: "Account — wFileManager" }] }),
  component: Account,
});

const TIMEZONES = [
  "UTC",
  "Africa/Douala",
  "Africa/Lagos",
  "Europe/Paris",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Kolkata",
];

function deviceLabel(userAgent: string | null) {
  if (!userAgent) return "Browser on unavailable device";
  if (/^node(?:\.js)?\b/i.test(userAgent.trim())) return "Node.js client";
  const browser = /Firefox/i.test(userAgent)
    ? "Firefox"
    : /Edg/i.test(userAgent)
      ? "Edge"
      : /OPR|Opera/i.test(userAgent)
        ? "Opera"
        : /Chrome/i.test(userAgent)
          ? "Chrome"
          : /Safari/i.test(userAgent)
            ? "Safari"
            : "Browser";
  const system = /Windows/i.test(userAgent)
    ? "Windows"
    : /iPhone|iPad/i.test(userAgent)
      ? "iOS"
      : /Android/i.test(userAgent)
        ? "Android"
        : /Mac OS/i.test(userAgent)
          ? "macOS"
          : /Linux/i.test(userAgent)
            ? "Linux"
            : /CrOS/i.test(userAgent)
              ? "ChromeOS"
              : "unavailable OS";
  return `${browser} on ${system}`;
}

function sessionAddress(session: WFileManagerSession) {
  return session.ipAddress || "Address unavailable for this session";
}

function Account() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState({ displayName: "", email: "", timezone: "UTC" });
  const [profileLoading, setProfileLoading] = useState(true);
  const [sessions, setSessions] = useState<WFileManagerSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = async () => {
    setProfileLoading(true);
    setError(null);
    try {
      const result = await wfilemanagerApi.accountProfile();
      setProfile({
        displayName: result.user.displayName,
        email: result.user.email || "",
        timezone: result.user.timezone || "UTC",
      });
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to load account information");
    } finally {
      setProfileLoading(false);
    }
  };

  const loadSessions = async () => {
    setSessionsLoading(true);
    try {
      const result = await wfilemanagerApi.accountSessions();
      setSessions(result.sessions);
    } catch (value) {
      toast.error(value instanceof Error ? value.message : "Unable to load sessions");
    } finally {
      setSessionsLoading(false);
    }
  };

  useEffect(() => {
    void loadProfile();
    void loadSessions();
  }, []);

  return (
    <div className="wfm-page wfm-account-page">
      <div className="wfm-page__header">
        <div>
          <p className="wfm-eyebrow">Identity and access</p>
          <h1>Account</h1>
          <p>Manage your profile, application password and active sessions.</p>
        </div>
        <UserCircle2 className="h-5 w-5" />
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="wfm-account-sections">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
              <CardDescription>Your identity is managed by your central KmerHosting Account.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Display name</Label>
              <Input
                value={profile.displayName}
                disabled
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Username</Label>
              <Input value={auth.user?.username || ""} disabled />
            </div>
            <div className="grid gap-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={profile.email}
                disabled
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Timezone</Label>
              <CarbonSelect
                id="account-timezone"
                noLabel
                labelText="Timezone"
                size="md"
                value={profile.timezone}
                disabled
              >
                {TIMEZONES.map((timezone) => (
                  <CarbonSelectItem key={timezone} value={timezone} text={timezone} />
                ))}
              </CarbonSelect>
            </div>
            <p className="sm:col-span-2 text-sm text-muted-foreground">Update your identity, avatar and account details from Account settings on the KmerHosting Dashboard.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>Password changes are handled with the OTP-protected Security tab on the KmerHosting Dashboard.</CardDescription>
          </CardHeader>
          <CardContent><Button asChild variant="outline"><a href="https://dashboard.kmerhosting.com/?view=account">Open central account security</a></Button></CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MonitorSmartphone className="h-4 w-4" /> Active sessions
                </CardTitle>
                <CardDescription>
                  Devices currently authenticated with your account.
                </CardDescription>
              </div>
              <Button
                size="icon"
                variant="outline"
                onClick={() => void loadSessions()}
                aria-label="Refresh sessions"
              >
                <RefreshCw className={`h-4 w-4 ${sessionsLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {sessionsLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Loading sessions…
              </div>
            ) : sessions.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No active sessions.
              </div>
            ) : (
              <ul className="wfm-session-list">
                {sessions.map((session) => (
                  <li key={session.id} className="wfm-session-row">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <span className="truncate">{deviceLabel(session.userAgent)}</span>
                        {session.current && <Badge variant="outline">Current</Badge>}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="font-mono">{sessionAddress(session)}</span>
                        <span>Last used {formatRelative(session.lastSeenAt)}</span>
                        <span>Expires {formatRelative(session.expiresAt)}</span>
                      </div>
                    </div>
                    {!session.current && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            await wfilemanagerApi.revokeSession(session.id);
                            setSessions((items) => items.filter((item) => item.id !== session.id));
                            toast.success("Session revoked");
                          } catch (value) {
                            toast.error(
                              value instanceof Error ? value.message : "Unable to revoke session",
                            );
                          }
                        }}
                      >
                        Revoke
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex justify-end">
              <Button
                variant="destructive"
                onClick={async () => {
                  try {
                    await wfilemanagerApi.revokeAllSessions();
                    wfilemanagerApi.clearToken();
                    await auth.logout();
                    navigate({ to: "/login" });
                  } catch (value) {
                    toast.error(
                      value instanceof Error ? value.message : "Unable to revoke sessions",
                    );
                  }
                }}
              >
                Sign out from all devices
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
