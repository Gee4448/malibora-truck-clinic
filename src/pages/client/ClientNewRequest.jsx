import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { useClient } from '../../contexts/ClientAuthContext'
import { supabase } from '../../lib/supabase'
import { notifyStaff } from '../../lib/notifications'
import { PART_CATEGORIES, categoryForVehicleType, buildReportedPartsText } from '../../lib/partsCatalog'
import { Truck, Wrench, Search, MapPin, ArrowLeft, Send, ChevronDown, Check, X } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ClientNewRequest() {
  const { t, locale } = useLanguage()
  const { customer } = useClient()
  const navigate = useNavigate()
  // The Inspections tab's ADD button deep-links here with ?type=inspection so
  // the customer lands on the right form instead of on the parts tree.
  const [searchParams] = useSearchParams()
  const askedForInspection = searchParams.get('type') === 'inspection'
  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({
    vehicle_id: '',
    request_type: askedForInspection ? 'inspection_needed' : 'known_problem',
    description: '',
    customer_location: '',
  })

  // Parts-selection tree state (known_problem flow)
  const [categoryId, setCategoryId] = useState(null)
  const [selectedKeys, setSelectedKeys] = useState(new Set()) // "systemId|partIndex"
  const [openSystem, setOpenSystem] = useState(null)

  const category = PART_CATEGORIES.find(c => c.id === categoryId)

  useEffect(() => {
    if (customer?.id) fetchVehicles()
  }, [customer?.id])

  const fetchVehicles = async () => {
    try {
      const { data } = await supabase
        .from('vehicles')
        .select('id, registration_number, make, model, vehicle_type')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
      setVehicles(data || [])
      if (data?.length === 1) {
        selectVehicle(data[0].id, data)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const selectVehicle = (vehicleId, list = vehicles) => {
    setForm(prev => ({ ...prev, vehicle_id: vehicleId }))
    const v = list.find(x => x.id === vehicleId)
    const suggested = categoryForVehicleType(v?.vehicle_type)
    if (suggested && suggested !== categoryId) selectCategory(suggested)
  }

  const selectCategory = (id) => {
    setCategoryId(id)
    setSelectedKeys(new Set()) // system ids repeat across categories — never carry keys over
    setOpenSystem(null)
  }

  const togglePart = (systemId, partIndex) => {
    const key = `${systemId}|${partIndex}`
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const systemCount = (systemId) => {
    let n = 0
    for (const key of selectedKeys) if (key.startsWith(`${systemId}|`)) n++
    return n
  }

  const selectedSummary = category
    ? category.systems
        .map(system => ({
          system,
          parts: system.parts.filter((_, i) => selectedKeys.has(`${system.id}|${i}`)),
        }))
        .filter(g => g.parts.length > 0)
    : []

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.vehicle_id) {
      toast.error(t('client.newRequest.fillRequired'))
      return
    }

    // "I need an inspection" is not a job card. It used to be inserted into
    // job_cards with request_type = 'inspection_needed', which meant staff had
    // to spot it in the Job Cards tab and hand-create the matching inspection.
    // It now goes straight onto the Inspections board (migration 022).
    if (form.request_type === 'inspection_needed') {
      setSubmitting(true)
      try {
        const { data, error } = await supabase
          .from('inspections')
          .insert({
            customer_id: customer.id,
            vehicle_id: form.vehicle_id,
            description: form.description.trim() || null,
            customer_location: form.customer_location.trim() || null,
            // Pinned by the RLS WITH CHECK — the customer never sets a fee.
            status: 'requested',
            payment_status: 'unpaid',
            payment_amount: 0,
          })
          .select('id, inspection_number')
          .single()
        if (error) throw error

        toast.success(t('client.newRequest.inspectionSuccess'))
        notifyStaff({
          type: 'inspection_request',
          title: t('notifications.inspectionRequest'),
          body: `${customer.full_name} — ${data?.inspection_number || ''}${form.customer_location ? ` · ${form.customer_location}` : ''}`,
          inspectionId: data?.id,
          customerId: customer.id,
        })
        navigate('/client/inspections')
      } catch (err) {
        toast.error(err.message)
      } finally {
        setSubmitting(false)
      }
      return
    }

    if (selectedKeys.size === 0 && !form.description.trim()) {
      toast.error(t('client.newRequest.selectAtLeastOne'))
      return
    }
    const description = selectedKeys.size > 0
      ? buildReportedPartsText(categoryId, selectedKeys, form.description, locale)
      : form.description

    setSubmitting(true)
    try {
      const { error } = await supabase.from('job_cards').insert({
        customer_id: customer.id,
        vehicle_id: form.vehicle_id,
        status: 'customer_request',
        request_type: form.request_type,
        description,
        customer_location: form.customer_location || null,
        section: 'service',
        priority: 'normal',
      })
      if (error) throw error
      toast.success(t('client.newRequest.success'))
      navigate('/client/services')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (vehicles.length === 0) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4" /> {t('common.back')}
        </button>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <Truck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">{t('client.newRequest.noVehicles')}</p>
          <button onClick={() => navigate('/client/vehicles')}
            className="mt-4 px-4 py-2 bg-blue-700 text-white rounded-xl text-sm font-medium hover:bg-blue-800 transition">
            {t('client.vehicles.addVehicle')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> {t('common.back')}
      </button>

      <h1 className="text-lg font-bold text-gray-900">
        {form.request_type === 'inspection_needed'
          ? t('client.newRequest.inspectionTitle')
          : t('client.newRequest.title')}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Select Vehicle */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('client.newRequest.selectVehicle')} *
          </label>
          <select
            value={form.vehicle_id}
            onChange={e => selectVehicle(e.target.value)}
            required
            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900"
          >
            <option value="">{t('common.selectVehicle')}</option>
            {vehicles.map(v => (
              <option key={v.id} value={v.id}>
                {v.registration_number} — {v.make} {v.model || ''}
              </option>
            ))}
          </select>
        </div>

        {/* Request Type */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            {t('client.newRequest.requestType')}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setForm({ ...form, request_type: 'known_problem' })}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition ${
                form.request_type === 'known_problem'
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Wrench className={`w-6 h-6 ${form.request_type === 'known_problem' ? 'text-blue-600' : 'text-gray-400'}`} />
              <span className={`text-xs font-medium text-center ${form.request_type === 'known_problem' ? 'text-blue-700' : 'text-gray-600'}`}>
                {t('client.newRequest.knownProblem')}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, request_type: 'inspection_needed' })}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition ${
                form.request_type === 'inspection_needed'
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Search className={`w-6 h-6 ${form.request_type === 'inspection_needed' ? 'text-blue-600' : 'text-gray-400'}`} />
              <span className={`text-xs font-medium text-center ${form.request_type === 'inspection_needed' ? 'text-blue-700' : 'text-gray-600'}`}>
                {t('client.newRequest.needInspection')}
              </span>
            </button>
          </div>
        </div>

        {form.request_type === 'known_problem' && (
          <>
            {/* Step 1: Vehicle category */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('client.newRequest.selectCategory')} *
              </label>
              <p className="text-xs text-gray-400 mb-3">{t('client.newRequest.categoryHint')}</p>
              <div className="grid grid-cols-3 gap-2">
                {PART_CATEGORIES.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectCategory(c.id)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition ${
                      categoryId === c.id ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className="text-2xl">{c.emoji}</span>
                    <span className={`text-xs font-medium text-center leading-tight ${categoryId === c.id ? 'text-blue-700' : 'text-gray-600'}`}>
                      {c.label[locale]}
                    </span>
                    <span className="text-[10px] text-gray-400 text-center leading-tight">{c.hint[locale]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Steps 2 & 3: systems → parts */}
            {category && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('client.newRequest.selectParts')}
                </label>
                <p className="text-xs text-gray-400 mb-3">{t('client.newRequest.partsHint')}</p>
                <div className="space-y-2">
                  {category.systems.map(system => {
                    const count = systemCount(system.id)
                    const open = openSystem === system.id
                    return (
                      <div key={system.id} className={`rounded-xl border ${count > 0 ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200'}`}>
                        <button
                          type="button"
                          onClick={() => setOpenSystem(open ? null : system.id)}
                          className="w-full flex items-center justify-between gap-2 px-3 py-3 text-left"
                        >
                          <span className="text-sm font-medium text-gray-800">{system.label[locale]}</span>
                          <span className="flex items-center gap-2 shrink-0">
                            {count > 0 && (
                              <span className="text-[11px] font-semibold bg-blue-600 text-white rounded-full px-2 py-0.5">
                                {count}
                              </span>
                            )}
                            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                          </span>
                        </button>
                        {open && (
                          <div className="px-3 pb-3 space-y-1">
                            {system.parts.map((part, i) => {
                              const checked = selectedKeys.has(`${system.id}|${i}`)
                              return (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => togglePart(system.id, i)}
                                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition ${
                                    checked ? 'bg-blue-100 text-blue-800' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                                  }`}
                                >
                                  <span className={`shrink-0 w-[18px] h-[18px] rounded border flex items-center justify-center ${
                                    checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'
                                  }`}>
                                    {checked && <Check className="w-3 h-3 text-white" />}
                                  </span>
                                  {part[locale]}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Selection summary */}
            {selectedSummary.length > 0 && (
              <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-blue-900">
                    {t('client.newRequest.selectedParts')} ({selectedKeys.size})
                  </h3>
                  <button
                    type="button"
                    onClick={() => setSelectedKeys(new Set())}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    {t('client.newRequest.clearAll')}
                  </button>
                </div>
                <div className="space-y-2">
                  {selectedSummary.map(({ system, parts }) => (
                    <div key={system.id}>
                      <p className="text-xs font-medium text-blue-700 mb-1">{system.label[locale]}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {parts.map((part) => {
                          const i = system.parts.indexOf(part)
                          return (
                            <span key={i} className="inline-flex items-center gap-1 bg-white border border-blue-200 text-blue-800 text-xs rounded-full pl-2.5 pr-1 py-1">
                              {part[locale]}
                              <button
                                type="button"
                                onClick={() => togglePart(system.id, i)}
                                className="p-0.5 rounded-full hover:bg-blue-100"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Optional extra notes */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('client.newRequest.otherNotes')}
              </label>
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                rows={3}
                placeholder={t('client.newRequest.otherNotesPlaceholder')}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none text-gray-900"
              />
            </div>
          </>
        )}

        {form.request_type === 'inspection_needed' && (
          <>
            <p className="text-xs text-gray-500 px-1">{t('client.newRequest.inspectionHint')}</p>

            {/* Description */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('client.newRequest.describeIssue')}
              </label>
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                rows={4}
                placeholder={t('client.newRequest.descriptionPlaceholder')}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none text-gray-900"
              />
            </div>

            {/* Location (for inspection) */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                <MapPin className="w-3.5 h-3.5 text-gray-400" />
                {t('client.newRequest.location')}
              </label>
              <input
                type="text"
                value={form.customer_location}
                onChange={e => setForm({ ...form, customer_location: e.target.value })}
                placeholder={t('client.newRequest.locationPlaceholder')}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900"
              />
            </div>
          </>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-blue-700 text-white font-medium rounded-xl hover:bg-blue-800 transition disabled:opacity-40 active:scale-[0.98]"
        >
          {submitting ? (
            <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
          ) : (
            <>
              <Send className="w-4 h-4" />
              {t('client.newRequest.submit')}
            </>
          )}
        </button>
      </form>
    </div>
  )
}
