import { supabase } from './supabase'

// Raise a staff notification (the Header bell). Called from the client portal
// (anon role) when the customer requests a proforma or declares a payment.
// RLS ("Anon raise notifications", migration 015) constrains type + is_read.
// Fire-and-forget: a failed notification must never block the customer's action,
// so errors are swallowed and logged, not thrown.
export async function notifyStaff({ type, title, body, jobCardId, invoiceId, inspectionId, customerId }) {
  try {
    const { error } = await supabase.from('notifications').insert({
      type,
      title,
      body: body || null,
      job_card_id: jobCardId || null,
      invoice_id: invoiceId || null,
      inspection_id: inspectionId || null,
      customer_id: customerId || null,
      is_read: false,
    })
    if (error) console.error('notifyStaff failed:', error.message)
  } catch (err) {
    console.error('notifyStaff error:', err)
  }
}
