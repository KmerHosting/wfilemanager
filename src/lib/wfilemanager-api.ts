const DATABASE_MODE = "sqlite";

export type InstanceLifecycleStatus = "active" | "frozen" | "disabled";

export interface AuthUser {
  id: string;
  instanceId: string;
  roleId: null;
  username: "admin" | string;
  email: string | null;
  displayName: string;
  timezone?: string;
  status: "active";
  isAdmin: true;
  mustChangePassword: false;
  lastLoginAt?: string | null;
  createdAt: string;
  roleName?: "Administrator" | string | null;
  permissions?: string[];
  allowedPaths?: string[];
}

export interface WFileManagerInstance {
  id: string;
  name: string;
  hostname?: string;
  databaseMode?: string;
  status?: InstanceLifecycleStatus;
}

export interface WFileManagerSession {
  id: string;
  expiresAt: string;
  lastSeenAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  current: boolean;
}

export interface SetupPayload {
  instanceName?: string;
  hostname?: string;
  baseUrl?: string;
  displayName?: string;
  email?: string;
  password: string;
}

export interface InstanceStatusResponse {
  configured: boolean;
  instanceKey?: string;
  status?: InstanceLifecycleStatus;
  instance?: WFileManagerInstance;
}

type GatewayScope = "auth" | "login" | "setup" | "account";

function gatewayUrl(scope: GatewayScope, action: string) {
  const query = new URLSearchParams({ scope, action });
  return `/api/gateway?${query}`;
}

async function perform<T>(scope: GatewayScope, action: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(gatewayUrl(scope, action), {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed (${response.status})`) as Error & {
      status?: number;
      retryAfterSeconds?: number;
    };
    error.status = response.status;
    if (Number.isFinite(payload.retryAfterSeconds))
      error.retryAfterSeconds = Number(payload.retryAfterSeconds);
    throw error;
  }
  return payload as T;
}

export const wfilemanagerApi = {
  databaseMode: DATABASE_MODE,
  getToken: () => null,
  setToken: (_value: string) => undefined,
  clearToken: () => undefined,
  status: () => perform<InstanceStatusResponse>("auth", "status"),
  setup: (data: SetupPayload) =>
    perform<{ success: true; user: AuthUser }>("setup", "setup", {
      method: "POST",
      body: JSON.stringify({ ...data, username: "admin", displayName: data.displayName || "Administrator" }),
    }),
  login: (_login: string, password: string, remember: boolean) =>
    perform<{ expiresAt: string; user: AuthUser }>("login", "login", {
      method: "POST",
      body: JSON.stringify({ login: "admin", password, remember }),
    }),
  me: () => perform<{ user: AuthUser; instance: WFileManagerInstance }>("auth", "me"),
  logout: () => perform<{ success: true }>("auth", "logout", { method: "POST", body: "{}" }),
  accountProfile: () => perform<{ user: AuthUser }>("account", "profile"),
  updateAccountProfile: (data: { displayName: string; email?: string | null; timezone: string }) =>
    perform<{ user: AuthUser }>("account", "profile", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    perform<{ success: true }>("account", "password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  accountSessions: () => perform<{ sessions: WFileManagerSession[] }>("account", "sessions"),
  revokeSession: (id: string) =>
    perform<{ success: true; currentRevoked: boolean }>("account", "sessions", {
      method: "DELETE",
      body: JSON.stringify({ id }),
    }),
  revokeAllSessions: () =>
    perform<{ success: true; currentRevoked: true }>("account", "sessions", {
      method: "DELETE",
      body: JSON.stringify({ all: true }),
    }),

  // Compatibility shim for file-operation code. v0.11 no longer persists or displays notifications.
  createNotification: async (_data: unknown) => ({ notification: null }),
};
