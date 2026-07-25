import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Cache-Control": "no-store",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const encoder = new TextEncoder();
const SESSION_DAYS = 30;

type Customer = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  company: string | null;
  country: string | null;
  billing_address: string | null;
  billing_city: string | null;
  billing_postal_code: string | null;
  status: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function clean(value: unknown) {
  return String(value || "").trim();
}

function normalizeEmail(value: unknown) {
  return clean(value).toLowerCase();
}

function emailValid(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string) {
  const cleanHex = hex.trim().toLowerCase();
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function randomHex(byteLength = 16) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function sha256(value: string) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

async function passwordHash(password: string, saltHex = randomHex(16)) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexToBytes(saltHex), iterations: 150_000, hash: "SHA-256" },
    key,
    256,
  );
  return { salt: saltHex, hash: bytesToHex(new Uint8Array(bits)) };
}

async function verifyPassword(password: string, salt: string, expectedHash: string) {
  const result = await passwordHash(password, salt);
  return result.hash === expectedHash;
}

function normalizeCameroonPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 9 && digits.startsWith("6")) return `237${digits}`;
  if (digits.length === 12 && digits.startsWith("237")) return digits;
  return digits;
}

function publicCustomer(customer: Customer) {
  return {
    id: customer.id,
    email: customer.email,
    fullName: customer.full_name,
    phone: customer.phone,
    company: customer.company,
    country: customer.country,
    billingAddress: customer.billing_address,
    billingCity: customer.billing_city,
    billingPostalCode: customer.billing_postal_code,
    status: customer.status,
  };
}

