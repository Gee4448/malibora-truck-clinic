import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Lightweight PIN auth for mechanics — no Supabase Auth session, identity is
// verified server-side by the mechanic_login RPC and cached in localStorage
// (same trust model as the client portal).
const MechanicAuthContext = createContext()

export function MechanicAuthProvider({ children }) {
  const [mechanic, setMechanic] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('malibora_mechanic')
    if (stored) {
      try {
        setMechanic(JSON.parse(stored))
      } catch {
        localStorage.removeItem('malibora_mechanic')
      }
    }
    setLoading(false)
  }, [])

  const loginWithPin = useCallback(async (code) => {
    const { data, error } = await supabase.rpc('mechanic_login', { p_code: (code || '').trim() })
    if (error) {
      if ((error.message || '').includes('invalid_code')) throw new Error('invalid_code')
      throw error
    }
    // RETURNS TABLE(...) => array of rows.
    const row = Array.isArray(data) ? data[0] : data
    if (!row) throw new Error('invalid_code')
    const session = { id: row.id, name: row.name }
    setMechanic(session)
    localStorage.setItem('malibora_mechanic', JSON.stringify(session))
    return session
  }, [])

  const logout = useCallback(() => {
    setMechanic(null)
    localStorage.removeItem('malibora_mechanic')
  }, [])

  return (
    <MechanicAuthContext.Provider value={{ mechanic, loading, loginWithPin, logout }}>
      {children}
    </MechanicAuthContext.Provider>
  )
}

export const useMechanic = () => {
  const context = useContext(MechanicAuthContext)
  if (!context) throw new Error('useMechanic must be used within MechanicAuthProvider')
  return context
}
