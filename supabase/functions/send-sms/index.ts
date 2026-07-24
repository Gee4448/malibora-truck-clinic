// Supabase Edge Function: send-sms
//
// Sends an SMS to a customer via Africa's Talking, keeping the API credentials on
// the server (never in the browser). Logs every attempt to the sms_log table.
//
// Deploy:  supabase functions deploy send-sms
// Secrets: supabase secrets set AT_USERNAME=xxx AT_API_KEY=xxx AT_SENDER_ID=MALIBORA
//          (use AT_USERNAME=sandbox for the free test environment)
//
// Until the AT secrets are set, requests are recorded as 'skipped' and nothing
// is sent — so the app works fine before the account is provisioned.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Normalize a Tanzanian phone number to E.164 (+255XXXXXXXXX), which Africa's
// Talking requires.
function normalizeTZ(phone: string): string {
  let p = String(phone || "").replace(/[^0-9]/g, "");
  if (p.startsWith("0")) p = "255" + p.slice(1);
  else if (p.length === 9 && (p.startsWith("7") || p.startsWith("6"))) p = "255" + p;
  return p ? "+" + p : "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Service-role client for logging (bypasses RLS).
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let payload: { to?: string; message?: string; event?: string; customer_id?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const to = normalizeTZ(payload.to ?? "");
  const message = (payload.message ?? "").trim();
  const event = payload.event ?? null;
  const customer_id = payload.customer_id ?? null;

  if (!to || to.length < 11 || !message) {
    return json({ ok: false, error: "missing_to_or_message" }, 400);
  }

  const username = Deno.env.get("AT_USERNAME");
  const apiKey = Deno.env.get("AT_API_KEY");
  const senderId = Deno.env.get("AT_SENDER_ID"); // optional alphanumeric/short code

  const log = async (status: string, provider_response: unknown) => {
    try {
      await admin.from("sms_log").insert({
        to_phone: to, message, event, status,
        provider_response: provider_response ?? null, customer_id,
      });
    } catch (_) { /* logging must never break the response */ }
  };

  // Not configured yet — record and no-op so the app keeps working.
  if (!apiKey || !username) {
    await log("skipped", { reason: "not_configured" });
    return json({ ok: false, skipped: true, reason: "not_configured" });
  }

  // The sandbox username uses a separate host so you can test without spending.
  const host = username === "sandbox"
    ? "https://api.sandbox.africastalking.com"
    : "https://api.africastalking.com";

  try {
    const form = new URLSearchParams({ username, to, message });
    if (senderId) form.set("from", senderId);

    const res = await fetch(`${host}/version1/messaging`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "apiKey": apiKey,
      },
      body: form.toString(),
    });
    const body = await res.json().catch(() => ({}));
    // AT returns 201 on accept; per-recipient statusCode 100–102 means success.
    const recipient = body?.SMSMessageData?.Recipients?.[0];
    const ok = res.ok && recipient?.statusCode >= 100 && recipient?.statusCode <= 102;
    await log(ok ? "sent" : "failed", body);
    return json({ ok, provider: body }, ok ? 200 : 502);
  } catch (e) {
    await log("failed", { error: String(e) });
    return json({ ok: false, error: String(e) }, 502);
  }
});