async function loadConfig() {
  const { data, error } = await supabase
    .from("wfilemanager_pro_subscription_config")
    .select("function_url,price_usd,price_xaf,currency,period_days,storage_quota_bytes")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  return {
    subscriptionApi: String(data?.function_url || `${supabaseUrl}/functions/v1/wfilemanager-pro-subscription-api`).replace(/\/$/, ""),
    priceUsd: Number(data?.price_usd || 50),
    priceXaf: Number(data?.price_xaf || 30000),
    currency: String(data?.currency || "XAF"),
    periodDays: Number(data?.period_days || 365),
    storageQuotaBytes: Number(data?.storage_quota_bytes || 104857600),
  };
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

async function createSession(customerId: string, request: Request) {
  const token = `wfm_${randomHex(32)}`;
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from("wfilemanager_customer_sessions").insert({
    customer_id: customerId,
    token_hash: tokenHash,
    user_agent: request.headers.get("user-agent") || null,
    expires_at: expiresAt,
  });
  if (error) throw error;
  return { token, expiresAt };
}

async function auth(request: Request) {
  const token = bearerToken(request);
  if (!token) return null;

  const tokenHash = await sha256(token);
  const { data: session, error } = await supabase
    .from("wfilemanager_customer_sessions")
    .select("id,customer_id,expires_at,revoked_at,wfilemanager_customer_accounts(*)")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  if (!session?.wfilemanager_customer_accounts) return null;

  const customer = session.wfilemanager_customer_accounts as unknown as Customer;
  if (customer.status !== "active") return null;
  return { customer, sessionId: String(session.id) };
}

function profileFromBody(body: Record<string, unknown>) {
  return {
    email: normalizeEmail(body.email || body.buyerEmail),
    password: clean(body.password),
    fullName: clean(body.fullName || body.buyerName || body.name),
    phone: normalizeCameroonPhone(clean(body.phone || body.buyerPhone)),
    company: clean(body.company || body.buyerCompany) || null,
    country: clean(body.country || body.buyerCountry),
    billingAddress: clean(body.billingAddress || body.address),
    billingCity: clean(body.billingCity || body.city) || null,
    billingPostalCode: clean(body.billingPostalCode || body.postalCode) || null,
  };
}

function validateProfile(input: ReturnType<typeof profileFromBody>, requirePassword = false) {
  if (!emailValid(input.email)) return "A valid email is required";
  if (requirePassword && input.password.length < 8) return "Password must contain at least 8 characters";
  if (input.fullName.length < 2) return "Full name is required";
  if (input.country.length < 2) return "Country is required";
  if (input.billingAddress.length < 4) return "Billing address is required";
  return "";
}

async function register(request: Request, body: Record<string, unknown>) {
  const input = profileFromBody(body);
  const validation = validateProfile(input, true);
  if (validation) return json({ error: validation }, 400);

  const password = await passwordHash(input.password);
  const { data: customer, error } = await supabase.from("wfilemanager_customer_accounts").insert({
    email: input.email,
    password_hash: password.hash,
    password_salt: password.salt,
    full_name: input.fullName,
    phone: input.phone || null,
    company: input.company,
    country: input.country,
    billing_address: input.billingAddress,
    billing_city: input.billingCity,
    billing_postal_code: input.billingPostalCode,
  }).select("*").single();

  if (error) {
    if (String(error.code) === "23505") return json({ error: "An account already exists for this email" }, 409);
    throw error;
  }

  const session = await createSession(customer.id, request);
  return json({ customer: publicCustomer(customer), token: session.token, expiresAt: session.expiresAt });
}

async function login(request: Request, body: Record<string, unknown>) {
  const email = normalizeEmail(body.email);
  const password = clean(body.password);
  if (!emailValid(email) || !password) return json({ error: "Email and password are required" }, 400);

  const { data: customer, error } = await supabase
    .from("wfilemanager_customer_accounts")
    .select("*")
    .eq("email", email)
    .maybeSingle();
  if (error) throw error;
  if (!customer || customer.status !== "active") return json({ error: "Invalid email or password" }, 401);
  if (!await verifyPassword(password, customer.password_salt, customer.password_hash)) {
    return json({ error: "Invalid email or password" }, 401);
  }

  await supabase.from("wfilemanager_customer_accounts").update({ last_login_at: new Date().toISOString() }).eq("id", customer.id);
  const session = await createSession(customer.id, request);
  return json({ customer: publicCustomer(customer), token: session.token, expiresAt: session.expiresAt });
}

async function logout(request: Request) {
  const current = await auth(request);
  if (current) {
    await supabase.from("wfilemanager_customer_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", current.sessionId);
  }
  return json({ ok: true });
}

async function updateProfile(request: Request, body: Record<string, unknown>) {
  const current = await auth(request);
  if (!current) return json({ error: "Authentication required" }, 401);

  const input = profileFromBody({ ...body, email: current.customer.email });
  const validation = validateProfile(input, false);
  if (validation) return json({ error: validation }, 400);

  const { data: customer, error } = await supabase.from("wfilemanager_customer_accounts").update({
    full_name: input.fullName,
    phone: input.phone || null,
    company: input.company,
    country: input.country,
    billing_address: input.billingAddress,
    billing_city: input.billingCity,
    billing_postal_code: input.billingPostalCode,
    updated_at: new Date().toISOString(),
  }).eq("id", current.customer.id).select("*").single();
  if (error) throw error;

  return json({ customer: publicCustomer(customer) });
}

function safeTokenRow(order: any) {
  const token = order.wfilemanager_pro_activation_tokens;
  return {
    orderReference: order.order_reference,
    status: order.status,
    amountUsd: order.amount_usd,
    amountXaf: order.amount_xaf,
    currency: order.currency,
    paymentUrl: order.provider_payment_url,
    paidAt: order.paid_at,
    activationEmailSentAt: order.token_email_sent_at,
    emailError: Boolean(order.token_email_error),
    hasActivationToken: Boolean(order.activation_token_id),
    tokenStatus: token?.status || null,
    tokenClaimedAt: token?.claimed_at || null,
    tokenExpiresAt: token?.expires_at || null,
    tokenInstanceKey: token?.instance_key || null,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  };
}

async function dashboard(request: Request) {
  const current = await auth(request);
  if (!current) return json({ error: "Authentication required" }, 401);

  const config = await loadConfig();
  const { data: orders, error } = await supabase
    .from("wfilemanager_pro_orders")
    .select("order_reference,status,amount_usd,amount_xaf,currency,provider_payment_url,paid_at,token_email_sent_at,token_email_error,activation_token_id,created_at,updated_at,wfilemanager_pro_activation_tokens(status,claimed_at,expires_at,instance_key)")
    .eq("buyer_email", current.customer.email)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;

  return json({
    customer: publicCustomer(current.customer),
    plan: {
      name: "wFileManager Pro",
      priceUsd: config.priceUsd,
      priceXaf: config.priceXaf,
      currency: config.currency,
      periodDays: config.periodDays,
      storageQuotaBytes: config.storageQuotaBytes,
    },
    orders: (orders || []).map(safeTokenRow),
  });
}

async function checkout(request: Request) {
  const current = await auth(request);
  if (!current) return json({ error: "Authentication required" }, 401);

  const config = await loadConfig();
  const billing = {
    buyerName: current.customer.full_name,
    buyerEmail: current.customer.email,
    buyerPhone: current.customer.phone,
    buyerCompany: current.customer.company,
    buyerCountry: current.customer.country,
    billingAddress: current.customer.billing_address,
    billingCity: current.customer.billing_city,
    billingPostalCode: current.customer.billing_postal_code,
  };

  const response = await fetch(`${config.subscriptionApi}/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(billing),
  });
  const payload = await response.json().catch(() => ({}));
  return json(payload, response.status);
}

async function orderStatus(request: Request, url: URL) {
  const current = await auth(request);
  if (!current) return json({ error: "Authentication required" }, 401);

  const reference = clean(url.searchParams.get("orderReference") || url.searchParams.get("order"));
  if (!reference) return json({ error: "Order reference is required" }, 400);

  const config = await loadConfig();
  const response = await fetch(`${config.subscriptionApi}/order?${new URLSearchParams({
    orderReference: reference,
    email: current.customer.email,
  })}`);
  const payload = await response.json().catch(() => ({}));
  return json(payload, response.status);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  try {
    const url = new URL(request.url);
    const action = url.pathname.split("/").filter(Boolean).pop() || "status";

    if (action === "register") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      return await register(request, await request.json().catch(() => ({})));
    }
    if (action === "login") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      return await login(request, await request.json().catch(() => ({})));
    }
    if (action === "logout") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      return await logout(request);
    }
    if (action === "profile") {
      if (!["POST", "PUT"].includes(request.method)) return json({ error: "Method not allowed" }, 405);
      return await updateProfile(request, await request.json().catch(() => ({})));
    }
    if (action === "dashboard" || action === "me") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      return await dashboard(request);
    }
    if (action === "checkout") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      return await checkout(request);
    }
    if (action === "order") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      return await orderStatus(request, url);
    }
    if (action === "status") return json({ ok: true, customerAccounts: true });

    return json({ error: "Not found" }, 404);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Customer API failed" }, 500);
  }
});