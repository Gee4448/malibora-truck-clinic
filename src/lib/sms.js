import { supabase } from './supabase'

// Client-side SMS helper. Calls the `send-sms` Edge Function, which holds the
// Africa's Talking credentials server-side. Every call is safe to fire-and-forget:
// it never throws, so a notification problem can't break the action that
// triggered it (saving a handover, marking an invoice sent, etc).
//
// While the SMS provider is not configured, the Edge Function records the attempt as
// 'skipped' and returns { skipped: true } — the UI just carries on.

// Normalize a Tanzanian phone number to 255XXXXXXXXX.
function normalizeTZ(phone) {
  let p = String(phone || '').replace(/[^0-9]/g, '')
  if (p.startsWith('0')) p = '255' + p.slice(1)
  else if (p.length === 9 && (p.startsWith('7') || p.startsWith('6'))) p = '255' + p
  return p
}

export async function sendSMS({ to, message, event, customerId } = {}) {
  const dest = normalizeTZ(to)
  if (!dest || dest.length < 11 || !message) {
    return { ok: false, skipped: true, reason: 'no_phone_or_message' }
  }
  try {
    const { data, error } = await supabase.functions.invoke('send-sms', {
      body: { to: dest, message, event: event || null, customer_id: customerId || null },
    })
    if (error) return { ok: false, error: error.message }
    return data || { ok: true }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) }
  }
}

// Swahili message templates for the notification events.
export const smsTemplates = {
  inspection_complete: (name, vehicle) =>
    `Habari ${name || ''}, ukaguzi wa gari ${vehicle || ''} umekamilika. Tutakupa taarifa zaidi. Malibora Truck Clinic.`.trim(),
  invoice_ready: (name, number, total) =>
    `Habari ${name || ''}, ankara yako ${number || ''} iko tayari. Jumla: ${total || ''}. Malibora Truck Clinic.`.trim(),
  car_ready: (name, vehicle) =>
    `Habari ${name || ''}, gari lako ${vehicle || ''} liko tayari kuchukuliwa. Asante - Malibora Truck Clinic.`.trim(),
}
