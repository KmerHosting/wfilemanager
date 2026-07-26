import type { AuthUser, SetupPayload } from "./wfilemanager-api";

export async function setupWFileManager(data: SetupPayload) {
  const response = await fetch("/api/gateway?scope=setup&action=setup", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Setup failed (${response.status})`);
  return payload as { success: true; user: AuthUser };
}

async function setupOtp(data: { action: "send-otp" | "verify-otp"; email: string; code?: string }) {
  const response = await fetch("/api/gateway?scope=setup&action=setup", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Verification failed (${response.status})`);
  return payload as { success: true; verified?: boolean; expiresInSeconds?: number };
}

export function sendSetupOtp(email: string) {
  return setupOtp({ action: "send-otp", email });
}

export function verifySetupOtp(email: string, code: string) {
  return setupOtp({ action: "verify-otp", email, code });
}
