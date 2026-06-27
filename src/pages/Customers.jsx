import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext'
import { supabase, formatDate } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Plus, Search, Phone, Mail, Car, Edit2, Trash2, X, CheckCircle2, XCircle, ArrowLeft, ArrowRight, UserPlus, Globe, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { emptyVehicle } from '../lib/vehicleOptions'
import VehicleFormBlock from '../components/vehicles/VehicleFormBlock'

export default function Customers() {
  const { t } = useLanguage()
  const { profile } = useAuth()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  // Default to the approved list — that's the "already registered customers" the
  // user lands on for day-to-day lookup. Pending and All are reachable via cards.
  const [statusFilter, setStatusFilter] = useState('approved')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [step, setStep] = useState(1) // 1 = personal info, 2 = vehicles (new clients only)
  const [submitting, setSubmitting] = useState(false)
  const [vehicles, setVehicles] = useState([])
  const [form, setForm] = useState({
    full_name: '', phone: '', email: '', company_name: '',
    tin_number: '', address: '', id_type: '', id_number: '', notes: ''
  })

  const updateVehicle = (index, updates) =>
    setVehicles(prev => prev.map((v, i) => i === index ? { ...v, ...updates } : v))
  const addVehicle = () => setVehicles(prev => [...prev, emptyVehicle()])
  const removeVehicle = (index) =>
    setVehicles(prev => prev.filter((_, i) => i !== index))

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

  // Step 1 (personal info) submit: validate, then either save (edit mode) or advance to vehicles.
  const handlePersonalSubmit = (e) => {
    e.preventDefault()
    if (editingId) {
      saveCustomer()
    } else {
      setStep(2)
    }
  }

  // Final submit for new clients: save customer, then bulk-insert any vehicles entered.
  const handleFinalSubmit = async (e) => {
    e.preventDefault()
    await saveCustomer()
  }

  const saveCustomer = async () => {
    setSubmitting(true)
    try {
      const payload = { ...form }
      const optionalFields = ['email', 'company_name', 'tin_number', 'address', 'id_type', 'id_number', 'notes']
      optionalFields.forEach(f => { if (!payload[f]) payload[f] = null })

      if (editingId) {
        const { error } = await supabase.from('customers').update(payload).eq('id', editingId)
        if (error) throw error
        toast.success(t('customers.updated'))
      } else {
        payload.status = 'approved'
        payload.registered_via = 'walk_in'

        // Validate any in-progress vehicles before creating the customer — avoids
        // leaving an orphan customer if vehicle entry is half-filled.
        const cleanVehicles = vehicles.filter(v => v.make || v.registration_number)
        const invalidVehicle = cleanVehicles.find(v =>
          !v.make?.trim() || !v.registration_number?.trim()
        )
        if (invalidVehicle) {
          toast.error(t('customers.vehicleRequired'))
          setStep(2)
          setSubmitting(false)
          return
        }

        const { data: newCustomer, error } = await supabase
          .from('customers').insert(payload).select().single()
        if (error) throw error

        if (cleanVehicles.length > 0) {
          const vehiclePayloads = cleanVehicles.map(v => ({
            customer_id: newCustomer.id,
            vehicle_type: v.vehicle_type,
            make: v.make.trim(),
            model: v.model?.trim() || null,
            registration_number: v.registration_number.toUpperCase().trim(),
            engine_type: v.engine_type || null,
            chassis_number: v.chassis_number || null,
            axles: v.axles ? parseInt(v.axles) : null,
            fuel_type: v.fuel_type,
          }))
          const { error: vErr } = await supabase.from('vehicles').insert(vehiclePayloads)
          if (vErr) {
            // Customer was created but vehicles failed — partial success.
            toast.error(t('customers.addedNoVehicles'))
            console.error('Vehicle insert error:', vErr)
            closeForm()
            fetchCustomers()
            return
          }
        }
        toast.success(t('customers.added'))
      }
      closeForm()
      fetchCustomers()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
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
    setVehicles([])
    setEditingId(customer.id)
    setStep(1)
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    resetForm()
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
    setVehicles([])
    setStep(1)
  }

  const handleApprove = async (id) => {
    try {
      const { error } = await supabase.from('customers').update({
        status: 'approved',
        approved_by: profile?.id,
        approved_at: new Date().toISOString(),
      }).eq('id', id)
      if (error) throw error
      toast.success(t('customers.approved'))
      fetchCustomers()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleReject = async (id) => {
    if (!confirm(t('customers.rejectConfirm'))) return
    try {
      const { error } = await supabase.from('customers').update({ status: 'rejected' }).eq('id', id)
      if (error) throw error
      toast.success(t('customers.rejected'))
      fetchCustomers()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const filtered = customers
    .filter(c => statusFilter === 'all' || c.status === statusFilter)
    .filter(c =>
      c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.includes(search) ||
      c.company_name?.toLowerCase().includes(search.toLowerCase())
    )

  const pendingCount = customers.filter(c => c.status === 'pending').length
  const approvedCount = customers.filter(c => c.status === 'approved').length

  return (
    <div className="space-y-5">
      {/* Page title */}
      <h1 className="text-2xl font-bold text-gray-900">{t('customers.title')}</h1>

      {/* Action cards — the three entry points into customer management */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Card 1: Add new walk-in customer (always an action, never a filter) */}
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="text-left p-4 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 hover:bg-blue-100 hover:border-blue-400 transition"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-blue-900">{t('customers.tiles.addNew.title')}</h3>
          </div>
          <p className="text-xs text-blue-700/80">{t('customers.tiles.addNew.desc')}</p>
        </button>

        {/* Card 2: Online registration requests (filter = pending) */}
        <button
          onClick={() => setStatusFilter('pending')}
          className={`text-left p-4 rounded-xl border-2 transition ${
            statusFilter === 'pending'
              ? 'border-orange-400 bg-orange-50 ring-2 ring-orange-200'
              : 'border-gray-200 bg-white hover:border-orange-200 hover:bg-orange-50/50'
          }`}
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-orange-500 text-white flex items-center justify-center relative">
              <Globe className="w-5 h-5" />
              {pendingCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 bg-red-500 text-white text-[11px] font-bold rounded-full flex items-center justify-center">
                  {pendingCount}
                </span>
              )}
            </div>
            <h3 className="font-semibold text-gray-900">{t('customers.tiles.pending.title')}</h3>
          </div>
          <p className="text-xs text-gray-600">
            {pendingCount === 0
              ? t('customers.tiles.pending.empty')
              : t('customers.tiles.pending.desc').replace('{count}', pendingCount)}
          </p>
        </button>

        {/* Card 3: Already registered (approved) customers (filter = approved) */}
        <button
          onClick={() => setStatusFilter('approved')}
          className={`text-left p-4 rounded-xl border-2 transition ${
            statusFilter === 'approved'
              ? 'border-green-400 bg-green-50 ring-2 ring-green-200'
              : 'border-gray-200 bg-white hover:border-green-200 hover:bg-green-50/50'
          }`}
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-green-600 text-white flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-gray-900">{t('customers.tiles.registered.title')}</h3>
          </div>
          <p className="text-xs text-gray-600">
            {t('customers.tiles.registered.desc').replace('{count}', approvedCount)}
          </p>
        </button>
      </div>

      {/* "Show all" — still reachable, just less prominent */}
      <div className="flex justify-end">
        <button
          onClick={() => setStatusFilter('all')}
          className={`text-xs font-medium px-3 py-1 rounded-full transition ${
            statusFilter === 'all'
              ? 'bg-gray-900 text-white'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          {t('customers.tiles.showAll')}
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
                  <th className="text-left p-3 font-medium text-gray-600 hidden md:table-cell">{t('common.type')}</th>
                  <th className="text-left p-3 font-medium text-gray-600 hidden lg:table-cell">{t('customers.vehicles')}</th>
                  <th className="text-left p-3 font-medium text-gray-600 hidden lg:table-cell">{t('common.created')}</th>
                  <th className="text-right p-3 font-medium text-gray-600">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-50">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Link to={`/admin/customers/${customer.id}`} className="font-medium text-blue-700 hover:text-blue-800">
                          {customer.full_name}
                        </Link>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          customer.status === 'pending' ? 'bg-orange-100 text-orange-700' :
                          customer.status === 'rejected' ? 'bg-red-100 text-red-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {t(`customers.status${customer.status ? customer.status.charAt(0).toUpperCase() + customer.status.slice(1) : 'Approved'}`)}
                        </span>
                      </div>
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
                    <td className="p-3 hidden md:table-cell">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        customer.registered_via === 'online' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {customer.registered_via === 'online' ? t('customers.registeredOnline') : t('customers.registeredWalkIn')}
                      </span>
                    </td>
                    <td className="p-3 hidden lg:table-cell">
                      <span className="flex items-center gap-1 text-gray-600">
                        <Car className="w-3 h-3" /> {customer.vehicles?.[0]?.count || 0}
                      </span>
                    </td>
                    <td className="p-3 hidden lg:table-cell text-gray-500 text-xs">{formatDate(customer.created_at)}</td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {customer.status === 'pending' && (
                          <>
                            <button onClick={() => handleApprove(customer.id)}
                              className="p-1.5 rounded hover:bg-green-50" title={t('customers.approve')}>
                              <CheckCircle2 className="w-4 h-4 text-green-600" />
                            </button>
                            <button onClick={() => handleReject(customer.id)}
                              className="p-1.5 rounded hover:bg-red-50" title={t('customers.reject')}>
                              <XCircle className="w-4 h-4 text-red-500" />
                            </button>
                          </>
                        )}
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
              <div>
                <h2 className="text-lg font-bold">{editingId ? t('customers.edit') : t('customers.addNew')}</h2>
                {!editingId && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {step === 1 ? t('customers.stepPersonal') : t('customers.stepVehicles')}
                    <span className="ml-2 text-gray-400">{step}/2</span>
                  </p>
                )}
              </div>
              <button onClick={closeForm} className="p-1 rounded hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step 1: personal info (also used for editing) */}
            {step === 1 && (
              <form onSubmit={handlePersonalSubmit} className="p-5 space-y-4">
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
                  <button type="submit" disabled={submitting}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-700 text-white font-medium rounded-lg hover:bg-blue-800 transition disabled:opacity-50">
                    {editingId ? (submitting ? t('common.saving') : t('common.save')) : (
                      <>{t('customers.nextVehicles')} <ArrowRight className="w-4 h-4" /></>
                    )}
                  </button>
                  <button type="button" onClick={closeForm}
                    className="px-6 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition">
                    {t('common.cancel')}
                  </button>
                </div>
              </form>
            )}

            {/* Step 2: vehicles (new clients only) */}
            {step === 2 && !editingId && (
              <form onSubmit={handleFinalSubmit} className="p-5 space-y-4">
                {vehicles.length === 0 ? (
                  <div className="text-center py-6 px-4 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                    <Car className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600 mb-1">{t('customers.noVehiclesYet')}</p>
                    <p className="text-xs text-gray-400">{t('customers.vehiclesOptional')}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {vehicles.map((veh, idx) => (
                      <VehicleFormBlock
                        key={idx}
                        index={idx}
                        vehicle={veh}
                        total={vehicles.length}
                        updateVehicle={updateVehicle}
                        removeVehicle={removeVehicle}
                        t={t}
                        variant="compact"
                      />
                    ))}
                  </div>
                )}

                <button type="button" onClick={addVehicle}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-blue-300 text-blue-600 font-medium rounded-lg hover:bg-blue-50 transition text-sm">
                  <Plus className="w-4 h-4" />
                  {vehicles.length === 0 ? t('customers.addFirstVehicle') : t('customers.addAnotherVehicle')}
                </button>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setStep(1)} disabled={submitting}
                    className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition disabled:opacity-50">
                    <ArrowLeft className="w-4 h-4" />
                    {t('common.back')}
                  </button>
                  <button type="submit" disabled={submitting}
                    className="flex-1 py-2.5 bg-blue-700 text-white font-medium rounded-lg hover:bg-blue-800 transition disabled:opacity-50">
                    {submitting ? t('common.saving') : t('common.save')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
