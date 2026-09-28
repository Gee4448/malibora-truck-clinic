import { supabase } from './supabase'

// The office hands a customer their portal login (migration 043). The username
// is the customer's phone number; this file is about the password.

// No 0/o, 1/l/i: this gets read out over the phone and typed on a handset.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

export const MIN_PASSWORD_LENGTH = 6

export function generatePassword(length = 8) {
  const bytes = new Uint32Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('')
}

// Throws an Error whose message is a code the caller can translate:
// 'migration_missing' | 'password_too_short' | 'forbidden' | 'not_found'.
function throwCoded(error) {
  const msg = error.message || ''
  if (error.code === 'PGRST202') throw new Error('migration_missing')
  for (const code of ['password_too_short', 'wrong_password', 'forbidden', 'not_found']) {
    if (msg.includes(code)) throw new Error(code)
  }
  throw error
}

// Staff: set a customer's first password, or replace a forgotten one.
export async function setCustomerPassword(customerId, password) {
  const { error } = await supabase.rpc('admin_set_customer_password', {
    p_customer_id: customerId,
    p_password: password,
  })
  if (error) throwCoded(error)
}

// Customer portal: change my own password.
export async function changeCustomerPassword(customerId, oldPassword, newPassword) {
  const { error } = await supabase.rpc('customer_change_password', {
    p_customer_id: customerId,
    p_old_password: oldPassword || '',
    p_new_password: newPassword,
  })
  if (error) throwCoded(error)
}
