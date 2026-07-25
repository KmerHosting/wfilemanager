import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Cache-Control": "no-store",
};
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } }); }

type Config = { mailtrapApiToken: string; mailtrapApiUrl: string; mailtrapFromEmail: string; mailtrapFromName: string; supportEmail: string; siteUrl: string; priceUsd: number; periodDays: number };
async function loadConfig(): Promise<Config> {
  const { data, error } = await supabase.from("wfilemanager_pro_subscription_config").select("mailtrap_api_token,mailtrap_api_url,mailtrap_from_email,mailtrap_from_name,support_email,site_url,price_usd,period_days").eq("id", true).maybeSingle();
  if (error) throw error;
  return {
    mailtrapApiToken: String(data?.mailtrap_api_token || ""),
    mailtrapApiUrl: String(data?.mailtrap_api_url || "https://send.api.mailtrap.io/api/send"),
    mailtrapFromEmail: String(data?.mailtrap_from_email || "support@kmerhosting.com"),
    mailtrapFromName: String(data?.mailtrap_from_name || "KmerHosting"),
    supportEmail: String(data?.support_email || "support@kmerhosting.com"),
    siteUrl: String(data?.site_url || "https://wfilemanager.com").replace(/\/$/, ""),
    priceUsd: Number(data?.price_usd || 50),
    periodDays: Number(data?.period_days || 365),
  };
}
async function sendMail(config: Config, params: { email: string; name: string; subject: string; text: string; html: string; category: string }) {
  if (!config.mailtrapApiToken) throw new Error("Mailtrap API token is not configured");
  const response = await fetch(config.mailtrapApiUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.mailtrapApiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: { email: config.mailtrapFromEmail, name: config.mailtrapFromName }, to: [{ email: params.email, name: params.name || "Customer" }], subject: params.subject, text: params.text, html: params.html, category: params.category }),
  });
  const result = await response.text();
  if (!response.ok) throw new Error(`Mailtrap failed (${response.status}): ${result.slice(0, 300)}`);
}

async function customerForInstance(instance: any) {
  if (instance.billing_customer_id) {
    const { data, error } = await supabase.from("wfilemanager_customer_accounts").select("id,email,full_name,balance_usd,status").eq("id", instance.billing_customer_id).maybeSingle();
    if (error) throw error;
    if (data?.status === "active") return { id: data.id, email: data.email, name: data.full_name || "Customer", balanceUsd: Number(data.balance_usd || 0) };
  }
  const { data: token, error: tokenError } = await supabase.from("wfilemanager_pro_activation_tokens").select("customer_id,customer_email,order_reference,claimed_at").eq("instance_key", instance.instance_key).eq("status", "claimed").order("claimed_at", { ascending: false }).limit(1).maybeSingle();
  if (tokenError) throw tokenError;
  if (!token?.customer_email) return null;
  if (token.customer_id) {
    const { data } = await supabase.from("wfilemanager_customer_accounts").select("id,email,full_name,balance_usd,status").eq("id", token.customer_id).maybeSingle();
    if (data?.status === "active") return { id: data.id, email: data.email, name: data.full_name || "Customer", balanceUsd: Number(data.balance_usd || 0) };
  }
  const { data: order } = await supabase.from("wfilemanager_pro_orders").select("customer_id,buyer_name,buyer_email").eq("order_reference", token.order_reference).maybeSingle();
  if (!order?.customer_id) return null;
  const { data: account } = await supabase.from("wfilemanager_customer_accounts").select("id,email,full_name,balance_usd,status").eq("id", order.customer_id).maybeSingle();
  if (!account || account.status !== "active") return null;
  return { id: account.id, email: account.email, name: account.full_name || order.buyer_name || "Customer", balanceUsd: Number(account.balance_usd || 0) };
}

async function reserveReminder(instance: any, customer: any, kind: string, paidUntil: string | null) {
  const insert = await supabase.from("wfilemanager_billing_reminders").insert({ instance_key: instance.instance_key, customer_email: customer.email, reminder_kind: kind, paid_until: paidUntil }).select("id").single();
  if (insert.error) {
    if (String(insert.error.code) === "23505") return null;
    throw insert.error;
  }
  return insert.data.id as string;
}
async function markReminderError(id: string, error: unknown) {
  await supabase.from("wfilemanager_billing_reminders").update({ email_error: error instanceof Error ? error.message : "Email failed" }).eq("id", id);
}

