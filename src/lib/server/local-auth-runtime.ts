import {
  sessionUser as sqliteSessionUser,
  userResponse as sqliteUserResponse,
  verifyPassword as sqliteVerifyPassword,
} from "@/lib/server/admin-store";
import { LocalApiError, type LocalUser as BaseLocalUser } from "@/lib/server/local-runtime";

const COOKIE_NAME = "wfm_session";

export type LocalUser = BaseLocalUser;
export { LocalApiError };

function cookieValue(request: Request, name: string) {
  const cookies = request.headers.get("cookie") || "";
  for (const item of cookies.split(";")) {
    const [key, ...parts] = item.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
  return "";
}

function tokenFromRequest(request: Request) {
  const value = request.headers.get("authorization") || "";
  if (value.startsWith("Bearer ")) return value.slice(7).trim();
  return cookieValue(request, COOKIE_NAME);
}

function sqliteUser(request: Request): LocalUser {
  const token = tokenFromRequest(request);
  if (!token) throw new LocalApiError(401, "Missing session token");
  try {
    const user = sqliteUserResponse(sqliteSessionUser(token));
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      isAdmin: true,
      status: "active",
      roleId: null,
      roleName: "Administrator",
      permissions: ["admin"],
    };
  } catch (error) {
    const value = error as { status?: number; message?: string };
    throw new LocalApiError(
      value.status || 401,
      value.message || "Your wFileManager session is invalid or expired",
    );
  }
}

export async function requireUser(request: Request): Promise<LocalUser> {
  return sqliteUser(request);
}

export function assertAdmin(user: LocalUser) {
  if (!user.isAdmin)
    throw new LocalApiError(403, "Administrator access is required for this operation");
}

export function assertPermission(user: LocalUser, _permission: string) {
  assertAdmin(user);
}

export function assertAnyPermission(user: LocalUser, _permissions: string[]) {
  assertAdmin(user);
}

export async function requireAdmin(request: Request) {
  const user = await requireUser(request);
  assertAdmin(user);
  return user;
}

export async function requirePermission(request: Request, permission: string) {
  const user = await requireUser(request);
  assertPermission(user, permission);
  return user;
}

export async function requireAnyPermission(request: Request, permissions: string[]) {
  const user = await requireUser(request);
  assertAnyPermission(user, permissions);
  return user;
}

export async function verifyCurrentPassword(request: Request, passwordInput: unknown) {
  const token = tokenFromRequest(request);
  const password = typeof passwordInput === "string" ? passwordInput : "";
  if (!token || !password) throw new LocalApiError(400, "Your current password is required");
  try {
    sqliteVerifyPassword(sqliteSessionUser(token), password);
    return true;
  } catch (error) {
    const value = error as { status?: number; message?: string };
    throw new LocalApiError(value.status || 401, value.message || "The password is incorrect");
  }
}
