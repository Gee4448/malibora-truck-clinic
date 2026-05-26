import { useState, useEffect } from 'react'
import { useLanguage } from '../../contexts/LanguageContext'
import { useClient } from '../../contexts/ClientAuthContext'
import { supabase, formatDate } from '../../lib/supabase'
import { Truck, Calendar, Gauge, Fuel } from 'lucide-react'

export default function ClientVehicles() {
  const { t } = useLanguage()
  const { customer } = useClient()
  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (customer?.id) fetchVehicles()
  }, [customer?.id])

  const fetchVehicles = async () => {
    try {
      const { data } = await supabase
        .from('vehicles')
        .select('*')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
      setVehicles(data || [])
    } catch (err) {
      console.error('Vehicles error:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-gray-900">{t('client.vehicles.title')}</h1>

      {vehicles.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <Truck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">{t('client.vehicles.noVehicles')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {vehicles.map((v) => (
            <div key={v.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Truck className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-gray-900 text-lg">{v.registration_number}</p>
                  <p className="text-sm text-gray-600">{v.make} {v.model} {v.year ? `(${v.year})` : ''}</p>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3 text-xs">
                    {v.color && (
                      <div className="flex items-center gap-1.5 text-gray-500">
                        <div className="w-3 h-3 rounded-full border border-gray-300" style={{ backgroundColor: v.color.toLowerCase() }} />
                        {v.color}
                      </div>
                    )}
                    {v.vehicle_type && (
                      <div className="text-gray-500 capitalize">{v.vehicle_type}</div>
                    )}
                    {v.mileage && (
                      <div className="flex items-center gap-1.5 text-gray-500">
                        <Gauge className="w-3 h-3" /> {Number(v.mileage).toLocaleString()} km
                      </div>
                    )}
                    {v.fuel_type && (
                      <div className="flex items-center gap-1.5 text-gray-500">
                        <Fuel className="w-3 h-3" /> {v.fuel_type}
                      </div>
                    )}
                  </div>

                  {v.vin_number && (
                    <p className="text-[10px] text-gray-400 mt-2">VIN: {v.vin_number}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
