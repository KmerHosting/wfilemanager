import { createFileRoute } from "@tanstack/react-router";
import { loginWithCentralEmail } from "@/lib/server/sqlite-store";

const COOKIE_NAME = "wfm_session";
const EXCHANGE_URL = process.env.KMERHOSTING_SSO_EXCHANGE_URL ||
  "https://igihzeyfgwhnuiflamvn.supabase.co/functions/v1/dashboard-sso-exchange";

function cookie(request: Request, token: string, expiresAt: string) {
  const seconds = Math.max(60, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const secure = forwarded === "https" || new URL(request.url).protocol === "https:";
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${secure ? "; Secure" : ""}`;
}

export const Route = createFileRoute("/api/auth/kmerhosting")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as { ticket?: string } | null;
        const ticket = String(body?.ticket || "").trim();
        if (ticket.length < 32 || ticket.length > 512)
          return Response.json({ error: "The KmerHosting sign-in ticket is invalid or expired." }, { status: 401 });

        const exchange = await fetch(EXCHANGE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product: "wfilemanager", ticket }),
        });
        const payload = (await exchange.json().catch(() => ({}))) as {
          account?: { email?: string };
          returnPath?: string;
          error?: { message?: string };
        };
        if (!exchange.ok || !payload.account?.email)
          return Response.json({ error: payload.error?.message || "Unable to verify the KmerHosting Account." }, { status: 401 });

        try {
          const session = loginWithCentralEmail(payload.account.email, request);
          return Response.json(
            { user: session.user, returnPath: payload.returnPath || "/" },
            { headers: { "Set-Cookie": cookie(request, session.token, session.expiresAt) } },
          );
        } catch (error) {
          const status = Number((error as { status?: number }).status || 500);
          return Response.json({ error: error instanceof Error ? error.message : "Unable to open wFileManager." }, { status });
        }
      },
    },
  },
});