async function sendAutoRenewSuccess(config: Config, instance: any, customer: any, oldPaidUntil: string, newPaidUntil: string, balanceUsd: number) {
  const subject = "Your wFileManager Pro licence was renewed automatically";
  const action = `${config.siteUrl}/account`;
  const text = `Hello ${customer.name},\n\nYour wFileManager Pro licence was renewed automatically from your USD account balance.\n\nInstance: ${instance.instance_key}\nAmount charged: $${config.priceUsd.toFixed(2)} USD\nPrevious expiry: ${new Date(oldPaidUntil).toUTCString()}\nNew expiry: ${new Date(newPaidUntil).toUTCString()}\nRemaining balance: $${balanceUsd.toFixed(2)} USD\n\nAccount: ${action}\n\nTechnical support: ${config.supportEmail}.`;
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.5;color:#111827"><h2>${subject}</h2><p>Hello ${customer.name},</p><p>Your licence was renewed from your account balance.</p><p><strong>Instance:</strong> ${instance.instance_key}</p><p><strong>Amount charged:</strong> $${config.priceUsd.toFixed(2)} USD</p><p><strong>New expiry:</strong> ${new Date(newPaidUntil).toUTCString()}</p><p><strong>Remaining balance:</strong> $${balanceUsd.toFixed(2)} USD</p><p><a href="${action}">Open customer account</a></p><p>Technical support: <a href="mailto:${config.supportEmail}">${config.supportEmail}</a></p></body></html>`;
  await sendMail(config, { email: customer.email, name: customer.name, subject, text, html, category: "wfilemanager-auto-renew-success" });
}
async function sendAutoRenewInsufficient(config: Config, instance: any, customer: any) {
  const missing = Math.max(0, config.priceUsd - Number(customer.balanceUsd || 0));
  const subject = "Your wFileManager Pro auto-renewal needs more account balance";
  const action = `${config.siteUrl}/account`;
  const text = `Hello ${customer.name},\n\nWe could not renew your wFileManager Pro licence because your USD account balance is insufficient.\n\nInstance: ${instance.instance_key}\nRequired: $${config.priceUsd.toFixed(2)} USD\nAvailable: $${Number(customer.balanceUsd || 0).toFixed(2)} USD\nMissing: $${missing.toFixed(2)} USD\nCurrent expiry: ${new Date(instance.paid_until).toUTCString()}\n\nAdd funds or pay the renewal directly: ${action}\n\nTechnical support: ${config.supportEmail}.`;
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.5;color:#111827"><h2>${subject}</h2><p>Hello ${customer.name},</p><p><strong>Instance:</strong> ${instance.instance_key}</p><p><strong>Required:</strong> $${config.priceUsd.toFixed(2)} USD</p><p><strong>Available:</strong> $${Number(customer.balanceUsd || 0).toFixed(2)} USD</p><p><strong>Missing:</strong> $${missing.toFixed(2)} USD</p><p><a href="${action}" style="display:inline-block;padding:10px 14px;background:#111827;color:#fff;text-decoration:none;border-radius:6px">Add funds or renew directly</a></p><p>Technical support: <a href="mailto:${config.supportEmail}">${config.supportEmail}</a></p></body></html>`;
  await sendMail(config, { email: customer.email, name: customer.name, subject, text, html, category: "wfilemanager-auto-renew-insufficient" });
}

async function runAutoRenewals(config: Config) {
  const horizon = new Date(Date.now() + 7 * 86400000).toISOString();
  const { data: instances, error } = await supabase.from("wfilemanager_instances").select("id,instance_key,paid_until,subscription_status,data_status,status,billing_customer_id,auto_renew").eq("service_plan", "pro").eq("auto_renew", true).not("billing_customer_id", "is", null).not("paid_until", "is", null).lte("paid_until", horizon).neq("data_status", "deleted").limit(500);
  if (error) throw error;
  const results: any[] = [];
  for (const instance of instances || []) {
    const customer = await customerForInstance(instance);
    if (!customer) { results.push({ instance: instance.instance_key, skipped: "customer_not_linked" }); continue; }
    const oldPaidUntil = String(instance.paid_until);
    const idempotency = `auto-renew:${instance.instance_key}:${oldPaidUntil}`;
    const { data, error: renewError } = await supabase.rpc("wfilemanager_wallet_renew_instance", { p_customer_id: customer.id, p_instance_key: instance.instance_key, p_amount_usd: config.priceUsd, p_period_days: config.periodDays, p_transaction_type: "auto_renewal_debit", p_reference: `AUTO-${instance.instance_key}`, p_idempotency_key: idempotency, p_metadata: { automatic: true, previous_paid_until: oldPaidUntil } });
    if (renewError) {
      const message = String(renewError.message || renewError);
      await supabase.from("wfilemanager_instances").update({ auto_renew_last_attempt_at: new Date().toISOString(), auto_renew_last_error: message, updated_at: new Date().toISOString() }).eq("id", instance.id);
      if (message.includes("insufficient_balance")) {
        const reminderId = await reserveReminder(instance, customer, "auto_renew_insufficient", oldPaidUntil);
        if (reminderId) { try { await sendAutoRenewInsufficient(config, instance, customer); } catch (mailError) { await markReminderError(reminderId, mailError); } }
        results.push({ instance: instance.instance_key, renewed: false, reason: "insufficient_balance" });
        continue;
      }
      results.push({ instance: instance.instance_key, renewed: false, reason: message });
      continue;
    }
    const result = data?.[0];
    const reminderId = await reserveReminder(instance, customer, "auto_renew_success", oldPaidUntil);
    if (reminderId) { try { await sendAutoRenewSuccess(config, instance, customer, oldPaidUntil, result.paid_until, Number(result.balance_usd || 0)); } catch (mailError) { await markReminderError(reminderId, mailError); } }
    results.push({ instance: instance.instance_key, renewed: true, paidUntil: result.paid_until, balanceUsd: Number(result.balance_usd || 0), alreadyApplied: Boolean(result.already_applied) });
  }
  return { checked: instances?.length || 0, results };
}

