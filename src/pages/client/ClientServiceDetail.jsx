import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { useClient } from '../../contexts/ClientAuthContext'
import { supabase, formatTZS, formatDate } from '../../lib/supabase'
import { notifyStaff } from '../../lib/notifications'
import {
  ArrowLeft, CheckCircle2, XCircle, AlertTriangle, Clock,
  Wrench, ClipboardCheck, Phone, Receipt, Send, FileText
} from 'lucide-react'
import toast from 'react-hot-toast'
import Reveal from '../../components/common/Reveal'
import StatusTracker from '../../components/common/StatusTracker'
import { JOB_STAGE_KEYS, jobStage } from '../../lib/clientStages'

export default function ClientServiceDetail() {
  const { id } = useParams()
  const { t } = useLanguage()
  const { customer } = useClient()
  const [jobCard, setJobCard] = useState(null)
  const [inspection, setInspection] = useState(null)
  const [items, setItems] = useState([])
  const [jobItems, setJobItems] = useState([])
  const [proformaReq, setProformaReq] = useState(null)
  const [proforma, setProforma] = useState(null)
  // The last two stages of the customer track don't live on the job card: a job
  // is "Invoiced" once a final invoice exists and "Delivered" once it has been
  // handed back. See src/lib/clientStages.js.
  const [hasFinalInvoice, setHasFinalInvoice] = useState(false)
  const [hasHandover, setHasHandover] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [id])

  // Live updates: when the mechanic ticks an item or posts a car-situation note,
  // refetch so the customer sees "fixed / in progress / pending" change in place.
  useEffect(() => {
    const inspId = jobCard?.inspection_id
    if (!inspId) return
    const channel = supabase
      .channel(`svc-${inspId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'inspection_items', filter: `inspection_id=eq.${inspId}` },
        () => fetchData())
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'inspections', filter: `id=eq.${inspId}` },
        () => fetchData())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobCard?.inspection_id])

  const fetchData = async () => {
    try {
      const { data: jc } = await supabase
        .from('job_cards')
        .select('*, customers(full_name, phone), vehicles(registration_number, make, model, year)')
        .eq('id', id)
        .single()

      if (!jc) { setLoading(false); return }
      setJobCard(jc)

      // Costed line items staff added (customer-safe columns only — never cost/profit)
      // and any existing proforma request, so the client sees the real bill and
      // whether they've already asked for a proforma.
      const [jobItemsRes, reqRes, proformaRes, finalRes, handoverRes] = await Promise.all([
        supabase.from('job_card_items')
          .select('id, item_type, description, quantity, selling_price, total_selling')
          .eq('job_card_id', id)
          .order('item_type', { ascending: true }),
        supabase.from('proforma_requests')
          .select('id, status, created_at')
          .eq('job_card_id', id)
          .order('created_at', { ascending: false })
          .limit(1),
        // The proforma staff prepared in answer to the request, if any — it's
        // where the customer goes to pay, so we link straight to it instead of
        // leaving him to hunt through the invoice list.
        supabase.from('invoices')
          .select('id, status')
          .eq('job_card_id', id)
          .eq('invoice_type', 'proforma')
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false })
          .limit(1),
        supabase.from('invoices')
          .select('id')
          .eq('job_card_id', id)
          .eq('invoice_type', 'final')
          .neq('status', 'cancelled')
          .limit(1),
        supabase.from('handover_cards')
          .select('id')
          .eq('job_card_id', id)
          .limit(1),
      ])
      setJobItems(jobItemsRes.data || [])
      setProformaReq(reqRes.data?.[0] || null)
      setProforma(proformaRes.data?.[0] || null)
      setHasFinalInvoice((finalRes.data?.length || 0) > 0)
      setHasHandover((handoverRes.data?.length || 0) > 0)

      if (jc.inspection_id) {
        const [inspRes, itemsRes] = await Promise.all([
          supabase.from('inspections').select('*').eq('id', jc.inspection_id).single(),
          supabase.from('inspection_items').select('*').eq('inspection_id', jc.inspection_id).order('sort_order'),
        ])
        setInspection(inspRes.data)
        setItems(itemsRes.data || [])
      }
    } catch (err) {
      console.error('Service detail error:', err)
    } finally {
      setLoading(false)
    }
  }

  const requestProforma = async () => {
    setRequesting(true)
    try {
      const { data, error } = await supabase.from('proforma_requests').insert({
        job_card_id: id,
        customer_id: customer?.id || null,
        status: 'pending',
      }).select('id, status, created_at').single()
      if (error) throw error
      setProformaReq(data)
      await notifyStaff({
        type: 'proforma_request',
        title: t('client.services.requestProforma'),
        body: `${customer?.full_name || t('invoices.customer')} — ${jobCard?.job_number}`,
        jobCardId: id,
        customerId: customer?.id || null,
      })
      toast.success(t('client.services.requestSent'))
    } catch (err) {
      toast.error(err.message)
    } finally {
      setRequesting(false)
    }
  }

  const toggleApproval = async (itemId, approved) => {
    try {
      await supabase.from('inspection_items').update({ customer_approved: approved }).eq('id', itemId)
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, customer_approved: approved } : i))
      toast.success(approved ? t('customerView.approved') : t('customerView.declined'))

      // Declining is the customer saying he isn't satisfied, and it can happen
      // after the job is already quoted (Antony, 5 Aug 2026). Staff have to hear
      // about it or the proforma keeps billing for work he has just refused.
      if (approved === false) {
        const item = items.find(i => i.id === itemId)
        await notifyStaff({
          type: 'item_declined',
          title: t('client.services.declinedNotice'),
          body: `${customer?.full_name || t('invoices.customer')} — ${jobCard?.job_number}${item ? `: ${item.problem_description}` : ''}`,
          jobCardId: id,
          customerId: customer?.id || null,
        })
      }
    } catch {
      toast.error(t('customerView.failedUpdate'))
    }
  }

  const approveAll = async () => {
    const inspectionId = inspection?.id || jobCard?.inspection_id
    if (!inspectionId) return
    try {
      await supabase.from('inspection_items').update({ customer_approved: true }).eq('inspection_id', inspectionId)
      setItems(prev => prev.map(i => ({ ...i, customer_approved: true })))
      toast.success(t('customerView.allApproved'))
    } catch {
      toast.error(t('customerView.failedUpdate'))
    }
  }

  const severityColors = {
    low: { bg: 'bg-gray-100', text: 'text-gray-600' },
    medium: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
    high: { bg: 'bg-orange-100', text: 'text-orange-700' },
    critical: { bg: 'bg-red-100', text: 'text-red-700' },
  }

  const isPreJobCard = jobCard?.status === 'pre_job_card' || jobCard?.status === 'pending_approval'
  const totalEstimated = items.reduce((s, i) => s + Number(i.estimated_cost || 0), 0)
  const approvedCount = items.filter(i => i.customer_approved === true).length
  const approvedTotal = items.filter(i => i.customer_approved === true).reduce((s, i) => s + Number(i.estimated_cost || 0), 0)
  const repairDone = items.filter(i => i.repair_status === 'done').length
  const repairPct = items.length ? Math.round((repairDone / items.length) * 100) : 0
  const repairStarted = items.some(i => i.repair_status && i.repair_status !== 'pending') || !!inspection?.repair_summary
  const jobItemsTotal = jobItems.reduce((s, i) => s + Number(i.total_selling || (i.selling_price || 0) * (i.quantity || 1)), 0)
  // Antony, 4 Aug 2026: "usiweke tena hii batani … request tena mara ya pili.
  // Hapana." The button used to come back the moment staff fulfilled the request,
  // letting the customer ask for a second quote on the same job.
  //
  // Gated on whether something is LIVE rather than on whether he ever asked: a
  // pending request or an uncancelled proforma closes it. A request that was
  // fulfilled by a proforma staff later CANCELLED opens it again — otherwise the
  // customer is stranded on a job card with nothing to press and no way to ask.
  const quoted = !!proforma || proformaReq?.status === 'pending'
  const canRequestProforma = jobItems.length > 0 && !quoted
  // Approve/decline is deliberately NOT withdrawn once a proforma exists. The
  // 22:31:34 note ("hii job card itakuwa imeclose, isionekane chochote") could be
  // read that way, but it's about the request button he'd just pressed twice, and
  // the transcript is too rough to take a customer's ability to object away on.
  // Ask him before changing this.
  const canApprove = isPreJobCard || (inspection && inspection.status === 'completed')

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (!jobCard) {
    return (
      <div className="text-center py-12">
        <XCircle className="w-12 h-12 text-red-300 mx-auto mb-3" />
        <p className="text-gray-500">{t('client.services.notFound')}</p>
        <Link to="/client/services" className="text-blue-600 text-sm mt-2 inline-block">{t('common.back')}</Link>
      </div>
    )
  }

  const vehicle = jobCard.vehicles
  // One stage model for the whole portal (dashboard rows and this page), so a
  // customer never sees their job at a different point in two places.
  const progressSteps = JOB_STAGE_KEYS.map(k => ({ key: k, label: t(`client.dashboard.stages.${k}`) }))
  const stage = jobStage(jobCard, { hasFinalInvoice, hasHandover })

  return (
    <div className="space-y-4">
      {/* Back */}
      <Link to="/client/services" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> {t('common.back')}
      </Link>

      {/* Header */}
      <Reveal className="bg-white rounded-2xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-lg font-bold text-gray-900">{jobCard.job_number}</p>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            jobCard.status === 'completed' ? 'bg-green-100 text-green-700' :
            jobCard.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700' :
            isPreJobCard ? 'bg-purple-100 text-purple-700' :
            'bg-blue-100 text-blue-700'
          }`}>
            {t(`jobs.statuses.${jobCard.status}`)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-gray-400 text-xs">{t('customerView.vehicle')}</p>
            <p className="font-medium text-gray-900">{vehicle?.registration_number}</p>
            <p className="text-xs text-gray-500">{vehicle?.make} {vehicle?.model}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs">{t('jobs.dateIn')}</p>
            <p className="font-medium text-gray-900">{formatDate(jobCard.created_at)}</p>
          </div>
        </div>
      </Reveal>

      {/* Where the vehicle is on the customer track. Shown for a pre-job card
          too — "you are at the quotation stage" is exactly what someone waiting
          on a price wants to see. */}
      <Reveal className="bg-white rounded-2xl border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-4 text-sm">{t('client.dashboard.trackTitle')}</h3>
        <StatusTracker
          steps={progressSteps}
          current={stage.index}
          cancelled={stage.cancelled}
          cancelledLabel={t('client.dashboard.stages.cancelled')}
        />
      </Reveal>

      {/* Customer Complaint */}
      {(inspection?.description || jobCard.description) && (
        <Reveal className="bg-white rounded-2xl border border-gray-200 p-4">
          <h3 className="text-xs font-semibold text-gray-400 mb-1">{t('customerView.yourComplaint')}</h3>
          <p className="text-sm text-gray-800 whitespace-pre-line">{inspection?.description || jobCard.description}</p>
        </Reveal>
      )}

      {/* Live Repair Progress */}
      {items.length > 0 && (
        <Reveal className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
              <Wrench className="w-4 h-4 text-blue-600" /> {t('customerView.repairProgress')}
            </h3>
            <span className="text-sm font-bold text-green-700">{repairPct}%</span>
          </div>
          <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 transition-all" style={{ width: `${repairPct}%` }} />
          </div>
          <p className="text-xs text-gray-500">{repairDone}/{items.length} {t('customerView.partsFixed')}</p>
          {inspection?.repair_summary ? (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
              <p className="text-xs font-medium text-blue-800 mb-0.5">{t('customerView.mechanicUpdate')}</p>
              <p className="text-sm text-blue-900 whitespace-pre-line">{inspection.repair_summary}</p>
              {inspection.repair_updated_at && (
                <p className="text-[10px] text-blue-500 mt-1">{formatDate(inspection.repair_updated_at)}</p>
              )}
            </div>
          ) : !repairStarted ? (
            <p className="text-xs text-gray-400">{t('customerView.noRepairYet')}</p>
          ) : null}
        </Reveal>
      )}

      {/* Inspection Findings */}
      {items.length > 0 && (
        <Reveal className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">{t('customerView.inspectionFindings')}</h3>
                <p className="text-xs text-gray-500">{items.length} {t('customerView.issuesFound')}</p>
              </div>
              {canApprove && (
                <button onClick={approveAll}
                  className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 active:scale-95 transition">
                  {t('customerView.approveAll')}
                </button>
              )}
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {items.map((item, idx) => {
              const sev = severityColors[item.severity] || severityColors.medium
              return (
                <div key={item.id} className={`p-4 ${
                  item.customer_approved === true ? 'bg-green-50/40' :
                  item.customer_approved === false ? 'bg-red-50/40' : ''
                }`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-bold text-gray-400">#{idx + 1}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sev.bg} ${sev.text}`}>
                          {(item.severity === 'high' || item.severity === 'critical') && (
                            <AlertTriangle className="w-3 h-3 inline mr-0.5" />
                          )}
                          {t(`inspection.severities.${item.severity}`)}
                        </span>
                        {item.repair_status === 'done' && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700 flex items-center gap-0.5">
                            <CheckCircle2 className="w-3 h-3" /> {t('customerView.statusFixed')}
                          </span>
                        )}
                        {item.repair_status === 'in_progress' && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-100 text-yellow-700 flex items-center gap-0.5">
                            <Wrench className="w-3 h-3" /> {t('customerView.statusInProgress')}
                          </span>
                        )}
                        {item.customer_approved === true && (
                          <span className="text-xs text-green-600 font-medium flex items-center gap-0.5">
                            <CheckCircle2 className="w-3 h-3" /> {t('customerView.approved')}
                          </span>
                        )}
                        {item.customer_approved === false && (
                          <span className="text-xs text-red-700 font-medium flex items-center gap-0.5">
                            <XCircle className="w-3 h-3" /> {t('customerView.declined')}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-gray-900">{item.problem_description}</p>
                      {item.recommended_action && (
                        <p className="text-xs text-blue-600 mt-1">{t('customerView.recommended')}: {item.recommended_action}</p>
                      )}
                    </div>

                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-gray-900 mb-2">{formatTZS(item.estimated_cost)}</p>
                      {canApprove && (
                        <div className="flex gap-1.5">
                          <button onClick={() => toggleApproval(item.id, true)}
                            className={`p-2 rounded-lg transition active:scale-95 ${
                              item.customer_approved === true
                                ? 'bg-green-600 text-white shadow-sm'
                                : 'bg-gray-100 text-gray-400 hover:bg-green-50 hover:text-green-600'
                            }`}>
                            <CheckCircle2 className="w-5 h-5" />
                          </button>
                          <button onClick={() => toggleApproval(item.id, false)}
                            className={`p-2 rounded-lg transition active:scale-95 ${
                              item.customer_approved === false
                                ? 'bg-red-600 text-white shadow-sm'
                                : 'bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-red-600'
                            }`}>
                            <XCircle className="w-5 h-5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Summary */}
          <div className="p-4 bg-gray-50 border-t border-gray-200">
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-gray-500">{t('customerView.totalEstimated')}</span>
              <span className="font-medium">{formatTZS(totalEstimated)}</span>
            </div>
            {approvedCount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-green-700 font-medium">{t('customerView.approvedItems')} ({approvedCount})</span>
                <span className="font-bold text-green-700">{formatTZS(approvedTotal)}</span>
              </div>
            )}
          </div>
        </Reveal>
      )}

      {/* Work & Costs — the priced job-card line items (what the client will pay) */}
      {jobItems.length > 0 && (
        <Reveal className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-blue-600" />
            <h3 className="font-semibold text-gray-900 text-sm">{t('client.services.workCosts')}</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {jobItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 truncate">{item.description}</p>
                  <p className="text-xs text-gray-400 capitalize">
                    {t(`jobs.itemTypes.${item.item_type}`)} · {item.quantity} × {formatTZS(item.selling_price)}
                  </p>
                </div>
                <p className="text-sm font-medium text-gray-900 ml-3">
                  {formatTZS(item.total_selling || (item.selling_price || 0) * (item.quantity || 1))}
                </p>
              </div>
            ))}
          </div>
          <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-between text-sm">
            <span className="text-gray-500">{t('client.services.estimatedTotal')}</span>
            <span className="font-bold text-gray-900">{formatTZS(jobItemsTotal)}</span>
          </div>
        </Reveal>
      )}

      {/* Request Proforma — client asks staff to prepare a proforma to pay
          against. One press only: after that this becomes a way through to the
          proforma, never the same button again. */}
      {jobItems.length > 0 && (
        <Reveal className="bg-white rounded-2xl border border-gray-200 p-4">
          {proforma ? (
            // Staff have prepared it — this is the "press pay, go to mobile
            // money" step Antony describes. Shown for a DRAFT proforma too:
            // that's the state he narrates ("hiko ni draft … anabonyeza simu ya
            // kulipa"), and the customer's copy offers payment on any proforma
            // with a balance owed, draft included.
            <Link
              to={`/client/invoices/${proforma.id}`}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-700 text-white font-medium rounded-xl hover:bg-blue-800 transition active:scale-[0.98]"
            >
              <FileText className="w-4 h-4" />
              {t('client.services.proformaReady')}
            </Link>
          ) : quoted ? (
            <div className="flex items-center gap-2 justify-center text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg py-3">
              <Clock className="w-4 h-4" />
              {t('client.services.proformaRequested')}
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-500 mb-2.5 text-center">{t('client.services.requestProformaHint')}</p>
              <button
                onClick={requestProforma}
                disabled={requesting || !canRequestProforma}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-700 text-white font-medium rounded-xl hover:bg-blue-800 transition active:scale-[0.98] disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {t('client.services.requestProforma')}
              </button>
            </>
          )}
        </Reveal>
      )}

      {/* Contact */}
      <Reveal className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
        <p className="text-xs text-gray-500 mb-2">{t('customerView.contactQuestion')}</p>
        <a href="tel:+255123456789" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 active:scale-95 transition">
          <Phone className="w-4 h-4" /> {t('customerView.callUs')}
        </a>
      </Reveal>
    </div>
  )
}
