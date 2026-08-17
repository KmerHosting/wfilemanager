import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  SqliteAuthError,
  changePassword,
  instanceInfo,
  isConfigured,
  login,
  logout,
  sessionUser,
  setup,
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
  const supplied = String(payload.setupCode || "").trim();
  if (!expected || !supplied || !secureEqual(expected, supplied))
    throw new SqliteAuthError(403, "The setup code is invalid. Use the code shown by the installer.");
  delete payload.setupCode;
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
            const configured = isConfigured();
            return json({ configured, instance: configured ? instanceInfo() : undefined });
          }
          if (scope === "auth" && action === "me") {
            const user = sessionUser(token(request));
            return json({ user: userResponse(user), instance: instanceInfo() });
          }
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
              const result = login(payload);
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
    },
  },
});
