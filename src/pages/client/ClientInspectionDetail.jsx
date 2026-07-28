import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { useClient } from '../../contexts/ClientAuthContext'
import { supabase, formatTZS, formatDate } from '../../lib/supabase'
import { notifyStaff } from '../../lib/notifications'
import PaymentChannels from '../../components/common/PaymentChannels'
import {
  ArrowLeft, CheckCircle2, XCircle, AlertTriangle, ClipboardCheck,
  MessageCircle, Send, Lock, Wrench, CreditCard, Clock,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { DashboardSkeleton } from '../../components/common/Skeleton'

// The customer reads their inspection report and either accepts the quoted work
// or opens a negotiation over the price.
//
// Everything here runs as the `anon` role. The customer may only flip
// customer_approved (migration 020's guard trigger restores every other column)
// and INSERT a negotiation pinned to sender_type = 'customer'. Prices are never
// writable from this screen.
export default function ClientInspectionDetail() {
  const { id } = useParams()
  const { t } = useLanguage()
  const { customer } = useClient()

  const [inspection, setInspection] = useState(null)
  const [items, setItems] = useState([])
  const [jobCard, setJobCard] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [bargainOpen, setBargainOpen] = useState(false)
  const [bargainText, setBargainText] = useState('')
  const [bargainAmount, setBargainAmount] = useState('')
  const [sending, setSending] = useState(false)

  const [payments, setPayments] = useState([])
  const [payOpen, setPayOpen] = useState(false)
  const [payForm, setPayForm] = useState({ amount: '', method: 'mobile_money', reference: '' })
  const [declaring, setDeclaring] = useState(false)

  useEffect(() => {
    if (customer?.id) fetchAll()
  }, [id, customer?.id])

  const fetchAll = async () => {
    try {
      const { data: insp, error } = await supabase
        .from('inspections')
        .select('*, vehicles(registration_number, make, model, year)')
        .eq('id', id)
        .eq('customer_id', customer.id)   // never render someone else's report
        .single()
      if (error || !insp) { setNotFound(true); return }
      setInspection(insp)

      const [itemsRes, jobRes, msgRes, payRes] = await Promise.all([
        supabase.from('inspection_items').select('*')
          .eq('inspection_id', id).order('sort_order'),
        supabase.from('job_cards').select('id, job_number, status')
          .eq('inspection_id', id).order('created_at', { ascending: false }).limit(1),
        supabase.from('inspection_negotiations').select('*')
          .eq('inspection_id', id).order('created_at'),
        supabase.from('inspection_payments')
          .select('id, amount, method, reference, status, declared_by, created_at')
          .eq('inspection_id', id).order('created_at', { ascending: false }),
      ])
      setItems(itemsRes.data || [])
      setJobCard(jobRes.data?.[0] || null)
      setMessages(msgRes.data || [])
      setPayments(payRes.data || [])
    } catch (err) {
      console.error('Inspection detail error:', err)
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }

  // Once the garage has started work the quote is settled — let the customer
  // read the report and the thread, but not silently un-approve a repair that
  // is already underway.
  const workStarted = jobCard && !['pre_job_card', 'pending_approval', 'cancelled'].includes(jobCard.status)
  const findingsFinal = inspection?.status === 'completed'
  const canRespond = items.length > 0 && findingsFinal && !workStarted

  const setApproval = async (itemId, approved) => {
    const previous = items
    // Optimistic: the toggle should feel instant on a phone.
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, customer_approved: approved } : i))
    try {
      const { data, error } = await supabase
        .from('inspection_items')
        .update({ customer_approved: approved })
        .eq('id', itemId)
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) throw new Error('blocked')
      toast.success(approved ? t('client.inspections.approvedItem') : t('client.inspections.declinedItem'))
    } catch (err) {
      setItems(previous)
      toast.error(t('client.inspections.updateFailed'))
    }
  }

  const approveAll = async () => {
    const previous = items
    setItems(prev => prev.map(i => ({ ...i, customer_approved: true })))
    try {
      const { data, error } = await supabase
        .from('inspection_items')
        .update({ customer_approved: true })
        .eq('inspection_id', id)
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) throw new Error('blocked')
      toast.success(t('client.inspections.allApproved'))
      notifyStaff({
        type: 'inspection_decision',
        title: t('client.inspections.notifyApprovedTitle'),
        body: `${customer.full_name} — ${inspection.inspection_number}`,
        inspectionId: id,
        customerId: customer.id,
      })
    } catch (err) {
      setItems(previous)
      toast.error(t('client.inspections.updateFailed'))
    }
  }

  // Tell the garage the customer has finished going through the list.
  const submitDecision = async () => {
    const approved = items.filter(i => i.customer_approved === true).length
    const declined = items.filter(i => i.customer_approved === false).length
    notifyStaff({
      type: 'inspection_decision',
      title: t('client.inspections.notifyDecisionTitle'),
      body: `${customer.full_name} — ${inspection.inspection_number}: ${approved} approved, ${declined} declined`,
      inspectionId: id,
      customerId: customer.id,
    })
    toast.success(t('client.inspections.decisionSent'))
  }

  const sendBargain = async (e) => {
    e.preventDefault()
    const message = bargainText.trim()
    if (!message || sending) return
    setSending(true)
    try {
      const amount = bargainAmount === '' ? null : Number(bargainAmount)
      if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
        toast.error(t('client.inspections.badAmount'))
        setSending(false)
        return
      }
      const { data, error } = await supabase
        .from('inspection_negotiations')
        .insert({
          inspection_id: id,
          customer_id: customer.id,
          sender_type: 'customer',
          message,
          proposed_amount: amount,
        })
        .select()
      if (error) throw error

      setMessages(prev => [...prev, ...(data || [])])
      setBargainText('')
      setBargainAmount('')
      toast.success(t('client.inspections.bargainSent'))

      notifyStaff({
        type: 'inspection_bargain',
        title: t('client.inspections.notifyBargainTitle'),
        body: `${customer.full_name} — ${inspection.inspection_number}${amount !== null ? `: ${formatTZS(amount)}` : ''}`,
        inspectionId: id,
        customerId: customer.id,
      })
    } catch (err) {
      toast.error(t('client.inspections.bargainFailed'))
    } finally {
      setSending(false)
    }
  }

  // The customer DECLARES a payment; they never mark the inspection paid.
  // Staff confirm it in the admin screen, and only that confirmation writes
  // inspections.payment_status. Same rule as invoices (migrations 015 / 021).
  const declarePayment = async (e) => {
    e.preventDefault()
    if (declaring) return
    const amount = Number(payForm.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t('client.inspections.enterAmount'))
      return
    }
    setDeclaring(true)
    try {
      const { data, error } = await supabase
        .from('inspection_payments')
        .insert({
          inspection_id: id,
          customer_id: customer.id,
          amount,
          method: payForm.method,
          reference: payForm.reference || null,
          declared_by: 'customer',
          status: 'pending',
        })
        .select()
      if (error) throw error

      setPayments(prev => [...(data || []), ...prev])
      setPayOpen(false)
      setPayForm({ amount: '', method: 'mobile_money', reference: '' })
      toast.success(t('client.inspections.paymentDeclared'))

      notifyStaff({
        type: 'inspection_payment_declared',
        title: t('client.inspections.notifyPaymentTitle'),
        body: `${customer.full_name} — ${inspection.inspection_number} · ${formatTZS(amount)}`,
        inspectionId: id,
        customerId: customer.id,
      })
    } catch (err) {
      toast.error(t('client.inspections.paymentFailed'))
    } finally {
      setDeclaring(false)
    }
  }

  const severityStyles = {
    low: 'bg-gray-100 text-gray-600',
    medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-orange-100 text-orange-700',
    critical: 'bg-red-100 text-red-700',
  }

  if (loading) return <DashboardSkeleton />

  if (notFound) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <XCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 text-sm mb-4">{t('client.inspections.notFound')}</p>
        <Link to="/client/inspections" className="text-blue-600 text-sm font-medium">
          {t('client.inspections.backToList')}
        </Link>
      </div>
    )
  }

  const totalEstimated = items.reduce((s, i) => s + Number(i.estimated_cost || 0), 0)
  const approvedItems = items.filter(i => i.customer_approved === true)
  const approvedTotal = approvedItems.reduce((s, i) => s + Number(i.estimated_cost || 0), 0)
  const undecided = items.filter(i => i.customer_approved === null).length

  const fee = Number(inspection.payment_amount) || 0
  const feePaid = inspection.payment_status === 'paid'
  const awaitingConfirmation = payments.find(p => p.status === 'pending')
  // Nothing to pay if there's no fee, staff already marked it paid, or the
  // customer has a declaration sitting with staff. One open declaration at a
  // time keeps the ledger readable and stops double-declaring.
  const canDeclarePayment = fee > 0 && !feePaid && !awaitingConfirmation

  return (
    <div className="space-y-4">
      <Link to="/client/inspections" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> {t('client.inspections.backToList')}
      </Link>

      {/* Report header */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <ClipboardCheck className="w-6 h-6 text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-gray-900">{inspection.inspection_number}</h1>
            <p className="text-sm text-gray-600">
              {inspection.vehicles?.registration_number} — {inspection.vehicles?.make} {inspection.vehicles?.model}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{formatDate(inspection.created_at)}</p>
          </div>
          <span className="text-xs px-2 py-1 rounded-full font-medium bg-gray-100 text-gray-600 flex-shrink-0">
            {t(`inspection.statuses.${inspection.status}`)}
          </span>
        </div>

        {inspection.description && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-1">{t('client.inspections.yourComplaint')}</p>
            <p className="text-sm text-gray-800">{inspection.description}</p>
          </div>
        )}
      </div>

      {/* Inspection fee — the customer pays the garage for the diagnosis */}
      {fee > 0 && (
        <div className={`rounded-xl border overflow-hidden ${
          feePaid ? 'bg-white border-gray-200'
            : awaitingConfirmation ? 'bg-amber-50 border-amber-200'
            : 'bg-white border-blue-300'
        }`}>
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-gray-500">{t('client.inspections.inspectionFee')}</p>
                <p className="text-2xl font-bold text-gray-900 mt-0.5">{formatTZS(fee)}</p>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${
                feePaid ? 'bg-green-100 text-green-700'
                  : awaitingConfirmation ? 'bg-amber-100 text-amber-700'
                  : 'bg-red-100 text-red-700'
              }`}>
                {feePaid ? t('client.inspections.feePaid')
                  : awaitingConfirmation ? t('client.inspections.feeChecking')
                  : t('client.inspections.feeUnpaid')}
              </span>
            </div>

            {awaitingConfirmation && (
              <div className="flex items-start gap-2 mt-3 pt-3 border-t border-amber-200">
                <Clock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  {t('client.inspections.feeCheckingHint').replace('{amount}', formatTZS(awaitingConfirmation.amount))}
                </p>
              </div>
            )}

            {canDeclarePayment && !payOpen && (
              <button
                onClick={() => { setPayForm(f => ({ ...f, amount: String(fee) })); setPayOpen(true) }}
                className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-3 bg-blue-700 text-white font-medium rounded-xl hover:bg-blue-800 transition active:scale-[0.98] cursor-pointer"
              >
                <CreditCard className="w-4 h-4" />
                {t('client.inspections.payFee')}
              </button>
            )}

            {payOpen && (
              <form onSubmit={declarePayment} className="mt-3 pt-3 border-t border-gray-200 space-y-3">
                <p className="text-xs text-gray-500">{t('client.inspections.payHint')}</p>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    {t('client.inspections.amountPaid')}
                  </label>
                  <input
                    type="number" min="0" step="any" inputMode="decimal"
                    value={payForm.amount}
                    onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  />
                </div>
                <PaymentChannels />
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    {t('client.inspections.payMethod')}
                  </label>
                  <select
                    value={payForm.method}
                    onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm cursor-pointer"
                  >
                    <option value="mobile_money">{t('paymentMethods.mobile_money')}</option>
                    <option value="cash">{t('paymentMethods.cash')}</option>
                    <option value="bank_transfer">{t('paymentMethods.bank_transfer')}</option>
                    <option value="cheque">{t('paymentMethods.cheque')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    {t('client.inspections.payReference')}{' '}
                    <span className="text-gray-400">({t('client.inspections.optional')})</span>
                  </label>
                  <input
                    type="text"
                    value={payForm.reference}
                    onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })}
                    placeholder={t('client.inspections.payReferencePlaceholder')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={declaring}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-700 text-white font-medium rounded-xl hover:bg-blue-800 transition active:scale-[0.98] disabled:opacity-40 text-sm cursor-pointer disabled:cursor-not-allowed"
                  >
                    <CreditCard className="w-4 h-4" />
                    {declaring ? t('client.inspections.sending') : t('client.inspections.confirmPaid')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayOpen(false)}
                    className="px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition text-sm cursor-pointer"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Payment history */}
          {payments.length > 0 && (
            <div className="border-t border-gray-200 divide-y divide-gray-100 bg-gray-50/60">
              {payments.map((p) => (
                <div key={p.id} className="px-4 py-2.5 flex items-center justify-between gap-2 text-xs">
                  {/* truncate, not just min-w-0: these are inline spans on one
                      line, so a long M-Pesa reference would otherwise spill
                      across the date and status badge on a phone. */}
                  <div className="min-w-0 truncate">
                    <span className="font-medium text-gray-900">{formatTZS(p.amount)}</span>
                    <span className="text-gray-400"> · {t(`paymentMethods.${p.method}`)}</span>
                    {p.reference && <span className="text-gray-400"> · {p.reference}</span>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-gray-400">{formatDate(p.created_at)}</span>
                    <span className={`px-2 py-0.5 rounded-full font-medium ${
                      p.status === 'confirmed' ? 'bg-green-100 text-green-700'
                        : p.status === 'rejected' ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {t(`client.inspections.payStatus.${p.status}`)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Why the buttons aren't there yet */}
      {!findingsFinal && (
        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl">
          <Wrench className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700">{t('client.inspections.notFinalYet')}</p>
        </div>
      )}
      {workStarted && (
        <div className="flex items-start gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl">
          <Lock className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-600">
            {t('client.inspections.workStarted')}
            {jobCard?.job_number && ` (${jobCard.job_number})`}
          </p>
        </div>
      )}

      {/* Findings */}
      {items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">{t('client.inspections.noFindings')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold text-gray-900 text-sm">{t('client.inspections.findings')}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {items.length} {t('client.inspections.issuesFound')}
              </p>
            </div>
            {canRespond && (
              <button
                onClick={approveAll}
                className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 active:scale-95 transition cursor-pointer"
              >
                {t('client.inspections.approveAll')}
              </button>
            )}
          </div>

          <div className="divide-y divide-gray-100">
            {items.map((item, idx) => (
              <div
                key={item.id}
                className={`p-4 ${
                  item.customer_approved === true ? 'bg-green-50/40' :
                  item.customer_approved === false ? 'bg-red-50/40' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-bold text-gray-400">#{idx + 1}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${severityStyles[item.severity] || severityStyles.medium}`}>
                        {(item.severity === 'high' || item.severity === 'critical') && (
                          <AlertTriangle className="w-3 h-3 inline mr-0.5 -mt-0.5" />
                        )}
                        {t(`inspection.severities.${item.severity || 'medium'}`)}
                      </span>
                      {item.customer_approved === true && (
                        <span className="text-xs text-green-600 font-medium">{t('client.inspections.approvedItem')}</span>
                      )}
                      {item.customer_approved === false && (
                        <span className="text-xs text-red-600 font-medium">{t('client.inspections.declinedItem')}</span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-gray-900">{item.problem_description}</p>
                    {item.recommended_action && (
                      <p className="text-xs text-blue-600 mt-1">
                        {t('client.inspections.recommended')}: {item.recommended_action}
                      </p>
                    )}
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-gray-900 mb-2">{formatTZS(item.estimated_cost)}</p>
                    {canRespond && (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setApproval(item.id, true)}
                          aria-label={t('client.inspections.approve')}
                          className={`p-2 rounded-lg transition active:scale-95 cursor-pointer ${
                            item.customer_approved === true
                              ? 'bg-green-600 text-white shadow-sm'
                              : 'bg-gray-100 text-gray-400 hover:bg-green-50 hover:text-green-600'
                          }`}
                        >
                          <CheckCircle2 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => setApproval(item.id, false)}
                          aria-label={t('client.inspections.decline')}
                          className={`p-2 rounded-lg transition active:scale-95 cursor-pointer ${
                            item.customer_approved === false
                              ? 'bg-red-600 text-white shadow-sm'
                              : 'bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-red-600'
                          }`}
                        >
                          <XCircle className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="p-4 bg-gray-50 border-t border-gray-200 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{t('client.inspections.totalEstimated')}</span>
              <span className="font-medium">{formatTZS(totalEstimated)}</span>
            </div>
            {approvedItems.length > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-green-700 font-medium">
                  {t('client.inspections.approvedTotal')} ({approvedItems.length})
                </span>
                <span className="font-bold text-green-700">{formatTZS(approvedTotal)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirm the decision */}
      {canRespond && (
        <button
          onClick={submitDecision}
          disabled={undecided === items.length}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-700 text-white font-medium rounded-xl hover:bg-blue-800 transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 cursor-pointer disabled:cursor-not-allowed"
        >
          <CheckCircle2 className="w-4 h-4" />
          {undecided > 0
            ? t('client.inspections.sendDecisionPartial').replace('{count}', undecided)
            : t('client.inspections.sendDecision')}
        </button>
      )}

      {/* Bargaining */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-gray-500" />
          <h2 className="font-semibold text-gray-900 text-sm">{t('client.inspections.bargainTitle')}</h2>
        </div>

        {messages.length > 0 && (
          <div className="divide-y divide-gray-100">
            {messages.map((m) => (
              <div key={m.id} className={`p-4 ${m.sender_type === 'staff' ? 'bg-blue-50/40' : ''}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className={`text-xs font-semibold ${m.sender_type === 'staff' ? 'text-blue-700' : 'text-gray-700'}`}>
                    {m.sender_type === 'staff' ? t('client.inspections.fromGarage') : t('client.inspections.fromYou')}
                  </span>
                  <span className="text-[10px] text-gray-400">{formatDate(m.created_at)}</span>
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{m.message}</p>
                {m.proposed_amount !== null && m.proposed_amount !== undefined && (
                  <p className="text-xs font-semibold text-gray-900 mt-1.5">
                    {t('client.inspections.proposed')}: {formatTZS(m.proposed_amount)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="p-4">
          {!bargainOpen ? (
            <button
              onClick={() => setBargainOpen(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-blue-300 text-blue-700 font-medium rounded-xl hover:bg-blue-50 transition text-sm cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              {messages.length === 0 ? t('client.inspections.startBargain') : t('client.inspections.replyBargain')}
            </button>
          ) : (
            <form onSubmit={sendBargain} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  {t('client.inspections.bargainMessage')}
                </label>
                <textarea
                  value={bargainText}
                  onChange={(e) => setBargainText(e.target.value)}
                  rows={3}
                  placeholder={t('client.inspections.bargainPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  {t('client.inspections.proposedAmount')}{' '}
                  <span className="text-gray-400">({t('client.inspections.optional')})</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={bargainAmount}
                  onChange={(e) => setBargainAmount(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={sending || !bargainText.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-700 text-white font-medium rounded-xl hover:bg-blue-800 transition active:scale-[0.98] disabled:opacity-40 text-sm cursor-pointer disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                  {sending ? t('client.inspections.sending') : t('client.inspections.send')}
                </button>
                <button
                  type="button"
                  onClick={() => { setBargainOpen(false); setBargainText(''); setBargainAmount('') }}
                  className="px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition text-sm cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          )}
          <p className="text-xs text-gray-400 mt-3 text-center">{t('client.inspections.bargainHint')}</p>
        </div>
      </div>
    </div>
  )
}
