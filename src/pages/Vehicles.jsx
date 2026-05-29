import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext'
import { supabase, formatDate } from '../lib/supabase'
import { Plus, Search, Edit2, Trash2, X, Truck, Hash } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Vehicles() {
  const { t } = useLanguage()
  const [vehicles, setVehicles] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    customer_id: '', registration_number: '', make: '', model: '',
    year: '', color: '', vin_number: '', engine_number: '',
    mileage_km: '', fuel_type: 'diesel', vehicle_type: 'truck', notes: ''
  })

  useEffect(() => {
    fetchVehicles()
    fetchCustomers()
  }, [])

  const generateVehicleId = (index) => `VEH-${String(index).padStart(3, '0')}`

  const fetchVehicles = async () => {
    try {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*, customers(full_name, phone)')
        .order('created_at', { ascending: true })
      if (error) throw error
      const withIds = (data || []).map((v, i) => ({
        ...v,
        vehicle_id: generateVehicleId(i + 1),
      }))
      setVehicles(withIds.reverse())
    } catch (err) {
      toast.error(t('vehicles.loadError'))
    } finally {
      setLoading(false)
    }
  }

  const fetchCustomers = async () => {
    const { data } = await supabase.from('customers').select('id, full_name').order('full_name')
    setCustomers(data || [])
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = {
      ...form,
      year: form.year ? parseInt(form.year) : null,
      mileage_km: form.mileage_km ? parseInt(form.mileage_km) : 0,
    }
    try {
      if (editingId) {
        const { error } = await supabase.from('vehicles').update(payload).eq('id', editingId)
        if (error) throw error
        toast.success(t('vehicles.updated'))
      } else {
        const { error } = await supabase.from('vehicles').insert(payload)
        if (error) throw error
        toast.success(t('vehicles.added'))
      }
      setShowForm(false)
      resetForm()
      fetchVehicles()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleEdit = (v) => {
    setForm({
      customer_id: v.customer_id || '',
      registration_number: v.registration_number || '',
      make: v.make || '', model: v.model || '',
      year: v.year || '', color: v.color || '',
      vin_number: v.vin_number || '', engine_number: v.engine_number || '',
      mileage_km: v.mileage_km || '', fuel_type: v.fuel_type || 'diesel',
      vehicle_type: v.vehicle_type || 'truck', notes: v.notes || '',
    })
    setEditingId(v.id)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!confirm(t('vehicles.deleteConfirm'))) return
    try {
      await supabase.from('vehicles').delete().eq('id', id)
      toast.success(t('vehicles.deleted'))
      fetchVehicles()
    } catch (err) { toast.error(err.message) }
  }

  const resetForm = () => {
    setForm({ customer_id: '', registration_number: '', make: '', model: '', year: '', color: '', vin_number: '', engine_number: '', mileage_km: '', fuel_type: 'diesel', vehicle_type: 'truck', notes: '' })
    setEditingId(null)
  }

  const filtered = vehicles.filter(v =>
    v.vehicle_id?.toLowerCase().includes(search.toLowerCase()) ||
    v.registration_number?.toLowerCase().includes(search.toLowerCase()) ||
    v.make?.toLowerCase().includes(search.toLowerCase()) ||
    v.customers?.full_name?.toLowerCase().includes(search.toLowerCase())
  )

  const typeColors = {
    truck: 'bg-blue-100 text-blue-700',
    bus: 'bg-purple-100 text-purple-700',
    trailer: 'bg-orange-100 text-orange-700',
    pickup: 'bg-green-100 text-green-700',
    car: 'bg-gray-100 text-gray-700',
    other: 'bg-gray-100 text-gray-700',
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{t('vehicles.title')}</h1>
        <button onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition text-sm font-medium">
          <Plus className="w-4 h-4" /> {t('vehicles.addNew')}
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={t('vehicles.search')}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center p-8">
            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-gray-500">{t('common.noData')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left p-3 font-medium text-gray-600">Vehicle ID</th>
                  <th className="text-left p-3 font-medium text-gray-600">{t('vehicles.regNumber')}</th>
                  <th className="text-left p-3 font-medium text-gray-600">{t('vehicles.make')} / {t('vehicles.model')}</th>
                  <th className="text-left p-3 font-medium text-gray-600 hidden md:table-cell">{t('vehicles.owner')}</th>
                  <th className="text-left p-3 font-medium text-gray-600 hidden md:table-cell">{t('vehicles.vehicleType')}</th>
                  <th className="text-left p-3 font-medium text-gray-600 hidden lg:table-cell">{t('vehicles.mileage')}</th>
                  <th className="text-right p-3 font-medium text-gray-600">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded-md">
                        <Hash className="w-3 h-3" />
                        {v.vehicle_id}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="font-medium text-gray-900 flex items-center gap-1.5">
                        <Truck className="w-4 h-4 text-gray-400" />
                        {v.registration_number}
                      </span>
                    </td>
                    <td className="p-3 text-gray-700">{v.make} {v.model} {v.year ? `(${v.year})` : ''}</td>
                    <td className="p-3 hidden md:table-cell">
                      <Link to={`/admin/customers/${v.customer_id}`} className="text-blue-600 hover:text-blue-700">
                        {v.customers?.full_name}
                      </Link>
                    </td>
                    <td className="p-3 hidden md:table-cell">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${typeColors[v.vehicle_type]}`}>
                        {v.vehicle_type}
                      </span>
                    </td>
                    <td className="p-3 hidden lg:table-cell text-gray-600">
                      {v.mileage_km ? `${v.mileage_km.toLocaleString()} km` : '-'}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleEdit(v)} className="p-1.5 rounded hover:bg-gray-100">
                          <Edit2 className="w-4 h-4 text-gray-500" />
                        </button>
                        <button onClick={() => handleDelete(v.id)} className="p-1.5 rounded hover:bg-red-50">
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold">{editingId ? t('vehicles.edit') : t('vehicles.addNew')}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('vehicles.owner')} *</label>
                  <select value={form.customer_id} onChange={e => setForm({...form, customer_id: e.target.value})} required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">-- {t('vehicles.selectCustomer')} --</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('vehicles.regNumber')} *</label>
                  <input type="text" value={form.registration_number} onChange={e => setForm({...form, registration_number: e.target.value.toUpperCase()})} required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none uppercase" placeholder="T 123 ABC" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('vehicles.make')} *</label>
                  <input type="text" value={form.make} onChange={e => setForm({...form, make: e.target.value})} required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Toyota, Scania..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('vehicles.model')}</label>
                  <input type="text" value={form.model} onChange={e => setForm({...form, model: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('vehicles.year')}</label>
                  <input type="number" value={form.year} onChange={e => setForm({...form, year: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" min="1990" max="2030" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('vehicles.color')}</label>
                  <input type="text" value={form.color} onChange={e => setForm({...form, color: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('vehicles.vehicleType')}</label>
                  <select value={form.vehicle_type} onChange={e => setForm({...form, vehicle_type: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="truck">Truck</option>
                    <option value="bus">Bus</option>
                    <option value="trailer">Trailer</option>
                    <option value="pickup">Pickup</option>
                    <option value="car">Car</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('vehicles.fuelType')}</label>
                  <select value={form.fuel_type} onChange={e => setForm({...form, fuel_type: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="diesel">Diesel</option>
                    <option value="petrol">Petrol</option>
                    <option value="electric">Electric</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('vehicles.mileage')}</label>
                  <input type="number" value={form.mileage_km} onChange={e => setForm({...form, mileage_km: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('vehicles.vin')}</label>
                  <input type="text" value={form.vin_number} onChange={e => setForm({...form, vin_number: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('vehicles.engine')}</label>
                  <input type="text" value={form.engine_number} onChange={e => setForm({...form, engine_number: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 py-2.5 bg-blue-700 text-white font-medium rounded-lg hover:bg-blue-800 transition">
                  {t('common.save')}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-6 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition">
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
