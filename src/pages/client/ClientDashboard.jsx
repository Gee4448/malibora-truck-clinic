import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { useClient } from '../../contexts/ClientAuthContext'
import { supabase, formatTZS, formatDate } from '../../lib/supabase'
import {
  Truck, ClipboardList, FileText, ArrowRight, ClipboardCheck,
  Wrench, Send, Bell, ReceiptText, PackageCheck, ChevronRight,
} from 'lucide-react'
import CountUp from '../../components/common/CountUp'
import Reveal from '../../components/common/Reveal'
import StatusTracker from '../../components/common/StatusTracker'
import TruckMark from '../../components/common/TruckMark'
import { useSpotlight } from '../../hooks/useSpotlight'
import { DashboardSkeleton } from '../../components/common/Skeleton'
import {
  JOB_STAGE_KEYS, INSPECTION_STAGE_KEYS, jobStage, inspectionStage,
  isQuoteAwaitingCustomer, amountOutstanding, isInspectionAwaitingPayment,
} from '../../lib/clientStages'

// Client portal home, organised the way Odoo's customer portal is:
//   1. what is waiting on YOU        ("Needs your attention")
//   2. your documents by type        ("Your Documents" — one tile per type, with a count)
//   3. your open documents, each showing its position on a fixed stage track
// The skin stays Malibora's — orange bento tiles, motion — per ui-inspiration/DIRECTION.md.

const ACTIVE_JOB_STATUSES = [
  'customer_request', 'open', 'in_progress', 'waiting_parts', 'pre_job_card', 'pending_approval',
]

