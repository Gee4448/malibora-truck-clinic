import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase, formatDate, formatTZS } from '../lib/supabase'
import { Plus, Search, Filter, Edit2, Eye, FileText, X, Truck, Clock } from 'lucide-react'
import toast from 'react-hot-toast'

export default function JobCards() {
  const { t } = useLanguage()
  const { canViewInternal } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  // Dashboard widget buttons deep-link via ?status=requested|in_progress|completed.
  const statusFilter = searchParams.get('status') || 'all'
  const setStatusFilter = (v) => {
    const next = new URLSearchParams(searchParams)
    if (!v || v === 'all') next.delete('status'); else next.set('status', v)
    setSearchParams(next, { replace: true })
  }
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [customers, setCustomers] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [filteredVehicles, setFilteredVehicles] = useState([])
  const [form, setForm] = useState({
    customer_id: '', vehicle_id: '', section: 'service',
    priority: 'normal', description: '', diagnosis: '',
    mileage_in: '', fuel_level: '', date_promised: '', notes: ''
  })

  useEffect(() => {
    fetchJobs()
    fetchCustomers()
  }, [])

  const fetchJobs = async () => {
    try {
      const { data, error } = await supabase
        .from('job_cards')
        .select(`
          *,
          customers(full_name, phone),
          vehicles(registration_number, make, model),
          job_card_items(total_selling, total_cost)
        `)
        .order('created_at', { ascending: false })
      if (error) throw error
      setJobs(data || [])
    } catch (err) {
      toast.error(t('jobs.loadError'))
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
    const payload = {
      ...form,
      mileage_in: form.mileage_in ? parseInt(form.mileage_in) : null,
      date_promised: form.date_promised || null,
    }
    try {
      if (editingId) {
        const { error } = await supabase.from('job_cards').update(payload).eq('id', editingId)
        if (error) throw error
        toast.success(t('jobs.updated'))
      } else {
        const { data, error } = await supabase.from('job_cards').insert(payload).select().single()
        if (error) throw error
        toast.success(t('jobs.created'))
        navigate(`/admin/job-cards/${data.id}`)
      }
      setShowForm(false)
      resetForm()
      fetchJobs()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const updateStatus = async (id, status) => {
    try {
      const update = { status }
      if (status === 'completed') update.date_completed = new Date().toISOString()
      await supabase.from('job_cards').update(update).eq('id', id)
      toast.success(t('jobs.statusUpdated'))
      fetchJobs()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const resetForm = () => {
    setForm({ customer_id: '', vehicle_id: '', section: 'service', priority: 'normal', description: '', diagnosis: '', mileage_in: '', fuel_level: '', date_promised: '', notes: '' })
    setEditingId(null)
    setFilteredVehicles([])
  }

  const statusColors = {
    customer_request: 'bg-pink-100 text-pink-700',
    pre_job_card: 'bg-purple-100 text-purple-700',
    pending_approval: 'bg-amber-100 text-amber-700',
    open: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    waiting_parts: 'bg-orange-100 text-orange-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
  }

  const priorityColors = {
    low: 'text-gray-500',
    normal: 'text-blue-600',
    high: 'text-orange-600',
    urgent: 'text-red-600 font-bold',
  }

  // Aliases for the dashboard widget buttons.
  const statusAliasMap = {
    requested: ['customer_request', 'pre_job_card', 'pending_approval'],
    in_progress: ['open', 'in_progress', 'waiting_parts'],
    completed: ['completed'],
  }
  const matchesStatus = (rowStatus) => {
    if (statusFilter === 'all') return true
    const aliasGroup = statusAliasMap[statusFilter]
    if (aliasGroup) return aliasGroup.includes(rowStatus)
    return rowStatus === statusFilter
  }

  const filtered = jobs.filter(j => {
    const matchSearch = j.job_number?.toLowerCase().includes(search.toLowerCase()) ||
      j.customers?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      j.vehicles?.registration_number?.toLowerCase().includes(search.toLowerCase())
    return matchSearch && matchesStatus(j.status)
  })

  const calcJobTotal = (items) => items?.reduce((sum, i) => sum + Number(i.total_selling || 0), 0) || 0

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{t('jobs.title')}</h1>
        <button onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition text-sm font-medium">
          <Plus className="w-4 h-4" /> {t('jobs.addNew')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t('jobs.search')}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { key: 'all', label: t('common.all') },
            { key: 'requested', label: t('jobs.filterRequested') },
            { key: 'in_progress', label: t('jobs.filterInProgress') },
            { key: 'completed', label: t('jobs.statuses.completed') },
          ].map(s => (
            <button key={s.key} onClick={() => setStatusFilter(s.key)}
              className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                statusFilter === s.key ? 'bg-blue-700 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Job Cards List */}
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
          filtered.map((job) => (
            <div key={job.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Link to={`/admin/job-cards/${job.id}`} className="text-lg font-bold text-blue-700 hover:text-blue-800">
                      {job.job_number}
                    </Link>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[job.status]}`}>
                      {t(`jobs.statuses.${job.status}`)}
                    </span>
                    <span className={`text-xs ${priorityColors[job.priority]}`}>
                      [{t(`jobs.priorities.${job.priority}`)}]
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                      {job.section === 'service' ? t('jobs.service') : t('jobs.bodyWork')}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <Truck className="w-3.5 h-3.5" />
                      {job.vehicles?.registration_number} ({job.vehicles?.make})
                    </span>
                    <span>{job.customers?.full_name}</span>
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <Clock className="w-3 h-3" /> {formatDate(job.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1 line-clamp-1">{job.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  {canViewInternal && (
                    <span className="text-sm font-semibold text-gray-900">
                      {formatTZS(calcJobTotal(job.job_card_items))}
                    </span>
                  )}
                  <Link to={`/admin/job-cards/${job.id}`}
                    className="p-2 rounded-lg hover:bg-blue-50 text-blue-600" title="View">
                    <Eye className="w-4 h-4" />
                  </Link>
                  {job.status !== 'completed' && job.status !== 'cancelled' && (
                    <select value={job.status} onChange={e => updateStatus(job.id, e.target.value)}
                      className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="pre_job_card">{t('jobs.statuses.pre_job_card')}</option>
                      <option value="pending_approval">{t('jobs.statuses.pending_approval')}</option>
                      <option value="open">{t('jobs.statuses.open')}</option>
                      <option value="in_progress">{t('jobs.statuses.in_progress')}</option>
                      <option value="waiting_parts">{t('jobs.statuses.waiting_parts')}</option>
                      <option value="completed">{t('jobs.statuses.completed')}</option>
                      <option value="cancelled">{t('jobs.statuses.cancelled')}</option>
                    </select>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* New Job Card Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold">{t('jobs.addNew')}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('jobs.customer')} *</label>
                  <select value={form.customer_id} onChange={e => handleCustomerChange(e.target.value)} required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">{t('common.select')}</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('jobs.vehicle')} *</label>
                  <select value={form.vehicle_id} onChange={e => setForm({...form, vehicle_id: e.target.value})} required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">{t('common.selectVehicle')}</option>
                    {filteredVehicles.map(v => <option key={v.id} value={v.id}>{v.registration_number} - {v.make} {v.model}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('jobs.section')}</label>
                  <select value={form.section} onChange={e => setForm({...form, section: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="service">{t('jobs.service')}</option>
                    <option value="body_work">{t('jobs.bodyWork')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('jobs.priority')}</label>
                  <select value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="low">{t('jobs.priorities.low')}</option>
                    <option value="normal">{t('jobs.priorities.normal')}</option>
                    <option value="high">{t('jobs.priorities.high')}</option>
                    <option value="urgent">{t('jobs.priorities.urgent')}</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('jobs.description')} *</label>
                  <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} required rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                    placeholder="Describe the work required or customer complaint..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('jobs.mileageIn')}</label>
                  <input type="number" value={form.mileage_in} onChange={e => setForm({...form, mileage_in: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('jobs.fuelLevel')}</label>
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
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('jobs.datePromised')}</label>
                  <input type="date" value={form.date_promised} onChange={e => setForm({...form, date_promised: e.target.value})}
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
