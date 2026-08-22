export function sameOrigin(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const suppliedOrigin = new URL(origin);
    if (!["http:", "https:"].includes(suppliedOrigin.protocol)) return false;

    // Fetch Metadata is set by browsers and cannot be overridden by page JavaScript.
    // It is more reliable than reconstructing the public URL from an internal
    // Request object, especially when Nitro is reached directly by IP address.
    if (fetchSite === "same-origin") return true;

    const publicBaseUrl = process.env.WFILEMANAGER_PUBLIC_BASE_URL?.trim();
    const requestUrl = new URL(request.url);
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = request.headers.get("host")?.split(",")[0]?.trim();
    const protocol = forwardedProto || requestUrl.protocol.slice(0, -1);
    const expectedOrigins = new Set([requestUrl.origin]);
    if (publicBaseUrl) expectedOrigins.add(new URL(publicBaseUrl).origin);
    if (host) expectedOrigins.add(new URL(`${protocol}://${host}`).origin);
    if (forwardedHost) expectedOrigins.add(new URL(`${protocol}://${forwardedHost}`).origin);
    return expectedOrigins.has(suppliedOrigin.origin);
  } catch {
    return false;
  }
}
