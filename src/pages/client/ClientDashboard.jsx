import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { useClient } from '../../contexts/ClientAuthContext'
import { supabase, formatTZS, formatDate } from '../../lib/supabase'
import {
  Truck, ClipboardList, FileText, ArrowRight, ClipboardCheck,
  Clock, CheckCircle2, Wrench, AlertTriangle, Send
} from 'lucide-react'
import CountUp from '../../components/common/CountUp'
import { DashboardSkeleton } from '../../components/common/Skeleton'

export default function ClientDashboard() {
  const { t } = useLanguage()
  const { customer } = useClient()
  const [stats, setStats] = useState({ vehicles: 0, activeJobs: 0, pendingInvoices: 0, inspections: 0 })
  const [activeServices, setActiveServices] = useState([])
  const [recentInspections, setRecentInspections] = useState([])
  const [latestInvoice, setLatestInvoice] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (customer?.id) fetchData()
  }, [customer?.id])

  const fetchData = async () => {
    try {
      const [vehiclesRes, jobsRes, invoicesRes, inspectionsRes] = await Promise.all([
        supabase.from('vehicles').select('id').eq('customer_id', customer.id),
        supabase.from('job_cards').select('*, vehicles(registration_number, make, model)')
          .eq('customer_id', customer.id)
          .order('created_at', { ascending: false }),
        supabase.from('invoices').select('id, invoice_number, total_amount, status, created_at')
          .eq('customer_id', customer.id)
          .neq('invoice_type', 'internal')
          .order('created_at', { ascending: false }),
        supabase.from('inspections').select('*, vehicles(registration_number, make, model)')
          .eq('customer_id', customer.id)
          .order('created_at', { ascending: false }),
      ])

      const activeStatuses = ['customer_request', 'open', 'in_progress', 'waiting_parts', 'pre_job_card', 'pending_approval']
      const allJobs = jobsRes.data || []
      const active = allJobs.filter(j => activeStatuses.includes(j.status))
      const pendingInvoices = (invoicesRes.data || []).filter(i => ['draft', 'sent', 'approved', 'negotiating'].includes(i.status))

      setStats({
        vehicles: vehiclesRes.data?.length || 0,
        activeJobs: active.length,
        pendingInvoices: pendingInvoices.length,
        inspections: inspectionsRes.data?.length || 0,
      })
      setActiveServices(active.slice(0, 5))
      setRecentInspections((inspectionsRes.data || []).slice(0, 3))
      setLatestInvoice((invoicesRes.data || [])[0] || null)
    } catch (err) {
      console.error('Dashboard error:', err)
    } finally {
      setLoading(false)
    }
  }

  const statusConfig = {
    customer_request: { icon: Send, color: 'text-pink-600', bg: 'bg-pink-100' },
    pre_job_card: { icon: ClipboardList, color: 'text-purple-600', bg: 'bg-purple-100' },
    pending_approval: { icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-100' },
    open: { icon: Clock, color: 'text-blue-600', bg: 'bg-blue-100' },
    in_progress: { icon: Wrench, color: 'text-yellow-600', bg: 'bg-yellow-100' },
    waiting_parts: { icon: Clock, color: 'text-orange-600', bg: 'bg-orange-100' },
    completed: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100' },
  }

  const inspectionStatusConfig = {
    pending_payment: { color: 'text-amber-600', bg: 'bg-amber-100' },
    paid: { color: 'text-blue-600', bg: 'bg-blue-100' },
    in_progress: { color: 'text-yellow-600', bg: 'bg-yellow-100' },
    completed: { color: 'text-green-600', bg: 'bg-green-100' },
    cancelled: { color: 'text-gray-500', bg: 'bg-gray-100' },
  }

  if (loading) {
    return <DashboardSkeleton />
  }

  const statCards = [
    { to: '/client/vehicles', icon: Truck, value: stats.vehicles, label: t('client.dashboard.vehicles') },
    { to: '/client/services', icon: ClipboardList, value: stats.activeJobs, label: t('client.dashboard.activeServices') },
    { to: '/client/inspections', icon: ClipboardCheck, value: stats.inspections, label: t('client.dashboard.inspections') },
    { to: '/client/invoices', icon: FileText, value: stats.pendingInvoices, label: t('client.dashboard.pendingInvoices') },
  ]

  return (
    <div className="space-y-4 stagger-children">
      {/* Greeting hero — brand orange, big rounded */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-500 to-blue-700 animate-gradient rounded-3xl p-6 text-white">
        <div className="absolute -top-10 -right-6 w-36 h-36 rounded-full bg-white/10 animate-float pointer-events-none" />
        <div className="absolute -bottom-12 right-20 w-24 h-24 rounded-full bg-white/5 animate-float-delayed pointer-events-none" />
        <div className="relative">
          <p className="text-blue-100 text-xs font-medium">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="text-2xl font-bold mt-1 leading-tight">
            {t('client.dashboard.welcome')}, {customer?.full_name?.split(' ')[0]} <span className="inline-block">👋</span>
          </h1>
        </div>
      </div>

      {/* Primary CTA — dark tile, Report a problem */}
      <Link
        to="/client/new-request"
        className="card-lift flex items-center gap-4 bg-zinc-900 rounded-3xl p-5 text-white"
      >
        <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center flex-shrink-0">
          <Send className="w-6 h-6 text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-base">{t('client.dashboard.reportProblem')}</p>
          <p className="text-sm text-zinc-400 truncate">{t('client.newRequest.requestType')}</p>
        </div>
        <div className="ml-auto w-9 h-9 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
          <ArrowRight className="w-4 h-4 text-white" />
        </div>
      </Link>

      {/* Bento stats — dark tiles with big orange numbers */}
      <div className="grid grid-cols-2 gap-3 stagger-children">
        {statCards.map((card, i) => (
          <Link key={i} to={card.to}
            className="card-lift relative bg-zinc-900 rounded-3xl p-4 text-white overflow-hidden">
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center">
                <card.icon className="w-5 h-5 text-blue-400" />
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-600" />
            </div>
            <p className="text-3xl font-bold mt-3 text-blue-400">
              <CountUp value={card.value} />
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">{card.label}</p>
          </Link>
        ))}
      </div>

      {/* Latest Invoice (if any) — dark feature tile with orange accent */}
      {latestInvoice && (
        <Link to={`/client/invoices/${latestInvoice.id}`}
          className="card-lift block bg-zinc-900 rounded-3xl p-5 text-white">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">{t('client.dashboard.latestInvoice')}</p>
              <p className="text-lg font-bold mt-0.5">{latestInvoice.invoice_number}</p>
              <p className="text-sm text-zinc-300">
                <span className="text-blue-400 font-semibold">{formatTZS(latestInvoice.total_amount)}</span>
                {' · '}{t(`invoices.statuses.${latestInvoice.status}`)}
              </p>
            </div>
            <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
              <ArrowRight className="w-4 h-4 text-white" />
            </div>
          </div>
        </Link>
      )}

      {/* Active Services / Job Cards */}
      <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between p-4 pb-3">
          <h2 className="font-bold text-gray-900">{t('client.dashboard.jobCardsTitle')}</h2>
          {activeServices.length > 0 && (
            <Link to="/client/services" className="text-sm text-blue-600 font-medium flex items-center gap-1">
              {t('client.dashboard.viewAll')} <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>
        <div className="divide-y divide-gray-100">
          {activeServices.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">{t('client.dashboard.noActiveServices')}</p>
              <p className="text-gray-400 text-xs mt-1">{t('client.dashboard.allGood')}</p>
            </div>
          ) : (
            activeServices.map((job) => {
              const cfg = statusConfig[job.status] || statusConfig.open
              return (
                <Link
                  key={job.id}
                  to={`/client/services/${job.id}`}
                  className="flex items-center gap-3 p-4 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  <div className={`w-10 h-10 rounded-xl ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
                    <cfg.icon className={`w-5 h-5 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {job.vehicles?.registration_number} — {job.vehicles?.make} {job.vehicles?.model}
                    </p>
                    <p className="text-xs text-gray-500">{job.job_number} · {formatDate(job.created_at)}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${cfg.bg} ${cfg.color}`}>
                    {t(`jobs.statuses.${job.status}`)}
                  </span>
                </Link>
              )
            })
          )}
        </div>
      </div>

      {/* Inspection Reports */}
      <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between p-4 pb-3">
          <h2 className="font-bold text-gray-900">{t('client.dashboard.inspectionsTitle')}</h2>
          {recentInspections.length > 0 && (
            <Link to="/client/inspections" className="text-sm text-blue-600 font-medium flex items-center gap-1">
              {t('client.dashboard.viewAll')} <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>
        <div className="divide-y divide-gray-100">
          {recentInspections.length === 0 ? (
            <div className="p-8 text-center">
              <ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">{t('client.dashboard.noInspections')}</p>
            </div>
          ) : (
            recentInspections.map((insp) => {
              const cfg = inspectionStatusConfig[insp.status] || inspectionStatusConfig.in_progress
              return (
                <Link
                  key={insp.id}
                  to={`/client/inspections/${insp.id}`}
                  className="flex items-center gap-3 p-4 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  <div className={`w-10 h-10 rounded-xl ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
                    <ClipboardCheck className={`w-5 h-5 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {insp.inspection_number}
                    </p>
                    <p className="text-xs text-gray-500">
                      {insp.vehicles?.registration_number} · {formatDate(insp.created_at)}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${cfg.bg} ${cfg.color}`}>
                    {t(`inspection.statuses.${insp.status}`)}
                  </span>
                </Link>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
