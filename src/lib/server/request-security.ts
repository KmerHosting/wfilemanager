export function sameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const publicBaseUrl = process.env.WFILEMANAGER_PUBLIC_BASE_URL?.trim();
    const requestUrl = new URL(request.url);
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const host = request.headers.get("host") || requestUrl.host;
    const expectedOrigin = publicBaseUrl
      ? new URL(publicBaseUrl).origin
      : new URL(`${forwardedProto || requestUrl.protocol.slice(0, -1)}://${host}`).origin;
    return new URL(origin).origin === expectedOrigin;
  } catch {
    return false;
  }
}
