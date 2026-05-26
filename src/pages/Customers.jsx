import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext'
import { supabase, formatDate } from '../lib/supabase'
import { Plus, Search, Phone, Mail, Car, Edit2, Trash2, X, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Customers() {
  const { t } = useLanguage()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    full_name: '', phone: '', email: '', company_name: '',
    tin_number: '', address: '', id_type: '', id_number: '', notes: ''
  })

  useEffect(() => { fetchCustomers() }, [])

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*, vehicles(count)')
        .order('created_at', { ascending: false })
      if (error) throw error
      setCustomers(data || [])
    } catch (err) {
      toast.error(t('customers.loadError'))
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const payload = { ...form }
      const optionalFields = ['email', 'company_name', 'tin_number', 'address', 'id_type', 'id_number', 'notes']
      optionalFields.forEach(f => { if (!payload[f]) payload[f] = null })

      if (editingId) {
        const { error } = await supabase.from('customers').update(payload).eq('id', editingId)
        if (error) throw error
        toast.success(t('customers.updated'))
      } else {
        const { error } = await supabase.from('customers').insert(payload)
        if (error) throw error
        toast.success(t('customers.added'))
      }
      setShowForm(false)
      resetForm()
      fetchCustomers()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleEdit = (customer) => {
    setForm({
      full_name: customer.full_name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      company_name: customer.company_name || '',
      tin_number: customer.tin_number || '',
      address: customer.address || '',
      id_type: customer.id_type || '',
      id_number: customer.id_number || '',
      notes: customer.notes || '',
    })
    setEditingId(customer.id)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!confirm(t('customers.deleteConfirm'))) return
    try {
      const { error } = await supabase.from('customers').delete().eq('id', id)
      if (error) throw error
      toast.success(t('customers.deleted'))
      fetchCustomers()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const resetForm = () => {
    setForm({ full_name: '', phone: '', email: '', company_name: '', tin_number: '', address: '', id_type: '', id_number: '', notes: '' })
    setEditingId(null)
  }

  const filtered = customers.filter(c =>
    c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search) ||
    c.company_name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{t('customers.title')}</h1>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          {t('customers.addNew')}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('customers.search')}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
        />
      </div>

      {/* Customer List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center p-8">
            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-gray-500">{t('customers.noResults')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left p-3 font-medium text-gray-600">{t('customers.name')}</th>
                  <th className="text-left p-3 font-medium text-gray-600">{t('customers.phone')}</th>
                  <th className="text-left p-3 font-medium text-gray-600 hidden md:table-cell">{t('customers.company')}</th>
                  <th className="text-left p-3 font-medium text-gray-600 hidden lg:table-cell">{t('customers.vehicles')}</th>
                  <th className="text-left p-3 font-medium text-gray-600 hidden lg:table-cell">{t('common.created')}</th>
                  <th className="text-right p-3 font-medium text-gray-600">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-50">
                    <td className="p-3">
                      <Link to={`/customers/${customer.id}`} className="font-medium text-blue-700 hover:text-blue-800">
                        {customer.full_name}
                      </Link>
                      {customer.email && (
                        <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                          <Mail className="w-3 h-3" /> {customer.email}
                        </p>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="flex items-center gap-1 text-gray-700">
                        <Phone className="w-3 h-3" /> {customer.phone}
                      </span>
                    </td>
                    <td className="p-3 hidden md:table-cell text-gray-600">{customer.company_name || '-'}</td>
                    <td className="p-3 hidden lg:table-cell">
                      <span className="flex items-center gap-1 text-gray-600">
                        <Car className="w-3 h-3" /> {customer.vehicles?.[0]?.count || 0}
                      </span>
                    </td>
                    <td className="p-3 hidden lg:table-cell text-gray-500 text-xs">{formatDate(customer.created_at)}</td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleEdit(customer)} className="p-1.5 rounded hover:bg-gray-100" title="Edit">
                          <Edit2 className="w-4 h-4 text-gray-500" />
                        </button>
                        <button onClick={() => handleDelete(customer.id)} className="p-1.5 rounded hover:bg-red-50" title="Delete">
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
              <h2 className="text-lg font-bold">{editingId ? t('customers.edit') : t('customers.addNew')}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('customers.name')} *</label>
                  <input type="text" value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('customers.phone')} *</label>
                  <input type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="+255..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('customers.email')}</label>
                  <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('customers.company')}</label>
                  <input type="text" value={form.company_name} onChange={e => setForm({...form, company_name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('customers.tin')}</label>
                  <input type="text" value={form.tin_number} onChange={e => setForm({...form, tin_number: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('customers.address')}</label>
                  <input type="text" value={form.address} onChange={e => setForm({...form, address: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('customers.idType')}</label>
                  <select value={form.id_type} onChange={e => setForm({...form, id_type: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">-- Select --</option>
                    <option value="nida">NIDA</option>
                    <option value="passport">Passport</option>
                    <option value="driving_license">Driving License</option>
                    <option value="voter_id">Voter ID</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('customers.idNumber')}</label>
                  <input type="text" value={form.id_number} onChange={e => setForm({...form, id_number: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('customers.notes')}</label>
                  <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
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
