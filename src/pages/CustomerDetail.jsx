import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext'
import { supabase, formatDate, formatTZS } from '../lib/supabase'
import {
  ArrowLeft, Phone, Mail, Building2, CreditCard, MapPin, FileText, User,
  Truck, Plus, X, Trash2, Edit2, ClipboardCheck, ClipboardList, Gauge,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { emptyVehicle } from '../lib/vehicleOptions'
import VehicleFormBlock from '../components/vehicles/VehicleFormBlock'

export default function CustomerDetail() {
  const { id } = useParams()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [customer, setCustomer] = useState(null)
  const [vehicles, setVehicles] = useState([])
  const [inspections, setInspections] = useState([])
  const [jobCards, setJobCards] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)

  // Add-vehicle modal state
  const [showVehicleForm, setShowVehicleForm] = useState(false)
  const [newVehicle, setNewVehicle] = useState(emptyVehicle())
  const [savingVehicle, setSavingVehicle] = useState(false)

  useEffect(() => { fetchAll() }, [id])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const { data: cust, error: custErr } = await supabase
        .from('customers').select('*').eq('id', id).single()
      if (custErr) throw custErr
      setCustomer(cust)

      const [veh, insp, jc, inv] = await Promise.all([
        supabase.from('vehicles').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
        supabase.from('inspections').select('*, vehicles(registration_number)').eq('customer_id', id).order('created_at', { ascending: false }),
        supabase.from('job_cards').select('*, vehicles(registration_number)').eq('customer_id', id).order('created_at', { ascending: false }),
        supabase.from('invoices').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
      ])
      setVehicles(veh.data || [])
      setInspections(insp.data || [])
      setJobCards(jc.data || [])
      setInvoices(inv.data || [])
    } catch (err) {
      toast.error(t('customers.loadError'))
      navigate('/admin/customers')
    } finally {
      setLoading(false)
    }
  }

  const updateNewVehicle = (index, updates) =>
    setNewVehicle(prev => ({ ...prev, ...updates }))

  const handleAddVehicle = async (e) => {
    e.preventDefault()
    if (!newVehicle.make?.trim() || !newVehicle.registration_number?.trim()) {
      toast.error(t('customers.vehicleRequired'))
      return
    }
    setSavingVehicle(true)
    try {
      const { error } = await supabase.from('vehicles').insert({
        customer_id: id,
        vehicle_type: newVehicle.vehicle_type,
        make: newVehicle.make.trim(),
        model: newVehicle.model?.trim() || null,
        registration_number: newVehicle.registration_number.toUpperCase().trim(),
        chassis_number: newVehicle.chassis_number || null,
        year: newVehicle.year ? parseInt(newVehicle.year) : null,
        color: newVehicle.color?.trim() || null,
        mileage_km: newVehicle.mileage_km ? parseInt(newVehicle.mileage_km) : null,
      })
      if (error) throw error
      toast.success(t('customers.detail.vehicleAdded'))
      setShowVehicleForm(false)
      setNewVehicle(emptyVehicle())
      fetchAll()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingVehicle(false)
    }
  }

  const handleDeleteVehicle = async (vehicleId) => {
    if (!confirm(t('customers.detail.deleteVehicleConfirm'))) return
    try {
      // Same silent no-op as the customer delete: without .select(), an RLS
      // block returns error = null and the UI claims success. See migration 019.
      const { data, error } = await supabase
        .from('vehicles').delete().eq('id', vehicleId).select('id')
      if (error) throw error
      if (!data || data.length === 0) {
        toast.error(t('customers.detail.vehicleDeleteBlocked'))
        return
      }
      toast.success(t('customers.detail.vehicleDeleted'))
      fetchAll()
    } catch (err) {
      // A vehicle with job cards / inspections against it can't be removed.
      if (err.code === '23503') toast.error(t('customers.detail.vehicleHasRecords'))
      else toast.error(err.message)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (!customer) return null

  const statusBadge = (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
      customer.status === 'pending' ? 'bg-orange-100 text-orange-700' :
      customer.status === 'rejected' ? 'bg-red-100 text-red-700' :
      'bg-green-100 text-green-700'
    }`}>
      {t(`customers.status${customer.status ? customer.status.charAt(0).toUpperCase() + customer.status.slice(1) : 'Approved'}`)}
    </span>
  )

  const infoRows = [
    { icon: Phone, label: t('customers.phone'), value: customer.phone },
    { icon: Mail, label: t('customers.email'), value: customer.email },
    { icon: Building2, label: t('customers.company'), value: customer.company_name },
    { icon: CreditCard, label: t('customers.tin'), value: customer.tin_number },
    { icon: CreditCard, label: t('customers.vrn'), value: customer.vrn_number },
    // Structured address, falling back to the legacy single-line field for
    // records created before migration 017.
    {
      icon: MapPin,
      label: t('customers.address'),
      value: [customer.street, customer.district, customer.region]
        .filter(Boolean).join(', ') || customer.address,
    },
    { icon: MapPin, label: t('customers.poBox'), value: customer.po_box },
    { icon: User, label: t('customers.idType'), value: customer.id_type },
    { icon: CreditCard, label: t('customers.idNumber'), value: customer.id_number },
  ].filter(r => r.value)

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Back + header */}
      <div>
        <Link to="/admin/customers" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-3">
          <ArrowLeft className="w-4 h-4" /> {t('customers.title')}
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0">
              <User className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-gray-900">{customer.full_name}</h1>
                {statusBadge}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium mr-2 ${
                  customer.registered_via === 'online' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {customer.registered_via === 'online' ? t('customers.registeredOnline') : t('customers.registeredWalkIn')}
                </span>
                {t('common.created')}: {formatDate(customer.created_at)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Personal info */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">{t('customers.detail.personalInfo')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {infoRows.map((row, i) => (
            <div key={i} className="flex items-start gap-3">
              <row.icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500">{row.label}</p>
                <p className="text-sm text-gray-900 font-medium">{row.value}</p>
              </div>
            </div>
          ))}
        </div>
        {customer.notes && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-start gap-3">
            <FileText className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-500">{t('customers.notes')}</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{customer.notes}</p>
            </div>
          </div>
        )}
      </div>

      {/* Vehicles */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            {t('customers.vehicles')} <span className="text-gray-400">({vehicles.length})</span>
          </h2>
          <button
            onClick={() => { setNewVehicle(emptyVehicle()); setShowVehicleForm(true) }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition"
          >
            <Plus className="w-4 h-4" /> {t('customers.detail.addVehicle')}
          </button>
        </div>

        {vehicles.length === 0 ? (
          <div className="text-center py-6 px-4 bg-gray-50 rounded-xl border border-dashed border-gray-300">
            <Truck className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">{t('customers.detail.noVehicles')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {vehicles.map((v) => (
              <div key={v.id} className="border border-gray-200 rounded-xl p-4 relative group">
                <button
                  onClick={() => handleDeleteVehicle(v.id)}
                  className="absolute top-3 right-3 p-1 rounded hover:bg-red-50 opacity-0 group-hover:opacity-100 transition"
                  title={t('customers.detail.deleteVehicle')}
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Truck className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900">{v.registration_number}</p>
                    <p className="text-sm text-gray-600">
                      {[v.make, v.model, v.year].filter(Boolean).join(' ')}
                      {v.vehicle_type ? ` · ${v.vehicle_type}` : ''}
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-gray-500">
                      {v.color && (
                        <span className="flex items-center gap-1">
                          <span className="w-3 h-3 rounded-full border border-gray-300" style={{ backgroundColor: v.color.toLowerCase() }} />
                          {v.color}
                        </span>
                      )}
                      {(v.mileage_km || v.mileage_km === 0) && (
                        <span className="flex items-center gap-1"><Gauge className="w-3 h-3" /> {Number(v.mileage_km).toLocaleString()} km</span>
                      )}
                    </div>
                    {v.chassis_number && (
                      <p className="text-[10px] text-gray-400 mt-1.5">{t('customers.detail.chassis')}: {v.chassis_number}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Service history */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Inspections */}
        <HistoryCard
          title={t('nav.inspections')}
          icon={ClipboardCheck}
          empty={t('customers.detail.noInspections')}
          items={inspections}
          renderItem={(it) => (
            <Link key={it.id} to={`/admin/inspections/${it.id}`}
              className="block px-3 py-2.5 hover:bg-gray-50 rounded-lg transition">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-blue-700">{it.inspection_number || '—'}</span>
                <StatusPill status={it.status} />
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {it.vehicles?.registration_number || ''} · {formatDate(it.created_at)}
              </p>
            </Link>
          )}
        />

        {/* Job cards */}
        <HistoryCard
          title={t('nav.jobCards')}
          icon={ClipboardList}
          empty={t('customers.detail.noJobCards')}
          items={jobCards}
          renderItem={(it) => (
            <Link key={it.id} to={`/admin/job-cards/${it.id}`}
              className="block px-3 py-2.5 hover:bg-gray-50 rounded-lg transition">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-blue-700">{it.job_number || '—'}</span>
                <StatusPill status={it.status} />
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {it.vehicles?.registration_number || ''} · {formatDate(it.created_at)}
              </p>
            </Link>
          )}
        />

        {/* Invoices */}
        <HistoryCard
          title={t('nav.invoices')}
          icon={FileText}
          empty={t('customers.detail.noInvoices')}
          items={invoices}
          renderItem={(it) => (
            <Link key={it.id} to={`/admin/invoices/${it.id}`}
              className="block px-3 py-2.5 hover:bg-gray-50 rounded-lg transition">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-blue-700">{it.invoice_number || '—'}</span>
                <StatusPill status={it.status} />
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {formatTZS(it.total_amount)} · {formatDate(it.created_at)}
              </p>
            </Link>
          )}
        />
      </div>

      {/* Add vehicle modal */}
      {showVehicleForm && (
        <div className="fixed inset-0 glass-overlay z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto modal-card">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold">{t('customers.detail.addVehicle')}</h2>
              <button onClick={() => setShowVehicleForm(false)} className="p-1 rounded hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddVehicle} className="p-5 space-y-4">
              <VehicleFormBlock
                index={0}
                vehicle={newVehicle}
                total={1}
                updateVehicle={updateNewVehicle}
                removeVehicle={() => {}}
                t={t}
                variant="compact"
              />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowVehicleForm(false)}
                  className="px-6 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition">
                  {t('common.cancel')}
                </button>
                <button type="submit" disabled={savingVehicle}
                  className="flex-1 py-2.5 bg-blue-700 text-white font-medium rounded-lg hover:bg-blue-800 transition disabled:opacity-50">
                  {savingVehicle ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function HistoryCard({ title, icon: Icon, items, empty, renderItem }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        <span className="text-xs text-gray-400">({items.length})</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-gray-400 px-3 py-4 text-center">{empty}</p>
      ) : (
        <div className="space-y-0.5 -mx-1">
          {items.map(renderItem)}
        </div>
      )}
    </div>
  )
}

function StatusPill({ status }) {
  if (!status) return null
  const map = {
    completed: 'bg-green-100 text-green-700',
    paid: 'bg-green-100 text-green-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    pending_payment: 'bg-orange-100 text-orange-700',
    pending_approval: 'bg-purple-100 text-purple-700',
    pre_job_card: 'bg-purple-100 text-purple-700',
    draft: 'bg-gray-100 text-gray-600',
    sent: 'bg-blue-100 text-blue-700',
    approved: 'bg-blue-100 text-blue-700',
  }
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}
