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
      if (error || !data || data.status === 'rejected') {
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

    if (data.status === 'pending') {
      throw new Error('pending_approval')
    }

    if (data.status === 'rejected') {
      throw new Error('rejected')
    }

    setCustomer(data)
    localStorage.setItem('malibora_client', JSON.stringify({ id: data.id, phone: data.phone }))
    return data
  }, [])

  const registerCustomer = useCallback(async (customerData, vehicleData) => {
    const normalized = customerData.phone.replace(/\s+/g, '').replace(/^0/, '+255')

    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .or(`phone.eq.${customerData.phone},phone.eq.${normalized}`)
      .limit(1)
      .maybeSingle()

    if (existing) {
      throw new Error('phone_exists')
    }

    const payload = {
      full_name: customerData.full_name,
      phone: normalized,
      email: customerData.email || null,
      company_name: customerData.company_name || null,
      address: customerData.address || null,
      location: customerData.location || null,
      status: 'pending',
      registered_via: 'online',
    }

    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .insert(payload)
      .select()
      .single()

    if (custErr) throw custErr

    const vPayload = {
      customer_id: customer.id,
      vehicle_type: vehicleData.vehicle_type,
      make: vehicleData.make,
      model: vehicleData.model || null,
      registration_number: vehicleData.registration_number,
      engine_type: vehicleData.engine_type || null,
      chassis_number: vehicleData.chassis_number || null,
      axles: vehicleData.axles || null,
      fuel_type: vehicleData.fuel_type,
    }

    const { error: vehErr } = await supabase
      .from('vehicles')
      .insert(vPayload)

    if (vehErr) throw vehErr

    return customer
  }, [])

  const logout = useCallback(() => {
    setCustomer(null)
    localStorage.removeItem('malibora_client')
  }, [])

  return (
    <ClientAuthContext.Provider value={{ customer, loading, loginWithPhone, logout, refreshCustomer, registerCustomer }}>
      {children}
    </ClientAuthContext.Provider>
  )
}

export const useClient = () => {
  const context = useContext(ClientAuthContext)
  if (!context) throw new Error('useClient must be used within ClientAuthProvider')
  return context
}
