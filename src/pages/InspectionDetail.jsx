import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase, formatTZS, formatDate } from '../lib/supabase'
import { sendSMS, smsTemplates } from '../lib/sms'
import {
  ArrowLeft, Plus, Trash2, CreditCard, Play, CheckCircle2,
  AlertTriangle, X, ClipboardList, FileText, Share2, Copy, Wrench, Send,
  MessageCircle
} from 'lucide-react'
import toast from 'react-hot-toast'

export default function InspectionDetail() {
  const { id } = useParams()
  const { t } = useLanguage()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [inspection, setInspection] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddProblem, setShowAddProblem] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [problemForm, setProblemForm] = useState({
    problem_description: '', severity: 'medium', recommended_action: '', estimated_cost: '', notes: ''
  })
  const [paymentForm, setPaymentForm] = useState({ payment_method: 'cash', payment_reference: '' })
  const [showFee, setShowFee] = useState(false)
  const [feeAmount, setFeeAmount] = useState('')
  const [savingFee, setSavingFee] = useState(false)
  const [declaredPayments, setDeclaredPayments] = useState([])
  const [situation, setSituation] = useState('')
  const [savingSituation, setSavingSituation] = useState(false)
  const [messages, setMessages] = useState([])
  const [reply, setReply] = useState('')
  const [replyAmount, setReplyAmount] = useState('')
  const [amountTouched, setAmountTouched] = useState(false)
  const [sendingReply, setSendingReply] = useState(false)

  useEffect(() => { fetchInspection() }, [id])

  // Arriving from the bell's "customer wants to negotiate" alert. location.key
  // is fresh on every navigate(), so this re-fires even when the click landed
  // on the inspection already on screen.
  useEffect(() => {
    if (loading || location.state?.focus !== 'negotiation') return
    document.getElementById('negotiation')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, location.key])

  const fetchItems = async () => {
    const { data } = await supabase
      .from('inspection_items')
      .select('*')
      .eq('inspection_id', id)
      .order('sort_order')
    setItems(data || [])
  }

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('inspection_negotiations')
      .select('*')
      .eq('inspection_id', id)
      .order('created_at')
    setMessages(data || [])
  }

  // The customer answers from their phone, often while the inspection is still
  // open on this screen. Without this their counter-offer and their approve /
  // decline ticks sat in the database unread until someone happened to reload.
  useEffect(() => {
    const channel = supabase
      .channel(`insp-customer-${id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'inspection_negotiations', filter: `inspection_id=eq.${id}` },
        () => fetchMessages())
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'inspection_items', filter: `inspection_id=eq.${id}` },
        () => fetchItems())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const fetchInspection = async () => {
    try {
      const { data, error } = await supabase
        .from('inspections')
        .select(`*, customers(full_name, phone, email, company_name), vehicles(registration_number, make, model, year)`)
        .eq('id', id).single()
      if (error) throw error
      setInspection(data)
      setSituation(data.repair_summary || '')

      await fetchItems()

      // Payments the customer declared from the portal, awaiting confirmation.
      const { data: declared } = await supabase
        .from('inspection_payments')
        .select('*')
        .eq('inspection_id', id)
        .order('created_at', { ascending: false })
      setDeclaredPayments(declared || [])

      // The price the customer is haggling over. Insert-only on both sides
      // (migration 020), so the thread is the record of what was agreed.
      await fetchMessages()
    } catch (err) {
      toast.error(t('inspection.loadError'))
      navigate('/admin/inspections')
    } finally {
      setLoading(false)
    }
  }

  // A customer-raised request (status 'requested', migration 022) arrives with
  // no fee on it. Naming the fee is what turns it into something payable and
  // moves it onto the normal pending_payment -> paid path.
  const setInspectionFee = async (e) => {
    e.preventDefault()
    const amount = Number(feeAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t('inspection.enterAmount'))
      return
    }
    setSavingFee(true)
    try {
      const { data, error } = await supabase
        .from('inspections')
        .update({ payment_amount: amount, status: 'pending_payment' })
        .eq('id', id)
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) throw new Error(t('inspection.loadError'))

      toast.success(t('inspection.feeSet'))
      setShowFee(false)
      setFeeAmount('')
      fetchInspection()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingFee(false)
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

  // Accept a payment the customer declared from the portal. This is the only
  // path that turns a declaration into money received: the portal (anon role)
  // can insert a 'pending' row but can never mark the inspection paid itself.
  const confirmDeclaredPayment = async (payment) => {
    try {
      const { data, error } = await supabase
        .from('inspection_payments')
        .update({
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          confirmed_by: profile?.id || null,
        })
        .eq('id', payment.id)
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) throw new Error('blocked')

      const { error: inspErr } = await supabase.from('inspections').update({
        payment_status: 'paid',
        payment_method: payment.method,
        payment_reference: payment.reference || null,
        status: 'paid',
        date_paid: new Date().toISOString(),
      }).eq('id', id)
      if (inspErr) throw inspErr

      toast.success(t('inspection.paymentConfirmed'))
      fetchInspection()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const rejectDeclaredPayment = async (payment) => {
    if (!confirm(t('inspection.rejectPaymentConfirm'))) return
    try {
      const { data, error } = await supabase
        .from('inspection_payments')
        .update({ status: 'rejected', confirmed_by: profile?.id || null })
        .eq('id', payment.id)
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) throw new Error('blocked')
      toast.success(t('inspection.paymentRejected'))
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
      // This one discarded the result entirely, so it reported success even on
      // a hard error. .select() also lets an RLS no-op be detected — the bug
      // migration 019 fixes.
      const { data, error } = await supabase
        .from('inspection_items').delete().eq('id', itemId).select('id')
      if (error) throw error
      if (!data || data.length === 0) {
        toast.error(t('inspection.problemRemoveBlocked'))
        return
      }
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

  // Pull a price out of a typed sentence: "make it 300000" -> 300000.
  // Deliberately conservative — a wrong guess here would put a wrong number in
  // front of a paying customer, so anything phone-shaped or implausibly small
  // is ignored, and the result only ever lands in the visible price box.
  const parseAmountFromText = (text) => {
    const candidates = String(text || '').match(/\d[\d,.]*/g) || []
    let found = null
    for (const raw of candidates) {
      const digits = raw.replace(/\D/g, '')
      if (digits.length >= 9) continue   // phone-length
      if (/^0\d/.test(digits)) continue  // leading zero, e.g. 0755...
      const n = Number(digits)
      // 5,000 floor, not 1,000: it keeps a year ("by 31 Jul 2026") from being
      // read as a price, and no real inspection fee is under a dollar anyway.
      if (!Number.isFinite(n) || n < 5000) continue
      found = n                          // last qualifying number wins
    }
    return found
  }

  // Post a staff message on the thread, optionally settling the inspection fee
  // at the same time. sender_type 'staff' is what the portal renders as coming
  // from the garage; the customer can never forge it.
  //
  // `newFee` is the whole point of the screen: the customer haggles over the fee
  // BEFORE paying, so agreeing a number has to write it back to
  // inspections.payment_amount — that is the figure their Pay button charges.
  // Without it the garage could agree to a price the portal never honoured.
  const postReply = async ({ message, amount, newFee = null }) => {
    // Fee FIRST, message second. There is no transaction across these two
    // writes, so the order decides which way a half-failure breaks: this way a
    // failed message leaves a correct fee and no announcement, which is
    // recoverable. The reverse would post "the new fee is X" to the customer
    // while the portal still charges the old number — the precise thing this
    // whole flow exists to prevent.
    if (newFee !== null) {
      // Re-open the payment step. A 'requested' inspection has no fee at all
      // yet, so this doubles as "name the fee"; a 'pending_payment' one just
      // gets the agreed number instead of the original ask.
      const { data: updated, error: feeError } = await supabase
        .from('inspections')
        .update({ payment_amount: newFee, status: 'pending_payment' })
        .eq('id', id)
        .select('id')
      if (feeError) throw feeError
      if (!updated || updated.length === 0) throw new Error(t('inspection.loadError'))
    }

    const { data, error } = await supabase
      .from('inspection_negotiations')
      .insert({
        inspection_id: id,
        customer_id: inspection.customer_id,
        sender_type: 'staff',
        message,
        proposed_amount: amount,
      })
      .select()
    if (error) throw error
    setMessages(prev => [...prev, ...(data || [])])

    sendSMS({
      to: inspection.customers?.phone,
      message: newFee !== null
        ? smsTemplates.inspection_fee_updated(
            inspection.customers?.full_name, inspection.inspection_number, formatTZS(newFee))
        : smsTemplates.inspection_bargain_reply(
            inspection.customers?.full_name, inspection.inspection_number),
      event: newFee !== null ? 'inspection_fee_updated' : 'inspection_bargain_reply',
      customerId: inspection.customer_id,
    })
  }

  const sendReply = async (e, { updateFee = false } = {}) => {
    e.preventDefault()
    if (sendingReply) return
    const amount = replyAmount === '' ? null : Number(replyAmount)
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      toast.error(t('inspection.enterAmount'))
      return
    }
    if (updateFee && !(amount > 0)) {
      toast.error(t('inspection.enterAmount'))
      return
    }
    // Sending a price is a complete message on its own — don't force staff to
    // type prose around it. Swahili and hardcoded for the same reason as the
    // SMS templates: the customer reads it, so it can't follow the admin UI's
    // language setting.
    const message = reply.trim() || (updateFee
      ? `Ada mpya ya ukaguzi ni ${formatTZS(amount)}. Tafadhali lipa ili tuendelee.`
      : '')
    if (!message) return
    // Changing the fee is a money-facing, customer-notifying action fired from
    // one click. Same guard the reject-payment path uses.
    if (updateFee && !confirm(t('inspection.confirmNewFee').replace('{amount}', formatTZS(amount)))) return
    setSendingReply(true)
    try {
      await postReply({ message, amount, newFee: updateFee ? amount : null })
      setReply('')
      setReplyAmount('')
      setAmountTouched(false)
      toast.success(updateFee ? t('inspection.feeUpdatedSent') : t('inspection.bargainReplySent'))
      if (updateFee) fetchInspection()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSendingReply(false)
    }
  }

  // Take the customer's own number as the agreed fee, in one click.
  const acceptOffer = async (msg) => {
    const amount = Number(msg.proposed_amount)
    if (!Number.isFinite(amount) || amount <= 0 || sendingReply) return
    if (!confirm(t('inspection.confirmNewFee').replace('{amount}', formatTZS(amount)))) return
    setSendingReply(true)
    try {
      // Hardcoded Swahili, like the SMS templates: this text is persisted and
      // read by the CUSTOMER, so it must not follow whichever language the
      // staff member happens to have the admin UI set to.
      await postReply({
        message: `Tumekubali ombi lako. Ada mpya ya ukaguzi ni ${formatTZS(amount)}. Tafadhali lipa ili tuendelee.`,
        amount,
        newFee: amount,
      })
      toast.success(t('inspection.feeUpdatedSent'))
      fetchInspection()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSendingReply(false)
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
          // Deliberately not translated: this string is persisted and shown on
          // the customer's invoice and PDF forever, so it must not depend on
          // which language the staff member happened to be using. Matches the
          // wording migration 017 used to backfill older job cards.
          description: `Inspection Fee - ${inspection.inspection_number}`,
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

  const isRequested = inspection.status === 'requested'
  const isPending = inspection.status === 'pending_payment'
  const isPaid = inspection.status === 'paid'
  const isInProgress = inspection.status === 'in_progress'
  const isCompleted = inspection.status === 'completed'

  const repairDone = items.filter(i => i.repair_status === 'done').length
  const repairPct = items.length ? Math.round((repairDone / items.length) * 100) : 0

  // The fee is only negotiable while it is still unpaid and nothing the
  // customer declared is sitting in the queue — moving the goalposts under a
  // payment they already sent would leave the ledger disagreeing with itself.
  const awaitingDeclared = declaredPayments.some(p => p.status === 'pending')
  const canReviseFee = (isRequested || isPending)
    && inspection.payment_status !== 'paid'
    && !awaitingDeclared
  // A price on the reply means "this is the fee now" — the customer has to be
  // able to pay the number they were just quoted.
  const willSetFee = canReviseFee && Number(replyAmount) > 0

  const approvedItems = items.filter(i => i.customer_approved === true)
  const approvedTotal = approvedItems.reduce((sum, i) => sum + Number(i.estimated_cost || 0), 0)
  const declinedCount = items.filter(i => i.customer_approved === false).length
  const undecidedCount = items.filter(i => i.customer_approved === null || i.customer_approved === undefined).length
  // Only summarise once the customer has actually answered something —
  // otherwise every fresh inspection grows a "0 approved" block for nothing.
  const decidedCount = approvedItems.length + declinedCount

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
              isRequested ? 'bg-orange-100 text-orange-700' :
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
          {isRequested && (
            <button onClick={() => { setFeeAmount(''); setShowFee(true) }}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 text-sm font-medium">
              <CreditCard className="w-4 h-4" /> {t('inspection.setFee')}
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
            {/* Where the customer said the truck is — only they can tell us. */}
            {inspection.customer_location && (
              <p><span className="text-gray-500">{t('inspection.customerLocation')}:</span> <span className="font-medium">{inspection.customer_location}</span></p>
            )}
          </div>
        </div>
      </div>

      {/* Payment Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">{t('inspection.paymentDetails')}</h3>
          {/* A request has no fee yet, so it is neither paid nor overdue. */}
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
            isRequested ? 'bg-orange-100 text-orange-700'
              : inspection.payment_status === 'paid' ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700'
          }`}>
            {isRequested ? t('inspection.statuses.requested')
              : inspection.payment_status === 'paid' ? t('inspection.statuses.paid')
              : t('inspection.pendingPayment')}
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

        {/* Payments the customer declared from the portal. Confirming here is
            what actually marks the inspection paid — the portal can only ask. */}
        {declaredPayments.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-sm font-medium text-gray-700 mb-2">{t('inspection.declaredPayments')}</p>
            <div className="space-y-2">
              {declaredPayments.map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${
                    p.status === 'pending' ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      {formatTZS(p.amount)}
                      <span className="font-normal text-gray-500"> · {t(`paymentMethods.${p.method}`)}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {p.reference && <>{p.reference} · </>}
                      {formatDate(p.created_at)} · {t(`inspection.declaredBy.${p.declared_by}`)}
                    </p>
                  </div>
                  {p.status === 'pending' ? (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => confirmDeclaredPayment(p)}
                        className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 active:scale-95 transition cursor-pointer"
                      >
                        {t('inspection.confirmPaymentBtn')}
                      </button>
                      <button
                        onClick={() => rejectDeclaredPayment(p)}
                        className="px-3 py-1.5 border border-gray-300 text-gray-600 text-xs font-medium rounded-lg hover:bg-red-50 hover:text-red-600 active:scale-95 transition cursor-pointer"
                      >
                        {t('inspection.rejectPaymentBtn')}
                      </button>
                    </div>
                  ) : (
                    <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${
                      p.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {t(`inspection.payStatus.${p.status}`)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Price negotiation. Rendered at EVERY status, because the haggling that
          matters most happens over the inspection fee — before the customer
          pays and before there is a single finding to show. */}
      <div id="negotiation" className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-gray-500" />
            <h3 className="font-semibold text-gray-900">{t('inspection.bargainTitle')}</h3>
            {messages.length > 0 && (
              <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
                {messages.length}
              </span>
            )}
          </div>

          <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
            {messages.length === 0 ? (
              <p className="text-center text-xs text-gray-400 py-4">{t('inspection.noMessages')}</p>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`flex ${m.sender_type === 'staff' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-xl px-3 py-2 ${
                    m.sender_type === 'staff' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'
                  }`}>
                    <p className={`text-[10px] font-medium mb-0.5 ${
                      m.sender_type === 'staff' ? 'text-blue-200' : 'text-gray-500'
                    }`}>
                      {m.sender_type === 'staff'
                        ? t('inspection.bargainFromStaff')
                        : t('inspection.bargainFromCustomer')}
                    </p>
                    <p className="text-sm whitespace-pre-wrap break-words">{m.message}</p>
                    {m.proposed_amount !== null && m.proposed_amount !== undefined && (
                      <p className={`text-xs font-bold mt-1 ${
                        m.sender_type === 'staff' ? 'text-white' : 'text-gray-900'
                      }`}>
                        {t('inspection.bargainProposed')}: {formatTZS(m.proposed_amount)}
                      </p>
                    )}
                    {/* One click to take the customer's number as the fee. */}
                    {m.sender_type === 'customer' && canReviseFee && Number(m.proposed_amount) > 0 && (
                      <button
                        type="button"
                        onClick={() => acceptOffer(m)}
                        disabled={sendingReply}
                        className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {t('inspection.acceptOffer')}
                      </button>
                    )}
                    <p className={`text-[10px] mt-1 ${
                      m.sender_type === 'staff' ? 'text-blue-200' : 'text-gray-400'
                    }`}>
                      {formatDate(m.created_at)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          <form
            onSubmit={(e) => sendReply(e, { updateFee: willSetFee })}
            className="p-3 border-t border-gray-100 space-y-2"
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={reply}
                onChange={e => {
                  setReply(e.target.value)
                  // Staff type the price into the sentence ("make it 300000"),
                  // not into the price box. Mirror it across so the fee
                  // actually moves — into the visible box, never straight into
                  // the send, so what gets applied is always what they can see
                  // and correct.
                  if (!amountTouched) {
                    const found = parseAmountFromText(e.target.value)
                    setReplyAmount(found === null ? '' : String(found))
                  }
                }}
                placeholder={t('inspection.bargainReplyPlaceholder')}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <input
                type="number"
                min="0"
                step="any"
                value={replyAmount}
                onChange={e => { setAmountTouched(true); setReplyAmount(e.target.value) }}
                placeholder={t('inspection.bargainReplyAmount')}
                className={`w-32 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none ${
                  willSetFee ? 'border-green-400 bg-green-50 font-semibold' : 'border-gray-300'
                }`}
              />
            </div>
            {/* One button. If there is a price on it, sending settles the fee —
                that is what makes the customer able to pay the agreed number.
                A price alone is only sendable down that path, which writes its
                own message; otherwise there must be something to say, or the
                click would do nothing at all. */}
            <button
              type="submit"
              disabled={sendingReply || (!willSetFee && !reply.trim())}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${
                willSetFee ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-700 hover:bg-blue-800'
              }`}
            >
              {willSetFee ? <CreditCard className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              {willSetFee
                ? t('inspection.sendAsNewFee').replace('{amount}', formatTZS(Number(replyAmount)))
                : t('inspection.bargainSendBtn')}
            </button>
            <p className="text-xs text-gray-400">
              {canReviseFee ? t('inspection.feeNegotiationHint') : t('inspection.bargainReplyHint')}
            </p>
          </form>
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
                      {/* The customer's verdict, ticked from their portal.
                          null = they haven't answered this line yet. */}
                      {item.customer_approved === true && (
                        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {t('inspection.customerApproved')}
                        </span>
                      )}
                      {item.customer_approved === false && (
                        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">
                          <X className="w-3.5 h-3.5" />
                          {t('inspection.customerDeclined')}
                        </span>
                      )}
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

              {/* What the customer actually agreed to pay for. The estimated
                  total above is the garage's opening position; this is the
                  number the job card should be built from. */}
              {decidedCount > 0 && (
                <div className="pt-3 border-t border-gray-200 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-green-700">
                      {t('inspection.customerApprovedTotal')} ({approvedItems.length})
                    </span>
                    <span className="font-bold text-green-700">{formatTZS(approvedTotal)}</span>
                  </div>
                  <div className="flex gap-3 text-xs text-gray-500">
                    {declinedCount > 0 && (
                      <span>{declinedCount} {t('inspection.customerDeclinedCount')}</span>
                    )}
                    {undecidedCount > 0 && (
                      <span>{undecidedCount} {t('inspection.customerUndecidedCount')}</span>
                    )}
                  </div>
                </div>
              )}
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

      {/* Set-fee Modal — only reachable from a customer-raised request */}
      {showFee && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold">{t('inspection.setFee')}</h2>
              <button onClick={() => setShowFee(false)} className="p-1 rounded hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={setInspectionFee} className="p-5 space-y-4">
              <p className="text-sm text-gray-500">{t('inspection.setFeeHint')}</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('inspection.paymentAmount')} (TZS) *
                </label>
                <input type="number" min="1" step="any" value={feeAmount} autoFocus
                  onChange={e => setFeeAmount(e.target.value)} required
                  placeholder="e.g. 50000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={savingFee}
                  className="flex-1 py-2.5 bg-blue-700 text-white font-medium rounded-lg hover:bg-blue-800 transition disabled:opacity-40">
                  {t('common.save')}
                </button>
                <button type="button" onClick={() => setShowFee(false)}
                  className="px-6 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition">
                  {t('common.cancel')}
                </button>
              </div>
            </form>
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
                  <option value="lipa_namba">{t('paymentMethods.lipa_namba')}</option>
                  <option value="bank_transfer">{t('paymentMethods.bank_transfer')}</option>
                  <option value="cheque">{t('paymentMethods.cheque')}</option>
                  <option value="other">{t('paymentMethods.other')}</option>
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
