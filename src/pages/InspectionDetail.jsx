import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase, formatTZS, formatDate } from '../lib/supabase'
import { sendSMS, smsTemplates } from '../lib/sms'
import {
  ArrowLeft, Plus, Trash2, CreditCard, Play, CheckCircle2,
  AlertTriangle, X, ClipboardList, FileText, Share2, Copy, Wrench, Send
} from 'lucide-react'
import toast from 'react-hot-toast'

export default function InspectionDetail() {
  const { id } = useParams()
  const { t } = useLanguage()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [inspection, setInspection] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddProblem, setShowAddProblem] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [problemForm, setProblemForm] = useState({
    problem_description: '', severity: 'medium', recommended_action: '', estimated_cost: '', notes: ''
  })
  const [paymentForm, setPaymentForm] = useState({ payment_method: 'cash', payment_reference: '' })
  const [situation, setSituation] = useState('')
  const [savingSituation, setSavingSituation] = useState(false)

  useEffect(() => { fetchInspection() }, [id])

  const fetchInspection = async () => {
    try {
      const { data, error } = await supabase
        .from('inspections')
        .select(`*, customers(full_name, phone, email, company_name), vehicles(registration_number, make, model, year)`)
        .eq('id', id).single()
      if (error) throw error
      setInspection(data)
      setSituation(data.repair_summary || '')

      const { data: problemItems } = await supabase
        .from('inspection_items')
        .select('*')
        .eq('inspection_id', id)
        .order('sort_order')
      setItems(problemItems || [])
    } catch (err) {
      toast.error(t('inspection.loadError'))
      navigate('/admin/inspections')
    } finally {
      setLoading(false)
    }
  }

  // Confirm payment
  const confirmPayment = async (e) => {
    e.preventDefault()
    try {
      const { error } = await supabase.from('inspections').update({
        payment_status: 'paid',
        payment_method: paymentForm.payment_method,
        payment_reference: paymentForm.payment_reference || null,
        status: 'paid',
        date_paid: new Date().toISOString(),
      }).eq('id', id)
      if (error) throw error
      toast.success(t('inspection.paymentConfirmed'))
      setShowPayment(false)
      fetchInspection()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // Start inspection
  const startInspection = async () => {
    try {
      const { error } = await supabase.from('inspections').update({
        status: 'in_progress',
        date_started: new Date().toISOString(),
        inspected_by: profile?.full_name || 'Unknown',
      }).eq('id', id)
      if (error) throw error
      toast.success(t('inspection.inspectionStarted'))
      fetchInspection()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // Add problem
  const addProblem = async (e) => {
    e.preventDefault()
    try {
      const { error } = await supabase.from('inspection_items').insert({
        inspection_id: id,
        problem_description: problemForm.problem_description,
        severity: problemForm.severity,
        recommended_action: problemForm.recommended_action || null,
        estimated_cost: problemForm.estimated_cost ? parseFloat(problemForm.estimated_cost) : 0,
        notes: problemForm.notes || null,
        sort_order: items.length,
      })
      if (error) throw error
      toast.success(t('inspection.problemRecorded'))
      setShowAddProblem(false)
      setProblemForm({ problem_description: '', severity: 'medium', recommended_action: '', estimated_cost: '', notes: '' })
      fetchInspection()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // Delete problem
  const deleteProblem = async (itemId) => {
    try {
      await supabase.from('inspection_items').delete().eq('id', itemId)
      toast.success(t('inspection.problemRemoved'))
      fetchInspection()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // Set a single item's repair status (pending / in_progress / done).
  // Optimistic update so the mechanic's tick feels instant.
  const setItemRepairStatus = async (item, status) => {
    const done_at = status === 'done' ? new Date().toISOString() : null
    setItems(prev => prev.map(i => i.id === item.id
      ? { ...i, repair_status: status, repair_done_at: done_at } : i))
    try {
      const { error } = await supabase.from('inspection_items')
        .update({ repair_status: status, repair_done_at: done_at })
        .eq('id', item.id)
      if (error) throw error
    } catch (err) {
      toast.error(err.message)
      fetchInspection()
    }
  }

  // Post the mechanic's "current car situation" note for the customer to see.
  const saveSituation = async () => {
    setSavingSituation(true)
    try {
      const { error } = await supabase.from('inspections').update({
        repair_summary: situation.trim() || null,
        repair_updated_at: new Date().toISOString(),
      }).eq('id', id)
      if (error) throw error
      toast.success(t('inspection.situationUpdated'))
      fetchInspection()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingSituation(false)
    }
  }

  // Complete inspection & auto-create Pre-Job Card
  const completeInspection = async () => {
    if (items.length === 0) {
      toast.error(t('inspection.addProblemFirst'))
      return
    }
    try {
      // 1. Mark inspection as completed
      const { error: inspError } = await supabase.from('inspections').update({
        status: 'completed',
        date_completed: new Date().toISOString(),
      }).eq('id', id)
      if (inspError) throw inspError

      // 2. Auto-create Pre-Job Card
      const { data: jobCard, error: jobError } = await supabase.from('job_cards').insert({
        customer_id: inspection.customer_id,
        vehicle_id: inspection.vehicle_id,
        inspection_id: id,
        status: 'pre_job_card',
        section: 'service',
        priority: items.some(i => i.severity === 'critical') ? 'urgent' :
                  items.some(i => i.severity === 'high') ? 'high' : 'normal',
        description: `Inspection ${inspection.inspection_number}: ${inspection.description}`,
        diagnosis: items.map((item, idx) => `${idx + 1}. [${item.severity.toUpperCase()}] ${item.problem_description}${item.recommended_action ? ' - ' + item.recommended_action : ''}`).join('\n'),
        mileage_in: inspection.mileage_in,
        fuel_level: inspection.fuel_level,
      }).select().single()
      if (jobError) throw jobError

      // 3. Carry the inspection fee onto the job card as a billable line.
      // Without this the fee stays stranded on the inspection record and never
      // reaches the job card total, the invoice, or the customer's portal.
      const inspectionFee = Number(inspection.payment_amount) || 0
      if (inspectionFee > 0) {
        const { error: feeError } = await supabase.from('job_card_items').insert({
          job_card_id: jobCard.id,
          item_type: 'additional',
          description: `${t('inspection.fee')} — ${inspection.inspection_number}`,
          quantity: 1,
          cost_price: 0,
          selling_price: inspectionFee,
          is_additional: false,
          requires_approval: false,
          approval_status: 'approved',
        })
        // The fee line is important but must not strand a created job card.
        if (feeError) toast.error(feeError.message)
      }

      // Notify the customer that their inspection is done (non-blocking).
      sendSMS({
        to: inspection.customers?.phone,
        message: smsTemplates.inspection_complete(inspection.customers?.full_name, inspection.vehicles?.registration_number),
        event: 'inspection_complete',
        customerId: inspection.customer_id,
      })

      toast.success(t('inspection.inspectionCompleted'))
      navigate(`/admin/job-cards/${jobCard.id}`)
    } catch (err) {
      toast.error(err.message)
    }
  }

  const severityColors = {
    low: 'bg-gray-100 text-gray-600',
    medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-orange-100 text-orange-700',
    critical: 'bg-red-100 text-red-700',
  }

  const severityIcons = {
    low: null,
    medium: <AlertTriangle className="w-3.5 h-3.5" />,
    high: <AlertTriangle className="w-3.5 h-3.5" />,
    critical: <AlertTriangle className="w-3.5 h-3.5" />,
  }

  const totalEstimated = items.reduce((sum, i) => sum + Number(i.estimated_cost || 0), 0)

  if (loading) return <div className="flex justify-center p-8"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div></div>
  if (!inspection) return null

  const isPending = inspection.status === 'pending_payment'
  const isPaid = inspection.status === 'paid'
  const isInProgress = inspection.status === 'in_progress'
  const isCompleted = inspection.status === 'completed'

  const repairDone = items.filter(i => i.repair_status === 'done').length
  const repairPct = items.length ? Math.round((repairDone / items.length) * 100) : 0

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/admin/inspections')} className="p-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{inspection.inspection_number}</h1>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              isPending ? 'bg-red-100 text-red-700' :
              isPaid ? 'bg-blue-100 text-blue-700' :
              isInProgress ? 'bg-yellow-100 text-yellow-700' :
              'bg-green-100 text-green-700'
            }`}>
              {t(`inspection.statuses.${inspection.status}`)}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{formatDate(inspection.created_at)}</p>
        </div>

        {/* Action buttons based on status */}
        <div className="flex gap-2 flex-wrap">
          {/* Share with customer button */}
          {(isCompleted || isInProgress) && (
            <button onClick={() => {
              const url = `${window.location.origin}/c/${id}`
              navigator.clipboard.writeText(url)
              toast.success(t('inspection.linkCopied'))
            }}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium">
              <Share2 className="w-4 h-4" /> {t('inspection.shareLink')}
            </button>
          )}
          {isPending && (
            <button onClick={() => setShowPayment(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
              <CreditCard className="w-4 h-4" /> {t('inspection.confirmPayment')}
            </button>
          )}
          {isPaid && (
            <button onClick={startInspection}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 text-sm font-medium">
              <Play className="w-4 h-4" /> {t('inspection.startInspection')}
            </button>
          )}
          {isInProgress && (
            <button onClick={completeInspection}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
              <CheckCircle2 className="w-4 h-4" /> {t('inspection.completeInspection')}
            </button>
          )}
        </div>
      </div>

      {/* Step Progress */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          {[
            { label: t('inspection.stepSubmit'), done: true },
            { label: t('inspection.stepPayment'), done: isPaid || isInProgress || isCompleted },
            { label: t('inspection.stepInspection'), done: isInProgress || isCompleted },
            { label: t('inspection.stepPreJobCard'), done: isCompleted },
          ].map((step, idx) => (
            <div key={idx} className="flex items-center gap-2 flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                step.done ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
              }`}>{idx + 1}</div>
              <span className={`text-sm font-medium ${step.done ? 'text-green-700' : 'text-gray-400'}`}>{step.label}</span>
              {idx < 3 && <div className={`flex-1 h-0.5 mx-2 ${step.done ? 'bg-green-400' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-3">{t('inspection.customer')}</h3>
          <div className="space-y-2 text-sm">
            <p><span className="text-gray-500">{t('customers.name')}:</span> <span className="font-medium">{inspection.customers?.full_name}</span></p>
            <p><span className="text-gray-500">{t('customers.phone')}:</span> {inspection.customers?.phone}</p>
            {inspection.customers?.company_name && <p><span className="text-gray-500">{t('customers.company')}:</span> {inspection.customers?.company_name}</p>}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-3">{t('inspection.vehicle')}</h3>
          <div className="space-y-2 text-sm">
            <p><span className="text-gray-500">{t('vehicles.regNumber')}:</span> <span className="font-bold">{inspection.vehicles?.registration_number}</span></p>
            <p><span className="text-gray-500">{t('vehicles.make')}:</span> {inspection.vehicles?.make} {inspection.vehicles?.model}</p>
            <p><span className="text-gray-500">{t('inspection.mileageIn')}:</span> {inspection.mileage_in?.toLocaleString() || '-'} km</p>
            <p><span className="text-gray-500">{t('inspection.fuelLevel')}:</span> {inspection.fuel_level || '-'}</p>
          </div>
        </div>
      </div>

      {/* Payment Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">{t('inspection.paymentDetails')}</h3>
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
            inspection.payment_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {inspection.payment_status === 'paid' ? t('inspection.statuses.paid') : t('inspection.pendingPayment')}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-gray-500">{t('inspection.paymentAmount')}</p>
            <p className="font-bold text-lg">{formatTZS(inspection.payment_amount)}</p>
          </div>
          {inspection.payment_method && (
            <div>
              <p className="text-gray-500">{t('inspection.paymentMethod')}</p>
              <p className="font-medium capitalize">{inspection.payment_method}</p>
            </div>
          )}
          {inspection.payment_reference && (
            <div>
              <p className="text-gray-500">{t('inspection.paymentRef')}</p>
              <p className="font-medium">{inspection.payment_reference}</p>
            </div>
          )}
          {inspection.date_paid && (
            <div>
              <p className="text-gray-500">{t('inspection.datePaid')}</p>
              <p className="font-medium">{formatDate(inspection.date_paid)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Customer Complaint */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-2">{t('inspection.description')}</h3>
        <p className="text-sm text-gray-700">{inspection.description}</p>
      </div>

      {/* Problems Found */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900">{t('inspection.problems')}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{items.length} {t('inspection.problemsFound')}</p>
          </div>
          {isInProgress && (
            <button onClick={() => setShowAddProblem(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium">
              <Plus className="w-4 h-4" /> {t('inspection.addProblem')}
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <ClipboardList className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>{isInProgress ? t('inspection.startAddingProblems') : t('inspection.noProblemsYet')}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map((item, idx) => (
              <div key={item.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-gray-500">#{idx + 1}</span>
                      <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${severityColors[item.severity]}`}>
                        {severityIcons[item.severity]}
                        {t(`inspection.severities.${item.severity}`)}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-900">{item.problem_description}</p>
                    {item.recommended_action && (
                      <p className="text-sm text-blue-600 mt-1">{t('inspection.recommended')}: {item.recommended_action}</p>
                    )}
                    {item.notes && <p className="text-xs text-gray-500 mt-1">{item.notes}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatTZS(item.estimated_cost)}</p>
                    {isInProgress && (
                      <button onClick={() => deleteProblem(item.id)} className="p-1 mt-1 rounded hover:bg-red-50">
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Repair progress — mechanic ticks each item; customer sees it live */}
                {(isInProgress || isCompleted) && (
                  <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                    <Wrench className="w-3.5 h-3.5 text-gray-400" />
                    {['pending', 'in_progress', 'done'].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setItemRepairStatus(item, s)}
                        className={`text-xs px-2.5 py-1 rounded-full font-medium transition ${
                          (item.repair_status || 'pending') === s
                            ? s === 'done' ? 'bg-green-600 text-white'
                              : s === 'in_progress' ? 'bg-yellow-500 text-white'
                              : 'bg-gray-500 text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {t(`inspection.repairStatuses.${s}`)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="p-4 bg-gray-50 space-y-3">
              {(isInProgress || isCompleted) && (
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-sm font-medium text-gray-600">{t('inspection.repairSection')}</span>
                    <span className="text-sm font-bold text-green-700">{repairDone}/{items.length} {t('inspection.partsFixed')}</span>
                  </div>
                  <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 transition-all" style={{ width: `${repairPct}%` }} />
                  </div>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="font-semibold text-gray-700">{t('inspection.totalEstimatedCost')}</span>
                <span className="text-lg font-bold">{formatTZS(totalEstimated)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Current Car Situation — mechanic posts an update the customer sees live */}
      {items.length > 0 && (isInProgress || isCompleted) && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-1">
            <Wrench className="w-4 h-4 text-blue-600" />
            <h3 className="font-semibold text-gray-900">{t('inspection.currentSituation')}</h3>
          </div>
          <p className="text-xs text-gray-500 mb-3">{t('inspection.repairHint')}</p>
          <textarea
            value={situation}
            onChange={(e) => setSituation(e.target.value)}
            rows={3}
            placeholder={t('inspection.situationPlaceholder')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
          />
          <div className="flex items-center justify-between mt-3 gap-3">
            <span className="text-xs text-gray-400">
              {inspection.repair_updated_at
                ? `${t('inspection.situationLastUpdated')}: ${formatDate(inspection.repair_updated_at)}`
                : ''}
            </span>
            <button
              onClick={saveSituation}
              disabled={savingSituation}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 text-sm font-medium disabled:opacity-40 flex-shrink-0"
            >
              <Send className="w-4 h-4" /> {t('inspection.updateSituation')}
            </button>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold">{t('inspection.confirmPayment')}</h2>
              <button onClick={() => setShowPayment(false)} className="p-1 rounded hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={confirmPayment} className="p-5 space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg text-center">
                <p className="text-sm text-gray-600">{t('inspection.amount')}</p>
                <p className="text-2xl font-bold text-blue-700">{formatTZS(inspection.payment_amount)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('inspection.paymentMethod')} *</label>
                <select value={paymentForm.payment_method} onChange={e => setPaymentForm({...paymentForm, payment_method: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="cash">{t('paymentMethods.cash')}</option>
                  <option value="mobile_money">{t('paymentMethods.mobile_money')}</option>
                  <option value="bank_transfer">{t('paymentMethods.bank_transfer')}</option>
                  <option value="cheque">{t('paymentMethods.cheque')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('inspection.paymentRef')}</label>
                <input type="text" value={paymentForm.payment_reference}
                  onChange={e => setPaymentForm({...paymentForm, payment_reference: e.target.value})}
                  placeholder="Transaction ID or reference"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition">
                  {t('inspection.confirmPayment')}
                </button>
                <button type="button" onClick={() => setShowPayment(false)}
                  className="px-6 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition">
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Problem Modal */}
      {showAddProblem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold">{t('inspection.addProblem')}</h2>
              <button onClick={() => setShowAddProblem(false)} className="p-1 rounded hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={addProblem} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('inspection.problemDescription')} *</label>
                <textarea value={problemForm.problem_description}
                  onChange={e => setProblemForm({...problemForm, problem_description: e.target.value})}
                  required rows={3} placeholder="Describe the problem found..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('inspection.severity')}</label>
                  <select value={problemForm.severity}
                    onChange={e => setProblemForm({...problemForm, severity: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="low">{t('inspection.severities.low')}</option>
                    <option value="medium">{t('inspection.severities.medium')}</option>
                    <option value="high">{t('inspection.severities.high')}</option>
                    <option value="critical">{t('inspection.severities.critical')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('inspection.estimatedCost')} (TZS)</label>
                  <input type="number" value={problemForm.estimated_cost}
                    onChange={e => setProblemForm({...problemForm, estimated_cost: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('inspection.recommendedAction')}</label>
                <input type="text" value={problemForm.recommended_action}
                  onChange={e => setProblemForm({...problemForm, recommended_action: e.target.value})}
                  placeholder="e.g. Replace brake pads, repair wiring..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('inspection.notes')}</label>
                <input type="text" value={problemForm.notes}
                  onChange={e => setProblemForm({...problemForm, notes: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition">
                  {t('inspection.addProblem')}
                </button>
                <button type="button" onClick={() => setShowAddProblem(false)}
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
