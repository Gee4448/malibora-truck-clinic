import { useState, useEffect } from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase, formatTZS } from '../lib/supabase'
import { Plus, Edit2, Trash2, X, Wrench, Search } from 'lucide-react'
import toast from 'react-hot-toast'

export default function LabourRates() {
  const { t } = useLanguage()
  const { canViewInternal } = useAuth()
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    service_name: '', description: '', category: 'service',
    cost_rate: '', selling_rate: '', estimated_hours: '1',
  })

  useEffect(() => { fetchServices() }, [])

  const fetchServices = async () => {
    try {
      const { data, error } = await supabase
        .from('labour_rates')
        .select('*')
        .eq('is_active', true)
        .order('category, service_name')
      if (error) throw error
      setServices(data || [])
    } catch (err) {
      toast.error(t('labour.loadError'))
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = {
      ...form,
      cost_rate: Number(form.cost_rate),
      selling_rate: Number(form.selling_rate),
      estimated_hours: Number(form.estimated_hours) || 1,
    }
    try {
      if (editingId) {
        await supabase.from('labour_rates').update(payload).eq('id', editingId)
        toast.success(t('labour.updated'))
      } else {
        await supabase.from('labour_rates').insert(payload)
        toast.success(t('labour.added'))
      }
      setShowForm(false)
      resetForm()
      fetchServices()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleEdit = (svc) => {
    setForm({
      service_name: svc.service_name || '', description: svc.description || '',
      category: svc.category || 'service', cost_rate: svc.cost_rate || '',
      selling_rate: svc.selling_rate || '', estimated_hours: svc.estimated_hours || '1',
    })
    setEditingId(svc.id)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!confirm(t('labour.deactivateConfirm'))) return
    await supabase.from('labour_rates').update({ is_active: false }).eq('id', id)
    toast.success(t('labour.deactivated'))
    fetchServices()
  }

  const resetForm = () => {
    setForm({ service_name: '', description: '', category: 'service', cost_rate: '', selling_rate: '', estimated_hours: '1' })
    setEditingId(null)
  }

  const categories = ['service', 'maintenance', 'body_work', 'electrical', 'diagnostics', 'other']

  const filtered = services.filter(s => {
    const matchSearch = s.service_name?.toLowerCase().includes(search.toLowerCase())
    const matchCat = categoryFilter === 'all' || s.category === categoryFilter
    return matchSearch && matchCat
  })

  const catColors = {
    service: 'bg-blue-100 text-blue-700',
    maintenance: 'bg-green-100 text-green-700',
    body_work: 'bg-purple-100 text-purple-700',
    electrical: 'bg-yellow-100 text-yellow-700',
    diagnostics: 'bg-orange-100 text-orange-700',
    other: 'bg-gray-100 text-gray-600',
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{t('labour.title')}</h1>
        <button onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition text-sm font-medium">
          <Plus className="w-4 h-4" /> {t('labour.addService')}
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search services..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          className="px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm">
          <option value="all">{t('common.all')} {t('common.categories')}</option>
          {categories.map(c => <option key={c} value={c}>{t(`labour.categories.${c}`)}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center p-8"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div></div>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-gray-500">{t('common.noData')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left p-3 font-medium text-gray-600">{t('labour.serviceName')}</th>
                  <th className="text-left p-3 font-medium text-gray-600 hidden md:table-cell">{t('labour.category')}</th>
                  {canViewInternal && <th className="text-right p-3 font-medium text-gray-600">{t('labour.costRate')}</th>}
                  <th className="text-right p-3 font-medium text-gray-600">{t('labour.sellingRate')}</th>
                  <th className="text-center p-3 font-medium text-gray-600 hidden md:table-cell">{t('labour.estimatedHours')}</th>
                  <th className="text-right p-3 font-medium text-gray-600">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((svc) => (
                  <tr key={svc.id} className="hover:bg-gray-50">
                    <td className="p-3">
                      <p className="font-medium text-gray-900 flex items-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5 text-gray-400" />
                        {svc.service_name}
                      </p>
                      {svc.description && <p className="text-xs text-gray-400 ml-5">{svc.description}</p>}
                    </td>
                    <td className="p-3 hidden md:table-cell">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${catColors[svc.category]}`}>
                        {t(`labour.categories.${svc.category}`)}
                      </span>
                    </td>
                    {canViewInternal && <td className="p-3 text-right text-gray-500">{formatTZS(svc.cost_rate)}</td>}
                    <td className="p-3 text-right font-medium">{formatTZS(svc.selling_rate)}</td>
                    <td className="p-3 text-center hidden md:table-cell text-gray-600">{svc.estimated_hours} hrs</td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleEdit(svc)} className="p-1.5 rounded hover:bg-gray-100"><Edit2 className="w-4 h-4 text-gray-500" /></button>
                        <button onClick={() => handleDelete(svc.id)} className="p-1.5 rounded hover:bg-red-50"><Trash2 className="w-4 h-4 text-red-500" /></button>
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold">{editingId ? t('labour.edit') : t('labour.addService')}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('labour.serviceName')} *</label>
                <input type="text" value={form.service_name} onChange={e => setForm({...form, service_name: e.target.value})} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. Oil Change, Brake Pad Replacement..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('labour.description')}</label>
                <input type="text" value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('labour.category')}</label>
                <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                  {categories.map(c => <option key={c} value={c}>{t(`labour.categories.${c}`)}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cost (TZS) *</label>
                  <input type="number" value={form.cost_rate} onChange={e => setForm({...form, cost_rate: e.target.value})} required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sell (TZS) *</label>
                  <input type="number" value={form.selling_rate} onChange={e => setForm({...form, selling_rate: e.target.value})} required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hours</label>
                  <input type="number" value={form.estimated_hours} onChange={e => setForm({...form, estimated_hours: e.target.value})}
                    step="0.5" min="0.5" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 py-2.5 bg-blue-700 text-white font-medium rounded-lg hover:bg-blue-800 transition">{t('common.save')}</button>
                <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition">{t('common.cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
