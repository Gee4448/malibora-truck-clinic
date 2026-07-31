import { supabase } from './supabase'

// Client-side SMS helper. Calls the `send-sms` Edge Function, which holds the
// Africa's Talking credentials server-side. Every call is safe to fire-and-forget:
// it never throws, so a notification problem can't break the action that
// triggered it (saving a handover, marking an invoice sent, etc).
//
// While the SMS provider is not configured, the Edge Function records the attempt as
// 'skipped' and returns { skipped: true } — the UI just carries on.

// Normalize a Tanzanian phone number to 255XXXXXXXXX.
// Exported because the WhatsApp helper (lib/whatsapp.js) needs the exact same
// wa.me-compatible digits — keeping one implementation stops the two channels
// from disagreeing about what a customer's number is.
export function normalizeTZ(phone) {
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

// "Mwanaidi Hassan Mwakalinga" -> "Mwanaidi". Greeting by first name only.
function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || ''
}

// Swahili message templates for the notification events.
//
// Deliberately hardcoded Swahili rather than run through t(): these are read by
// the CUSTOMER, so they must not vary with whichever language the staff member
// happens to have the admin UI set to. (An earlier bug did exactly that on an
// invoice line and produced "Fee" for some customers and "Ada" for others.)
export const smsTemplates = {
  inspection_complete: (name, vehicle) =>
    `Habari ${name || ''}, ukaguzi wa gari ${vehicle || ''} umekamilika. Tutakupa taarifa zaidi. Malibora Truck Clinic.`.trim(),
  // The garage answered a price the customer questioned. The reply itself lives
  // in the portal thread — this only tells them to go and read it.
  inspection_bargain_reply: (name, number) =>
    `Habari ${firstName(name)}, tumejibu ombi lako la bei kwa ukaguzi ${number || ''}. Tafadhali ingia kwenye akaunti yako kuona jibu. Malibora Truck Clinic.`.trim(),
  // The haggling ended and the fee actually changed. This one carries the
  // number, because it is what the customer is now being asked to pay.
  inspection_fee_updated: (name, number, amount) =>
    `Habari ${firstName(name)}, ada ya ukaguzi ${number || ''} imesasishwa: ${amount || ''}. Tafadhali ingia kwenye akaunti yako kulipa ili tuendelee. Malibora Truck Clinic.`.trim(),
  invoice_ready: (name, number, total) =>
    `Habari ${name || ''}, ankara yako ${number || ''} iko tayari. Jumla: ${total || ''}. Malibora Truck Clinic.`.trim(),
  invoice_updated: (name, number, total) =>
    `Habari ${name || ''}, ankara yako ${number || ''} imesasishwa. Jumla mpya: ${total || ''}. Malibora Truck Clinic.`.trim(),
  car_ready: (name, vehicle) =>
    `Habari ${name || ''}, gari lako ${vehicle || ''} liko tayari kuchukuliwa. Asante - Malibora Truck Clinic.`.trim(),
  // Account approved: must carry the next step, not just the fact. A bare
  // "you're approved" generates phone calls asking what to do next.
  //
  // Kept under 160 characters so it stays a single SMS segment — worst case
  // (longest deployment URL) lands at 157. Anything longer bills as two.
  // First name only: natural in Swahili, and it stops a long registered full
  // name from silently doubling the cost of every approval.
  account_approved: (name, portalUrl) =>
    `Habari ${firstName(name)}, akaunti yako Malibora Truck Clinic imethibitishwa. Ingia kwa namba ya simu na nenosiri lako: ${portalUrl}`.trim(),
  account_rejected: (name) =>
    `Habari ${firstName(name)}, samahani, usajili wako Malibora Truck Clinic haujakamilika. Tafadhali wasiliana nasi kwa maelezo zaidi.`.trim(),
}
