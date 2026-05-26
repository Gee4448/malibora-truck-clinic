import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext'
import { supabase, formatDate, formatTZS } from '../lib/supabase'
import { Plus, Search, Eye, X, ClipboardCheck, CreditCard } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Inspections() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [inspections, setInspections] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [customers, setCustomers] = useState([])
  const [filteredVehicles, setFilteredVehicles] = useState([])
  const [form, setForm] = useState({
    customer_id: '', vehicle_id: '', description: '',
    mileage_in: '', fuel_level: '', payment_amount: '', notes: ''
  })

  useEffect(() => {
    fetchInspections()
    fetchCustomers()
  }, [])

  const fetchInspections = async () => {
    try {
      const { data, error } = await supabase
        .from('inspections')
        .select(`
          *,
          customers(full_name, phone),
          vehicles(registration_number, make, model),
          inspection_items(id)
        `)
        .order('created_at', { ascending: false })
      if (error) throw error
      setInspections(data || [])
    } catch (err) {
      toast.error(t('inspection.loadError'))
    } finally {
      setLoading(false)
    }
  }

  const fetchCustomers = async () => {
    const { data } = await supabase.from('customers').select('id, full_name').order('full_name')
    setCustomers(data || [])
  }

  const handleCustomerChange = async (customerId) => {
    setForm({ ...form, customer_id: customerId, vehicle_id: '' })
    if (customerId) {
      const { data } = await supabase.from('vehicles')
        .select('id, registration_number, make, model')
        .eq('customer_id', customerId)
      setFilteredVehicles(data || [])
    } else {
      setFilteredVehicles([])
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const payload = {
        customer_id: form.customer_id,
        vehicle_id: form.vehicle_id,
        description: form.description,
        mileage_in: form.mileage_in ? parseInt(form.mileage_in) : null,
        fuel_level: form.fuel_level || null,
        payment_amount: form.payment_amount ? parseFloat(form.payment_amount) : 0,
        notes: form.notes || null,
        status: 'pending_payment',
        payment_status: 'unpaid',
      }
      const { data, error } = await supabase.from('inspections').insert(payload).select().single()
      if (error) throw error
      toast.success(t('inspection.created'))
      navigate(`/admin/inspections/${data.id}`)
    } catch (err) {
      toast.error(err.message)
    }
  }

  const statusColors = {
    pending_payment: 'bg-red-100 text-red-700',
    paid: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-gray-100 text-gray-500',
  }

  const filtered = inspections.filter(i => {
    const matchSearch = i.inspection_number?.toLowerCase().includes(search.toLowerCase()) ||
      i.customers?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      i.vehicles?.registration_number?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || i.status === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{t('inspection.title')}</h1>
        <button onClick={() => { setForm({ customer_id: '', vehicle_id: '', description: '', mileage_in: '', fuel_level: '', payment_amount: '', notes: '' }); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition text-sm font-medium">
          <Plus className="w-4 h-4" /> {t('inspection.addNew')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t('inspection.search')}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {['all', 'pending_payment', 'paid', 'in_progress', 'completed'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                statusFilter === s ? 'bg-blue-700 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}>
              {s === 'all' ? t('common.all') : t(`inspection.statuses.${s}`)}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center p-8">
            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center border border-gray-200">
            <p className="text-gray-500">{t('common.noData')}</p>
          </div>
        ) : (
          filtered.map((insp) => (
            <div key={insp.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate(`/admin/inspections/${insp.id}`)}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-lg font-bold text-blue-700">{insp.inspection_number}</span>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[insp.status]}`}>
                      {t(`inspection.statuses.${insp.status}`)}
                    </span>
                    {insp.payment_status === 'unpaid' && (
                      <span className="flex items-center gap-1 text-xs text-red-600">
                        <CreditCard className="w-3 h-3" /> {t('inspection.pendingPayment')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                    <span>{insp.vehicles?.registration_number} ({insp.vehicles?.make})</span>
                    <span>{insp.customers?.full_name}</span>
                    <span className="text-xs text-gray-400">{formatDate(insp.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="text-xs text-gray-500">
                      <ClipboardCheck className="w-3 h-3 inline mr-1" />
                      {insp.inspection_items?.length || 0} {t('inspection.problemsFound')}
                    </span>
                    {insp.payment_amount > 0 && (
                      <span className="text-xs font-medium text-gray-700">{t('inspection.fee')}: {formatTZS(insp.payment_amount)}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-2 rounded-lg hover:bg-blue-50 text-blue-600" title="View">
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* New Inspection Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold">{t('inspection.addNew')}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('inspection.customer')} *</label>
                <select value={form.customer_id} onChange={e => handleCustomerChange(e.target.value)} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="">{t('common.select')}</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('inspection.vehicle')} *</label>
                <select value={form.vehicle_id} onChange={e => setForm({...form, vehicle_id: e.target.value})} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="">{t('common.selectVehicle')}</option>
                  {filteredVehicles.map(v => <option key={v.id} value={v.id}>{v.registration_number} - {v.make} {v.model}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('inspection.description')} *</label>
                <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} required rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                  placeholder="Describe customer complaint or reason for inspection..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('inspection.mileageIn')}</label>
                  <input type="number" value={form.mileage_in} onChange={e => setForm({...form, mileage_in: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('inspection.fuelLevel')}</label>
                  <select value={form.fuel_level} onChange={e => setForm({...form, fuel_level: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">{t('common.select')}</option>
                    <option value="empty">{t('fuelLevels.empty')}</option>
                    <option value="quarter">{t('fuelLevels.quarter')}</option>
                    <option value="half">{t('fuelLevels.half')}</option>
                    <option value="three_quarter">{t('fuelLevels.three_quarter')}</option>
                    <option value="full">{t('fuelLevels.full')}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('inspection.paymentAmount')} (TZS) *</label>
                <input type="number" value={form.payment_amount} onChange={e => setForm({...form, payment_amount: e.target.value})} required
                  placeholder="e.g. 50000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('inspection.notes')}</label>
                <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
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
