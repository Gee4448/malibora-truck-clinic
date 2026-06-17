import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const ClientAuthContext = createContext()

// Non-atomic fallback used only when the atomic RPC (migration 003) is not yet
// deployed. Preserves the previous two-step behaviour so a deploy without the
// migration still works; remove once 003 is applied everywhere.
async function legacyRegister(normalizedPhone, customerPayload, vehiclesPayload) {
  const { data: existing } = await supabase
    .from('customers')
    .select('id')
    .eq('phone', normalizedPhone)
    .limit(1)
    .maybeSingle()
  if (existing) throw new Error('phone_exists')

  const { data: customer, error: custErr } = await supabase
    .from('customers')
    .insert({ ...customerPayload, status: 'pending', registered_via: 'online' })
    .select()
    .single()
  if (custErr) throw custErr

  const { error: vehErr } = await supabase
    .from('vehicles')
    .insert(vehiclesPayload.map(v => ({ ...v, customer_id: customer.id })))
  if (vehErr) throw vehErr

  return customer
}

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
    const vehicles = Array.isArray(vehicleData) ? vehicleData : [vehicleData]

    const customerPayload = {
      full_name: customerData.full_name,
      phone: normalized,
      email: customerData.email || null,
      company_name: customerData.company_name || null,
      address: customerData.address || null,
      location: customerData.location || null,
    }

    const vehiclesPayload = vehicles.map(v => ({
      vehicle_type: v.vehicle_type,
      make: v.make,
      model: v.model || null,
      registration_number: v.registration_number,
      engine_type: v.engine_type || null,
      chassis_number: v.chassis_number || null,
      axles: v.axles || null,
      fuel_type: v.fuel_type,
    }))

    // Atomic path: one transactional RPC (migration 003) so a failed vehicle
    // insert can't orphan a pending customer and lock the user out on retry.
    const { data, error } = await supabase.rpc('register_customer_with_vehicles', {
      customer_data: customerPayload,
      vehicles_data: vehiclesPayload,
    })

    if (!error) return data
    if (error.message?.includes('phone_exists')) throw new Error('phone_exists')

    // Graceful fallback when migration 003 has not been applied yet.
    const fnMissing = error.code === 'PGRST202'
      || error.message?.includes('register_customer_with_vehicles')
    if (!fnMissing) throw error

    return legacyRegister(normalized, customerPayload, vehiclesPayload)
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
