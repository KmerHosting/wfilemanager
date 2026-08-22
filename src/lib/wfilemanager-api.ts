const DATABASE_MODE = "sqlite";

export interface AuthUser {
  id: string;
  instanceId: string;
  username: string;
  displayName: string;
  status: "active" | "suspended";
  isAdmin: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface WFileManagerInstance {
  id: string;
  name: string;
  databaseMode?: "sqlite" | string;
}

export interface SetupPayload {
  password: string;
  setupCode: string;
}

export interface InstanceStatusResponse {
  configured: boolean;
  instance?: WFileManagerInstance;
}

type GatewayScope = "auth" | "login" | "setup" | "account" | "users";

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
  status: () => perform<InstanceStatusResponse>("auth", "status"),
  setup: (data: SetupPayload) =>
    perform<{ success: true; user: AuthUser }>("setup", "setup", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  login: (username: string, password: string, remember: boolean) =>
    perform<{ expiresAt: string; user: AuthUser }>("login", "login", {
      method: "POST",
      body: JSON.stringify({ username, password, remember }),
    }),
  me: () => perform<{ user: AuthUser; instance: WFileManagerInstance }>("auth", "me"),
  logout: () => perform<{ success: true }>("auth", "logout", { method: "POST", body: "{}" }),
  changePassword: (currentPassword: string, newPassword: string) =>
    perform<{ success: true }>("account", "password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  users: () => perform<{ users: AuthUser[] }>("users", "list"),
  createUser: (username: string, displayName: string, password: string) =>
    perform<{ user: AuthUser }>("users", "create", {
      method: "POST",
      body: JSON.stringify({ username, displayName, password }),
    }),
  resetUserPassword: (userId: string, password: string) =>
    perform<{ success: true }>("users", "reset-password", {
      method: "POST",
      body: JSON.stringify({ userId, password }),
    }),
  setUserSuspended: (userId: string, suspended: boolean) =>
    perform<{ user: AuthUser }>("users", "suspension", {
      method: "POST",
      body: JSON.stringify({ userId, suspended }),
    }),
  deleteUser: (userId: string) =>
    perform<{ success: true }>("users", "delete", {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),
};
