import { normalizeTZ } from './sms'

// WhatsApp is the notification channel that works TODAY. The SMS pipeline
// (lib/sms.js -> send-sms Edge Function -> Africa's Talking) stays in place and
// fires alongside this, but it is dormant until the AT account is provisioned
// and an alphanumeric sender ID clears TCRA/operator registration — which takes
// days. Until then every sendSMS() call is recorded as 'skipped' and nothing
// reaches the customer.
//
// wa.me needs no account, no API, no credit and no registration: it opens the
// staff member's own WhatsApp with the message pre-typed, and they press send.
// One tap of manual work, but it is delivered, free, and it works right now.
//
// Note this builds a LINK rather than calling window.open(). An <a> is never
// blocked by a popup blocker, whereas window.open() after an `await` has lost
// the user-gesture context and gets silently swallowed on Safari/iOS — which is
// most of the phones this app runs on.

// The customer portal login URL, derived from wherever the app is served so it
// stays correct across both Vercel deployments and localhost.
export function portalUrl() {
  return `${window.location.origin}/client`
}

// Build a click-to-chat link with the message pre-filled.
// Returns '' when there's no usable phone number, so callers can hide the button.
export function whatsappLink(phone, message) {
  const dest = normalizeTZ(phone)
  if (!dest || dest.length < 11) return ''
  return `https://wa.me/${dest}?text=${encodeURIComponent(message || '')}`
}
