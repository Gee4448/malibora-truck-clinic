import { createClient } from '@supabase/supabase-js'
import { supabase, supabaseUrl, supabaseAnonKey } from './supabase'

// Opening a staff account from the owner's own screen (client request 5 Aug
// 2026: "give me the power to open their account, their username and their
// password myself").
//
// There is no service-role key in the browser and there must never be one, so
// the account is created through the ordinary sign-up API. The catch is that
// signing someone up also signs you in as them — which would kick the owner out
// of his own session mid-form. So sign-up runs on a SECOND, throwaway Supabase
// client that keeps nothing: no stored session, no token refresh, its own
// storage key. The owner's session in `supabase` is never touched.
//
// The bare auth user that comes back is nobody until admin_upsert_staff_profile
// (migration 029) gives it a name, a role and a branch.

// Staff sign in with a username, not a mailbox — most of them do not have an
// email address. A username is turned into an address in a domain that exists
// only for this purpose, and the login screen does the same conversion, so the
// two always agree.
export const STAFF_LOGIN_DOMAIN = 'staff.malibora.co.tz'

export const toLoginEmail = (usernameOrEmail) => {
  const raw = (usernameOrEmail || '').trim().toLowerCase()
  if (!raw) return ''
  if (raw.includes('@')) return raw
  return `${raw.replace(/[^a-z0-9._-]/g, '')}@${STAFF_LOGIN_DOMAIN}`
}

// The reverse, for display: hide the machinery and show just the username.
export const fromLoginEmail = (email) => {
  const raw = (email || '').trim()
  if (!raw) return ''
  return raw.endsWith(`@${STAFF_LOGIN_DOMAIN}`) ? raw.slice(0, -(STAFF_LOGIN_DOMAIN.length + 1)) : raw
}

let enrolmentClient = null
const getEnrolmentClient = () => {
  if (!enrolmentClient) {
    enrolmentClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'malibora_staff_enrolment',
      },
    })
  }
  return enrolmentClient
}

export const ROLES = [
  'owner',
  'manager',
  'supervisor',
  'accountant',
  'secretary',
  'receptionist',
  'storekeeper',
  'mechanic',
]

// Creates the login, then the staff profile. Returns the new profile row.
export async function createStaffAccount({ username, password, fullName, phone, role, branchId }) {
  const email = toLoginEmail(username)
  if (!email) throw new Error('username_required')
  if (!password || password.length < 6) throw new Error('password_too_short')

  const { data, error } = await getEnrolmentClient().auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  })
  if (error) throw error

  const userId = data?.user?.id
  if (!userId) throw new Error('signup_blocked')

  // Drop the throwaway session immediately; local scope so this never touches
  // any other session.
  await getEnrolmentClient().auth.signOut({ scope: 'local' }).catch(() => {})

  // Now name them, as the owner — this call runs on the owner's session.
  const { data: profile, error: profileError } = await supabase.rpc('admin_upsert_staff_profile', {
    p_user_id: userId,
    p_full_name: fullName,
    p_phone: phone || '',
    p_role: role,
    p_branch_id: branchId || null,
    p_is_active: true,
  })
  if (profileError) throw profileError

  return profile
}

// Editing someone who already exists — role, branch, name, active. The
// password is not touched here: it is theirs to change in Settings, and the
// browser cannot reset another user's password without a service-role key.
export async function updateStaffProfile({ userId, fullName, phone, role, branchId, isActive }) {
  const { data, error } = await supabase.rpc('admin_upsert_staff_profile', {
    p_user_id: userId,
    p_full_name: fullName,
    p_phone: phone || '',
    p_role: role,
    p_branch_id: branchId || null,
    p_is_active: isActive,
  })
  if (error) throw error
  return data
}
