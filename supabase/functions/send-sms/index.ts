// Supabase Edge Function: send-sms
//
// Sends an SMS to a customer via Beem Africa, keeping the API credentials on the
// server (never in the browser). Logs every attempt to the sms_log table.
//
// Deploy:  supabase functions deploy send-sms
// Secrets: supabase secrets set BEEM_API_KEY=xxx BEEM_SECRET_KEY=xxx BEEM_SENDER_ID=MALIBORA
//
// Until the Beem secrets are set, requests are recorded as 'skipped' and nothing
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

// Normalize a Tanzanian phone number to Beem's expected format (255XXXXXXXXX).
function normalizeTZ(phone: string): string {
  let p = String(phone || "").replace(/[^0-9]/g, "");
  if (p.startsWith("0")) p = "255" + p.slice(1);
  else if (p.length === 9 && (p.startsWith("7") || p.startsWith("6"))) p = "255" + p;
  return p;
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

  const apiKey = Deno.env.get("BEEM_API_KEY");
  const secretKey = Deno.env.get("BEEM_SECRET_KEY");
  const senderId = Deno.env.get("BEEM_SENDER_ID") ?? "INFO";

  const log = async (status: string, provider_response: unknown) => {
    try {
      await admin.from("sms_log").insert({
        to_phone: to, message, event, status,
        provider_response: provider_response ?? null, customer_id,
      });
    } catch (_) { /* logging must never break the response */ }
  };

  // Not configured yet — record and no-op so the app keeps working.
  if (!apiKey || !secretKey) {
    await log("skipped", { reason: "not_configured" });
    return json({ ok: false, skipped: true, reason: "not_configured" });
  }

  try {
    const auth = btoa(`${apiKey}:${secretKey}`);
    const res = await fetch("https://apisms.beem.africa/v1/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${auth}`,
      },
      body: JSON.stringify({
        source_addr: senderId,
        encoding: 0,
        message,
        recipients: [{ recipient_id: 1, dest_addr: to }],
      }),
    });
    const body = await res.json().catch(() => ({}));
    const ok = res.ok;
    await log(ok ? "sent" : "failed", body);
    return json({ ok, provider: body }, ok ? 200 : 502);
  } catch (e) {
    await log("failed", { error: String(e) });
    return json({ ok: false, error: String(e) }, 502);
  }
});
