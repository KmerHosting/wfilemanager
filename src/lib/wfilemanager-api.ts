const DATABASE_MODE = "sqlite";

export interface AuthUser {
  id: "admin" | string;
  instanceId: string;
  username: "admin" | string;
  displayName: "Administrator" | string;
  status: "active";
  isAdmin: true;
  createdAt: string;
}

export interface WFileManagerInstance {
  id: string;
  name: string;
  databaseMode?: "sqlite" | string;
}

export interface SetupPayload {
  password: string;
}

export interface InstanceStatusResponse {
  configured: boolean;
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
  status: () => perform<InstanceStatusResponse>("auth", "status"),
  setup: (data: SetupPayload) =>
    perform<{ success: true; user: AuthUser }>("setup", "setup", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  login: (password: string, remember: boolean) =>
    perform<{ expiresAt: string; user: AuthUser }>("login", "login", {
      method: "POST",
      body: JSON.stringify({ password, remember }),
    }),
  me: () => perform<{ user: AuthUser; instance: WFileManagerInstance }>("auth", "me"),
  logout: () => perform<{ success: true }>("auth", "logout", { method: "POST", body: "{}" }),
  changePassword: (currentPassword: string, newPassword: string) =>
    perform<{ success: true }>("account", "password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
};