export default function ClientDashboard() {
  const { t } = useLanguage()
  const { customer } = useClient()
  const [data, setData] = useState({
    vehicles: 0,
    activeJobs: [],
    inspections: [],
    quotations: [],
    invoices: [],
    handovers: 0,
    // Stage lookups: a job's later stages live in other tables, so they are
    // resolved once here rather than re-queried per row.
    finalInvoiceJobIds: new Set(),
    handoverJobIds: new Set(),
  })
  const [loading, setLoading] = useState(true)
  const onSpot = useSpotlight()

  useEffect(() => {
    if (customer?.id) fetchData()
  }, [customer?.id])

  const fetchData = async () => {
    try {
      const [vehiclesRes, jobsRes, invoicesRes, inspectionsRes, handoversRes] = await Promise.all([
        supabase.from('vehicles').select('id').eq('customer_id', customer.id),
        supabase.from('job_cards').select('*, vehicles(registration_number, make, model)')
          .eq('customer_id', customer.id)
          .order('created_at', { ascending: false }),
        // Customer-safe columns only — never pull internal cost/profit here.
        // `amount_paid` is needed to work out what is still owed.
        supabase.from('invoices')
          .select('id, invoice_number, invoice_type, status, total_amount, amount_paid, job_card_id, created_at')
          .eq('customer_id', customer.id)
          .in('invoice_type', ['proforma', 'final'])
          .order('created_at', { ascending: false }),
        supabase.from('inspections').select('*, vehicles(registration_number, make, model)')
          .eq('customer_id', customer.id)
          .order('created_at', { ascending: false }),
        supabase.from('handover_cards').select('id, job_card_id').eq('customer_id', customer.id),
      ])

      const allJobs = jobsRes.data || []
      const allInvoices = invoicesRes.data || []
      const allHandovers = handoversRes.data || []

      setData({
        vehicles: vehiclesRes.data?.length || 0,
        activeJobs: allJobs.filter(j => ACTIVE_JOB_STATUSES.includes(j.status)),
        inspections: inspectionsRes.data || [],
        quotations: allInvoices.filter(i => i.invoice_type === 'proforma'),
        invoices: allInvoices.filter(i => i.invoice_type === 'final'),
        handovers: allHandovers.length,
        finalInvoiceJobIds: new Set(
          allInvoices.filter(i => i.invoice_type === 'final' && i.status !== 'cancelled')
            .map(i => i.job_card_id).filter(Boolean),
        ),
        handoverJobIds: new Set(allHandovers.map(h => h.job_card_id).filter(Boolean)),
      })
    } catch (err) {
      console.error('Dashboard error:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <DashboardSkeleton />

  const jobSteps = JOB_STAGE_KEYS.map(k => ({ key: k, label: t(`client.dashboard.stages.${k}`) }))
  const inspectionSteps = INSPECTION_STAGE_KEYS.map(k => ({ key: k, label: t(`client.dashboard.inspectionStages.${k}`) }))
  const stageOf = (job) => jobStage(job, {
    hasFinalInvoice: data.finalInvoiceJobIds.has(job.id),
    hasHandover: data.handoverJobIds.has(job.id),
  })

  // ---- What is waiting on the customer -------------------------------------
  const openQuotes = data.quotations.filter(isQuoteAwaitingCustomer)
  const unpaidInvoices = data.invoices.filter(i => amountOutstanding(i) > 0 && i.status !== 'draft')
  const unpaidInspections = data.inspections.filter(isInspectionAwaitingPayment)
  const amountDue = unpaidInvoices.reduce((sum, i) => sum + amountOutstanding(i), 0)

  const actions = [
    ...openQuotes.map(q => ({
      id: `q-${q.id}`, to: `/client/invoices/${q.id}`, icon: FileText,
      label: t('client.dashboard.actionApproveQuote'), ref: q.invoice_number, amount: q.total_amount,
    })),
    ...unpaidInvoices.map(i => ({
      id: `i-${i.id}`, to: `/client/invoices/${i.id}`, icon: ReceiptText,
      label: t('client.dashboard.actionPayInvoice'), ref: i.invoice_number, amount: amountOutstanding(i),
    })),
    ...unpaidInspections.map(s => ({
      id: `s-${s.id}`, to: `/client/inspections/${s.id}`, icon: ClipboardCheck,
      label: t('client.dashboard.actionPayInspection'), ref: s.inspection_number, amount: null,
    })),
  ]

  // ---- Your Documents ------------------------------------------------------
  // Odoo's portal home is a grid of document types with a live count; a type
  // with nothing in it stays visible but reads as empty rather than disappearing.
  const documents = [
    { to: '/client/vehicles', icon: Truck, count: data.vehicles, label: t('client.dashboard.vehicles') },
    { to: '/client/services', icon: ClipboardList, count: data.activeJobs.length, label: t('client.dashboard.services') },
    { to: '/client/inspections', icon: ClipboardCheck, count: data.inspections.length, label: t('client.dashboard.inspections') },
    { to: '/client/invoices?type=proforma', icon: FileText, count: data.quotations.length, label: t('client.dashboard.quotations') },
    { to: '/client/invoices?type=final', icon: ReceiptText, count: data.invoices.length, label: t('client.dashboard.invoicesToPay') },
    { to: '/client/handovers', icon: PackageCheck, count: data.handovers, label: t('client.dashboard.handovers') },
  ]

  const recentInspections = data.inspections.slice(0, 3)
  const openJobs = data.activeJobs.slice(0, 5)

  /* Callouts annotating the truck in the hero, in the reference's style. These
     are the SAME two figures the chip below carries — real, already fetched, and
     shown in one place or the other, never both. Nothing here is invented: a
     capacity or tonnage figure would have to be made up, and a made-up number on
     a customer's own dashboard is worse than an empty corner. */
  const calloutSpecs = [
    data.activeJobs.length > 0 && {
      value: data.activeJobs.length,
      label: t('client.dashboard.activeServices'),
    },
    amountDue > 0 && {
      value: formatTZS(amountDue),
      label: t('client.dashboard.amountDue'),
    },
  ].filter(Boolean)

  return (
    <div className="space-y-4">
      {/* Greeting hero — brand orange, big rounded */}
      {/* The truck sits on the right and the greeting is pinned bottom-left, so
          the two never fight for the same space. On a phone there is no room
          beside the text, so the mark drops behind it at low alpha instead of
          being hidden — the card would otherwise go back to looking empty. */}
      <div className="sheen hero-dark rounded-3xl p-6 min-h-[190px] sm:min-h-[176px] flex flex-col justify-end lg:flex-row lg:items-center lg:justify-between lg:gap-5">
        <div className="absolute -top-16 -right-10 w-44 h-44 rounded-full bg-white/[0.07] animate-float pointer-events-none" />
        {/* Sized by HEIGHT, not width: the art is 3.2:1, so a width that looks
            right on a wide card is taller than the card itself and gets its
            wheels clipped off. Height-first keeps it inside the panel at every
            size and lets the width fall out of the aspect ratio.

            `absolute` until lg, then `lg:relative` so it becomes a flex child
            and shares the row with the callouts instead of being overlapped by
            them. NOT `lg:static`: an unpositioned child falls below the panel's
            ::before wash — see the note on `.hero-dark > *` in index.css. */}
        <div className="absolute lg:relative right-0 sm:right-4 lg:right-auto bottom-3 lg:bottom-auto lg:order-2 lg:shrink-0 animate-float-delayed">
          <TruckMark className="h-[92px] sm:h-[112px] lg:h-[124px] w-auto text-white opacity-40 sm:opacity-65" />
        </div>
        <div className="relative">
          <p className="on-dark-muted text-xs font-medium font-display tracking-wide uppercase">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="text-2xl font-bold mt-1 leading-tight">
            {t('client.dashboard.welcome')}, {customer?.full_name?.split(' ')[0]} <span className="inline-block">👋</span>
          </h1>
          {/* Wraps as whole stats, never mid-phrase: "2 active services" is long
              in both languages and the chip is only ~330px wide on a phone. */}
          {/* lg:hidden — above lg these same two figures are the truck callouts,
              and showing them twice on one card reads as a bug. */}
          {(data.activeJobs.length > 0 || amountDue > 0) && (
            <div className="lg:hidden glass-panel rounded-2xl px-3.5 py-2 mt-4 inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white">
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <Wrench className="w-4 h-4 flex-shrink-0" />
                <span className="font-bold">{data.activeJobs.length}</span> {t('client.dashboard.activeServices').toLowerCase()}
              </span>
              {amountDue > 0 && (
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <ReceiptText className="w-4 h-4 flex-shrink-0" />
                  <span className="font-bold">{formatTZS(amountDue)}</span>
                </span>
              )}
            </div>
          )}

          {/* Callouts, in the reference's arrangement: labels on the LEFT, each
              with a leader line running right into the drawing. They were first
              built to the truck's left inside the same row, which does not fit —
              the card is capped at max-w-3xl (736px), and greeting + callouts +
              truck measured 570px of furniture against a 140px greeting, so
              "Welcome, Godson" broke onto three lines. Under the greeting they
              cost no horizontal room at all and read as annotations of the truck
              beside them, which is what the reference does. */}
          {calloutSpecs.length > 0 && (
            /* Full width of the greeting column, so each leader ends hard against
               the truck beside it rather than stopping in mid-air. The column is
               sized by the flex row, so this tracks the truck automatically. */
            <ul className="hidden lg:block mt-4 space-y-2.5 w-full">
              {calloutSpecs.map(spec => (
                <li key={spec.label} className="relative pr-12">
                  <p className="text-base font-bold font-display leading-none tabular-nums text-white">{spec.value}</p>
                  {/* Wraps rather than nowrap: Swahili runs ~35% longer here
                      ("Kiasi kinachodaiwa" vs "Amount due"). */}
                  <p className="on-dark-muted text-[10px] font-medium uppercase tracking-wide mt-1 leading-tight">
                    {spec.label}
                  </p>
                  <span aria-hidden="true" className="absolute right-1.5 top-[7px] h-px w-9 bg-[var(--brand-orange)] opacity-70" />
                  <span aria-hidden="true" className="absolute right-0 top-[5px] w-1.5 h-1.5 rounded-full bg-[var(--brand-orange)]" />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Needs your attention — the documents waiting on the CUSTOMER, which is
          what Odoo's portal leads with instead of making them hunt through lists. */}
      {actions.length > 0 && (
        <Reveal className="tile-dark rounded-3xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 pt-4 pb-3">
            <span className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center">
              <Bell className="w-3.5 h-3.5 text-blue-400" />
            </span>
            <h2 className="font-bold text-sm">{t('client.dashboard.needsAttention')}</h2>
            <span className="ml-auto text-xs font-bold text-blue-300 bg-blue-500/10 rounded-full px-2 py-0.5">
              {actions.length}
            </span>
          </div>
          <div className="divide-y divide-white/5">
            {actions.slice(0, 4).map((a) => (
              <Link key={a.id} to={a.to}
                className="flex items-center gap-3 px-5 py-3 hover:bg-white/5 active:bg-white/10 transition-colors">
                <a.icon className="w-4 h-4 text-blue-400 flex-shrink-0" />
                {/* The label is the message — it gets the full width, and the
                    amount sits under it. Side by side, a phone truncates the
                    sentence down to "Quotation waiting…" and says nothing. */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug">{a.label}</p>
                  <p className="text-xs on-dark-muted mt-0.5">
                    {a.ref}
                    {a.amount != null && (
                      <span className="text-blue-300 font-semibold"> · {formatTZS(a.amount)}</span>
                    )}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 on-dark-faint flex-shrink-0" />
              </Link>
            ))}
          </div>
        </Reveal>
      )}

      {/* Primary CTA — the one card on this screen that gets the reference
          treatment at full strength (.tile-ember rather than .tile-dark).
          It can carry the crimson because everything on it is white text; the
          document tiles below cannot, because their orange counts would sink
          into it. */}
      <Link
        to="/client/new-request"
        onMouseMove={onSpot}
        className="card-lift sheen spotlight flex items-center gap-4 tile-ember rounded-3xl p-5"
      >
        <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center flex-shrink-0">
          <Send className="w-6 h-6 text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-base">{t('client.dashboard.reportProblem')}</p>
          <p className="text-sm on-dark-muted truncate">{t('client.newRequest.requestType')}</p>
        </div>
        <div className="ml-auto w-9 h-9 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
          <ArrowRight className="w-4 h-4 text-white" />
        </div>
      </Link>

      {/* Your Documents — one tile per document type, with a live count */}
      <div>
        <SectionLabel>{t('client.dashboard.yourDocuments')}</SectionLabel>
        <Reveal group className="grid grid-cols-2 gap-3">
          {documents.map((doc) => (
            <Link key={doc.to} to={doc.to} onMouseMove={onSpot}
              className="card-lift sheen spotlight tile-dark rounded-3xl p-4">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center">
                  <doc.icon className="w-5 h-5 text-blue-400" />
                </div>
                <ArrowRight className="w-4 h-4 on-dark-faint" />
              </div>
              <p className={`text-3xl font-bold mt-3 ${doc.count ? 'text-blue-400' : 'on-dark-faint'}`}>
                <CountUp value={doc.count} />
              </p>
              <p className="text-xs on-dark-muted mt-0.5">{doc.label}</p>
            </Link>
          ))}
        </Reveal>
      </div>

      {/* Open job cards, each on the stage track */}
      <div>
        <SectionLabel
          action={data.activeJobs.length > 0 && (
            <Link to="/client/services" className="text-xs text-blue-600 font-medium flex items-center gap-1">
              {t('client.dashboard.viewAll')} <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        >
          {t('client.dashboard.jobCardsTitle')}
        </SectionLabel>

        {openJobs.length === 0 ? (
          <EmptyCard icon={Wrench} title={t('client.dashboard.noActiveServices')} hint={t('client.dashboard.allGood')} />
        ) : (
          <Reveal group className="space-y-3">
            {openJobs.map((job) => {
              const stage = stageOf(job)
              return (
                <Link key={job.id} to={`/client/services/${job.id}`}
                  className="card-lift block bg-white rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {job.vehicles?.registration_number} — {job.vehicles?.make} {job.vehicles?.model}
                      </p>
                      <p className="text-xs text-gray-500">{job.job_number} · {formatDate(job.created_at)}</p>
                    </div>
                    {/* A stage badge here would just repeat the ribbon below,
                        whose highlighted chevron already names the stage. The
                        inspection rows keep their badge because it shows the raw
                        status ("Pending Payment"), which the track does not. */}
                    {stage.cancelled && (
                      <span className="text-xs font-medium text-gray-500 bg-gray-100 rounded-full px-2.5 py-1 flex-shrink-0">
                        {t('client.dashboard.stages.cancelled')}
                      </span>
                    )}
                  </div>
                  {!stage.cancelled && (
                    <StatusTracker className="mt-3" steps={jobSteps} current={stage.index} compact />
                  )}
                </Link>
              )
            })}
          </Reveal>
        )}
      </div>

      {/* Inspections, on their own track */}
      <div>
        <SectionLabel
          action={data.inspections.length > 0 && (
            <Link to="/client/inspections" className="text-xs text-blue-600 font-medium flex items-center gap-1">
              {t('client.dashboard.viewAll')} <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        >
          {t('client.dashboard.inspectionsTitle')}
        </SectionLabel>

        {recentInspections.length === 0 ? (
          <EmptyCard icon={ClipboardCheck} title={t('client.dashboard.noInspections')} />
        ) : (
          <Reveal group className="space-y-3">
            {recentInspections.map((insp) => {
              const stage = inspectionStage(insp)
              return (
                <Link key={insp.id} to={`/client/inspections/${insp.id}`}
                  className="card-lift block bg-white rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{insp.inspection_number}</p>
                      <p className="text-xs text-gray-500">
                        {insp.vehicles?.registration_number} · {formatDate(insp.created_at)}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-blue-700 bg-blue-50 rounded-full px-2.5 py-1 flex-shrink-0">
                      {t(`inspection.statuses.${insp.status}`)}
                    </span>
                  </div>
                  {!stage.cancelled && (
                    <StatusTracker className="mt-3" steps={inspectionSteps} current={stage.index} compact />
                  )}
                </Link>
              )
            })}
          </Reveal>
        )}
      </div>
    </div>
  )
}

// Odoo's portal separates its blocks with a plain labelled rule rather than
// wrapping each list in its own card — it keeps a long phone page legible.
function SectionLabel({ children, action }) {
  return (
    <div className="flex items-center gap-3 px-1 mb-2.5">
      <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{children}</h2>
      <span className="flex-1 h-px bg-gray-200" />
      {action}
    </div>
  )
}

function EmptyCard({ icon: Icon, title, hint }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
      <Icon className="w-10 h-10 text-gray-200 mx-auto mb-3" />
      <p className="text-gray-500 text-sm">{title}</p>
      {hint && <p className="text-gray-400 text-xs mt-1">{hint}</p>}
    </div>
  )
}
