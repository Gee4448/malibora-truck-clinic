import { createContext, useContext, useState, useEffect } from 'react'
import { supabase, accountSlots } from '../lib/supabase'
import toast from 'react-hot-toast'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // An added account signing in locks the device account for new tabs;
      // the device account signing out lifts that (src/lib/accountSlots.js).
      // INITIAL_SESSION too: a session found on page load — including the
      // one Google hands back, whose SIGNED_IN can fire before this listener
      // exists — arrives only as that.
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
        // Whoever signs in here AS this browser's own account — typing the
        // password in the main form, or with Google, which has no password
        // for the lock to ask — has just proved it: take this tab onto the
        // device account and lift the lock, rather than keep a second copy.
        // (Deferred: supabase-js must not be called back from inside its own
        // auth listener, or the two wait on each other's lock.)
        const device = accountSlots.deviceAccount()
        if (!accountSlots.isDeviceTab() && device?.userId === session.user.id) {
          setTimeout(() => {
            supabase.auth.signOut({ scope: 'local' }).catch(() => {})
              .finally(() => accountSlots.switchToDevice())
          }, 0)
          return
        }
        accountSlots.signedIn()
      }
      if (event === 'SIGNED_OUT') accountSlots.signedOut()
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error && error.code === 'PGRST116') {
        // Profile doesn't exist yet — auto-create for OAuth users
        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (authUser) {
          const meta = authUser.user_metadata || {}
          const { data: newProfile } = await supabase.from('profiles').insert({
            id: userId,
            full_name: meta.full_name || meta.name || authUser.email.split('@')[0],
            phone: meta.phone || '',
            role: 'receptionist',
          }).select().single()
          setProfile(newProfile)
        } else {
          setProfile(null)
        }
      } else if (data && data.is_active === false) {
        // Deactivated in Settings -> Staff. Without this they would keep the
        // session they already had and the switch would do nothing.
        setProfile(null)
        await supabase.auth.signOut()
        toast.error('This account has been deactivated. Talk to the owner.')
      } else {
        setProfile(data)
      }
    } catch (err) {
      console.error('Error fetching profile:', err)
    } finally {
      setLoading(false)
    }
  }

  // A password typed on the device tab is a real device login, so it lifts
  // the lock; the SIGNED_IN event alone cannot tell, because supabase-js
  // also fires it whenever a tab regains focus.
  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    accountSlots.signedIn({ fresh: true })
    return data
  }

  const signUp = async (email, password, metadata = {}) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: metadata }
    })
    if (error) throw error
    return data
  }

  const signInWithGoogle = async () => {
    // Google sends the browser away and back into this same tab; mark it so
    // the tab keeps its account slot however long the chooser took.
    accountSlots.oauthStarted()
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/admin`,
        // Always show Google's account chooser. Without it, "Add another
        // account" in a browser with one Google login silently signs the
        // same person in twice.
        queryParams: { prompt: 'select_account' },
      },
    })
    if (error) throw error
    return data
  }

  // Re-read the profile after something changes it server-side (e.g. redeeming
  // a role code), so the new role reaches canViewInternal without a re-login.
  const refreshProfile = async () => {
    if (!user) return null
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (data) setProfile(data)
    return data
  }

  // An account added in a tab signs out of this browser only: the owner
  // leaving the reception PC must not also be signed out of his phone.
  const signOut = async () => {
    const { error } = await supabase.auth.signOut(
      accountSlots.isDeviceTab() ? undefined : { scope: 'local' }
    )
    if (error) throw error
    setUser(null)
    setProfile(null)
  }

  const isOwner = profile?.role === 'owner'
  const isManager = profile?.role === 'manager' || isOwner
  const canViewInternal = isManager // Only owner/manager sees internal costs

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      refreshProfile,
      isOwner,
      isManager,
      canViewInternal,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
