import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  SqliteAuthError,
  changePassword,
  instanceInfo,
  isConfigured,
  listSessions,
  login,
  logout,
  profile,
  revokeSessions,
  sessionUser,
  setup,
  updateProfile,
  userResponse,
} from "@/lib/server/admin-store";
import {
  assertLoginAllowed,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/lib/server/login-rate-limit";

const MAX_BODY_BYTES = Math.max(
  16 * 1024,
  Number(process.env.WFILEMANAGER_SQLITE_API_MAX_BODY_BYTES || 1024 * 1024),
);
const SETUP_SECRET_FILE =
  process.env.WFILEMANAGER_SETUP_SECRET_FILE || "/etc/wfilemanager/setup-secret.key";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function token(request: Request) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function sameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const publicBaseUrl = process.env.WFILEMANAGER_PUBLIC_BASE_URL?.trim();
    const expectedOrigin = publicBaseUrl
      ? new URL(publicBaseUrl).origin
      : new URL(request.url).origin;
    return new URL(origin).origin === expectedOrigin;
  } catch {
    return false;
  }
}

async function body(request: Request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) throw new SqliteAuthError(413, "The request body is too large.");
  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES)
    throw new SqliteAuthError(413, "The request body is too large.");
  return (JSON.parse(text || "{}") || {}) as Record<string, unknown>;
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function assertSetupSecret(payload: Record<string, unknown>) {
  const expected = (await readFile(SETUP_SECRET_FILE, "utf8").catch(() => "")).trim();
  const supplied = String(payload.setupSecret || "").trim();
  if (!expected || !supplied || !secureEqual(expected, supplied))
    throw new SqliteAuthError(403, "The local installation setup secret is invalid.");
  delete payload.setupSecret;
}

function errorResponse(error: unknown) {
  if (error instanceof SqliteAuthError) return json({ error: error.message }, error.status);
  console.error(error);
  return json(
    { error: error instanceof Error ? error.message : "SQLite backend request failed." },
    500,
  );
}

export const Route = createFileRoute("/api/sqlite")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const scope = url.searchParams.get("scope") || "auth";
          const action = url.searchParams.get("action") || "status";

          if (scope === "auth" && action === "status") {
            return json({
              configured: isConfigured(),
              instance: isConfigured() ? instanceInfo() : undefined,
            });
          }

          const sessionToken = token(request);
          const user = sessionUser(sessionToken);
          if (scope === "auth" && action === "me")
            return json({ user: userResponse(user), instance: instanceInfo() });
          if (scope === "account" && action === "profile") return json(profile(user));
          if (scope === "account" && action === "sessions")
            return json(listSessions(user, sessionToken, request));
          return json({ error: "Unsupported single-admin API action." }, 404);
        } catch (error) {
          return errorResponse(error);
        }
      },

      POST: async ({ request }) => {
        try {
          if (!sameOrigin(request)) return json({ error: "Cross-origin request rejected" }, 403);
          const url = new URL(request.url);
          const scope = url.searchParams.get("scope") || "auth";
          const action = url.searchParams.get("action") || "";
          const payload = await body(request);

          if (scope === "auth" && action === "setup") {
            await assertSetupSecret(payload);
            return json(setup(payload), 201);
          }
          if (scope === "auth" && action === "login") {
            assertLoginAllowed(request, "admin");
            try {
              const result = login({ ...payload, login: payload.login || "admin" }, request);
              recordLoginSuccess(request, "admin");
              return json(result);
            } catch (error) {
              if (error instanceof SqliteAuthError && error.status === 401)
                recordLoginFailure(request, "admin");
              throw error;
            }
          }

          const sessionToken = token(request);
          const user = sessionUser(sessionToken);
          if (scope === "auth" && action === "logout") return json(logout(sessionToken));
          if (scope === "account" && action === "password")
            return json(changePassword(user, payload, sessionToken));
          return json({ error: "Unsupported single-admin API action." }, 404);
        } catch (error) {
          return errorResponse(error);
        }
      },

      PATCH: async ({ request }) => {
        try {
          if (!sameOrigin(request)) return json({ error: "Cross-origin request rejected" }, 403);
          const url = new URL(request.url);
          const scope = url.searchParams.get("scope") || "auth";
          const action = url.searchParams.get("action") || "";
          const payload = await body(request);
          const user = sessionUser(token(request));
          if (scope === "account" && action === "profile") return json(updateProfile(user, payload));
          return json({ error: "Unsupported single-admin API action." }, 404);
        } catch (error) {
          return errorResponse(error);
        }
      },

      DELETE: async ({ request }) => {
        try {
          if (!sameOrigin(request)) return json({ error: "Cross-origin request rejected" }, 403);
          const url = new URL(request.url);
          const scope = url.searchParams.get("scope") || "auth";
          const action = url.searchParams.get("action") || "";
          const payload = await body(request);
          const sessionToken = token(request);
          const user = sessionUser(sessionToken);
          if (scope === "account" && action === "sessions")
            return json(revokeSessions(user, payload, sessionToken));
          return json({ error: "Unsupported single-admin API action." }, 404);
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});