function kindFor(instance: any) {
  const paidUntil = instance.paid_until ? new Date(instance.paid_until).getTime() : 0;
  const days = (paidUntil - Date.now()) / 86400000;
  if (instance.subscription_status === "suspended" || instance.data_status === "suspended") return "suspended";
  if (days < 0) return "past_due";
  if (instance.auto_renew) return days <= 14 && days > 7 ? "renewal_14d" : "";
  if (days <= 1) return "renewal_1d";
  if (days <= 7) return "renewal_7d";
  if (days <= 14) return "renewal_14d";
  return "";
}
async function sendReminder(config: Config, instance: any, customer: any, kind: string) {
  const paidUntil = instance.paid_until ? new Date(instance.paid_until).toUTCString() : "not set";
  const action = `${config.siteUrl}/account`;
  const labels: Record<string, string> = { renewal_14d: "Your wFileManager Pro licence expires in about 14 days", renewal_7d: "Your wFileManager Pro licence expires in about 7 days", renewal_1d: "Your wFileManager Pro licence expires soon", past_due: "Your wFileManager Pro licence is past due", suspended: "Your wFileManager Pro licence is suspended" };
  const subject = labels[kind] || "wFileManager Pro licence reminder";
  const text = `Hello ${customer.name},\n\n${subject}.\n\nInstance: ${instance.instance_key}\nPaid until: ${paidUntil}\nAccount balance: $${Number(customer.balanceUsd || 0).toFixed(2)} USD\n\nOpen your account to add funds, renew from balance, or pay directly:\n${action}\n\nTechnical support: ${config.supportEmail}.`;
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.5;color:#111827"><h2>${subject}</h2><p>Hello ${customer.name},</p><p><strong>Instance:</strong> ${instance.instance_key}</p><p><strong>Paid until:</strong> ${paidUntil}</p><p><strong>Account balance:</strong> $${Number(customer.balanceUsd || 0).toFixed(2)} USD</p><p><a href="${action}" style="display:inline-block;padding:10px 14px;background:#111827;color:#fff;text-decoration:none;border-radius:6px">Open customer account</a></p><p>Technical support: <a href="mailto:${config.supportEmail}">${config.supportEmail}</a></p></body></html>`;
  await sendMail(config, { email: customer.email, name: customer.name, subject, text, html, category: `wfilemanager-${kind}` });
}
async function runReminders(config: Config) {
  const horizon = new Date(Date.now() + 14 * 86400000).toISOString();
  const { data: instances, error } = await supabase.from("wfilemanager_instances").select("id,instance_key,paid_until,subscription_status,data_status,status,billing_customer_id,auto_renew").eq("service_plan", "pro").not("paid_until", "is", null).lte("paid_until", horizon).neq("data_status", "deleted").limit(500);
  if (error) throw error;
  const results: any[] = [];
  for (const instance of instances || []) {
    const kind = kindFor(instance); if (!kind) continue;
    const customer = await customerForInstance(instance); if (!customer) continue;
    const reminderId = await reserveReminder(instance, customer, kind, instance.paid_until);
    if (!reminderId) { results.push({ instance: instance.instance_key, kind, skipped: "duplicate" }); continue; }
    try { await sendReminder(config, instance, customer, kind); results.push({ instance: instance.instance_key, kind, sent: true }); }
    catch (mailError) { await markReminderError(reminderId, mailError); results.push({ instance: instance.instance_key, kind, sent: false }); }
  }
  return { checked: instances?.length || 0, results };
}
async function runAll() { const config = await loadConfig(); const autoRenewals = await runAutoRenewals(config); const reminders = await runReminders(config); return { ok: true, autoRenewals, reminders }; }

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    const action = new URL(request.url).pathname.split("/").filter(Boolean).pop() || "status";
    if (action === "status") return json({ ok: true, reminders: true, walletAutoRenew: true, currency: "USD" });
    if (action === "run-reminders" || action === "run") return json(await runAll());
    return json({ error: "Not found" }, 404);
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Automation failed" }, 500); }
});
