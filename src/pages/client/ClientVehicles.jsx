import { useState, useEffect } from 'react'
import { useLanguage } from '../../contexts/LanguageContext'
import { useClient } from '../../contexts/ClientAuthContext'
import { supabase, formatDate } from '../../lib/supabase'
import { Truck, Calendar, Gauge, Fuel, Plus, X } from 'lucide-react'
import toast from 'react-hot-toast'

const VEHICLE_TYPES = ['truck', 'trailer', 'car']
const FUEL_TYPES = ['diesel', 'petrol', 'electric', 'hybrid']

export default function ClientVehicles() {
  const { t } = useLanguage()
  const { customer } = useClient()
  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    vehicle_type: 'truck', make: '', model: '', registration_number: '',
    engine_type: '', chassis_number: '', axles: '', fuel_type: 'diesel'
  })

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

  const resetForm = () => {
    setForm({ vehicle_type: 'truck', make: '', model: '', registration_number: '',
      engine_type: '', chassis_number: '', axles: '', fuel_type: 'diesel' })
  }

  const handleAddVehicle = async (e) => {
    e.preventDefault()
    if (!form.make.trim() || !form.registration_number.trim()) return
    setSaving(true)
    try {
      const { error } = await supabase.from('vehicles').insert({
        customer_id: customer.id,
        vehicle_type: form.vehicle_type,
        make: form.make,
        model: form.model || null,
        registration_number: form.registration_number.toUpperCase(),
        engine_type: form.engine_type || null,
        chassis_number: form.chassis_number || null,
        axles: form.axles ? parseInt(form.axles) : null,
        fuel_type: form.fuel_type,
      })
      if (error) throw error
      toast.success(t('client.vehicles.added'))
      setShowForm(false)
      resetForm()
      fetchVehicles()
    } catch (err) {
      toast.error(t('client.vehicles.addError'))
    } finally {
      setSaving(false)
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
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">{t('client.vehicles.title')}</h1>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-700 text-white rounded-xl text-sm font-medium hover:bg-blue-800 transition active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          {t('client.vehicles.addVehicle')}
        </button>
      </div>

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

      {/* Add Vehicle Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold text-gray-900">{t('client.vehicles.addVehicle')}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddVehicle} className="p-5 space-y-3.5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('client.vehicles.vehicleType')} *</label>
                <select value={form.vehicle_type} onChange={e => setForm({...form, vehicle_type: e.target.value})}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                  {VEHICLE_TYPES.map(type => (
                    <option key={type} value={type}>{t(`client.vehicles.types.${type}`)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('client.vehicles.make')} *</label>
                <input type="text" value={form.make} onChange={e => setForm({...form, make: e.target.value})} required
                  placeholder="e.g. Scania, Volvo, MAN"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('client.vehicles.model')}</label>
                <input type="text" value={form.model} onChange={e => setForm({...form, model: e.target.value})}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('client.vehicles.plateNumber')} *</label>
                <input type="text" value={form.registration_number} onChange={e => setForm({...form, registration_number: e.target.value})} required
                  placeholder="e.g. T 123 ABC" style={{ textTransform: 'uppercase' }}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('client.vehicles.engineType')}</label>
                <input type="text" value={form.engine_type} onChange={e => setForm({...form, engine_type: e.target.value})}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('client.vehicles.chassisNumber')}</label>
                <input type="text" value={form.chassis_number} onChange={e => setForm({...form, chassis_number: e.target.value})}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('client.vehicles.axles')}</label>
                <input type="number" value={form.axles} onChange={e => setForm({...form, axles: e.target.value})}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('client.vehicles.fuelType')}</label>
                <select value={form.fuel_type} onChange={e => setForm({...form, fuel_type: e.target.value})}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                  {FUEL_TYPES.map(type => (
                    <option key={type} value={type}>{t(`client.vehicles.fuels.${type}`)}</option>
                  ))}
                </select>
              </div>
              <button type="submit" disabled={saving}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-700 text-white font-medium rounded-xl hover:bg-blue-800 transition disabled:opacity-40 active:scale-[0.98]">
                {saving ? (
                  <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  t('client.vehicles.addVehicle')
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
