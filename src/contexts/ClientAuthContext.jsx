import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const ClientAuthContext = createContext()

export function ClientAuthProvider({ children }) {
  const [customer, setCustomer] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('malibora_client')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        refreshCustomer(parsed.id)
      } catch {
        setLoading(false)
      }
    } else {
      setLoading(false)
    }
  }, [])

  const refreshCustomer = async (customerId) => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .single()
      if (error || !data) {
        localStorage.removeItem('malibora_client')
        setCustomer(null)
      } else {
        setCustomer(data)
        localStorage.setItem('malibora_client', JSON.stringify({ id: data.id, phone: data.phone }))
      }
    } catch {
      localStorage.removeItem('malibora_client')
      setCustomer(null)
    } finally {
      setLoading(false)
    }
  }

  const loginWithPhone = useCallback(async (phone) => {
    const normalized = phone.replace(/\s+/g, '').replace(/^0/, '+255')
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .or(`phone.eq.${phone},phone.eq.${normalized}`)
      .limit(1)
      .single()

    if (error || !data) {
      throw new Error('not_found')
    }

    setCustomer(data)
    localStorage.setItem('malibora_client', JSON.stringify({ id: data.id, phone: data.phone }))
    return data
  }, [])

  const logout = useCallback(() => {
    setCustomer(null)
    localStorage.removeItem('malibora_client')
  }, [])

  return (
    <ClientAuthContext.Provider value={{ customer, loading, loginWithPhone, logout, refreshCustomer }}>
      {children}
    </ClientAuthContext.Provider>
  )
}

export const useClient = () => {
  const context = useContext(ClientAuthContext)
  if (!context) throw new Error('useClient must be used within ClientAuthProvider')
  return context
}
