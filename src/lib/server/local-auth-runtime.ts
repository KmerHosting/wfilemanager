import {
  sessionUser as sqliteSessionUser,
  userResponse as sqliteUserResponse,
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

export async function requireUser(request: Request): Promise<LocalUser> {
  const token = tokenFromRequest(request);
  if (!token) throw new LocalApiError(401, "Missing user session");
  try {
    const user = sqliteUserResponse(sqliteSessionUser(token));
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      isAdmin: user.isAdmin,
      status: user.status,
    };
  } catch (error) {
    const value = error as { status?: number; message?: string };
    throw new LocalApiError(
      value.status || 401,
      value.message || "Your wFileManager session is invalid or expired",
    );
  }
}

export async function requireAdmin(request: Request): Promise<LocalUser> {
  const user = await requireUser(request);
  if (!user.isAdmin) throw new LocalApiError(403, "Administrator access is required");
  return user;
}
