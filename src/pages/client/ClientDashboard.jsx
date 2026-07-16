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
    { to: '/client/vehicles', icon: Truck, iconBg: 'bg-blue-100', iconColor: 'text-blue-600', value: stats.vehicles, label: t('client.dashboard.vehicles') },
    { to: '/client/services', icon: ClipboardList, iconBg: 'bg-yellow-100', iconColor: 'text-yellow-600', value: stats.activeJobs, label: t('client.dashboard.activeServices') },
    { to: '/client/services', icon: ClipboardCheck, iconBg: 'bg-purple-100', iconColor: 'text-purple-600', value: stats.inspections, label: t('client.dashboard.inspections') },
    { to: '/client/invoices', icon: FileText, iconBg: 'bg-green-100', iconColor: 'text-green-600', value: stats.pendingInvoices, label: t('client.dashboard.pendingInvoices') },
  ]

  return (
    <div className="space-y-5 stagger-children">
      {/* Welcome */}
      <div className="relative overflow-hidden bg-gradient-to-r from-blue-800 via-blue-600 to-blue-700 animate-gradient rounded-2xl p-5 text-white">
        {/* decorative floating shapes */}
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10 animate-float pointer-events-none" />
        <div className="absolute -bottom-10 right-16 w-24 h-24 rounded-full bg-white/5 animate-float-delayed pointer-events-none" />
        <div className="relative">
          <h1 className="text-lg font-bold">
            {t('client.dashboard.welcome')}, {customer?.full_name?.split(' ')[0]}!
          </h1>
          <p className="text-blue-100 text-sm mt-1">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
      </div>

      {/* Report Problem Button */}
      <Link
        to="/client/new-request"
        className="card-lift flex items-center gap-3 bg-white rounded-xl border-2 border-dashed border-blue-300 p-4 hover:border-blue-500 hover:bg-blue-50"
      >
        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <Send className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <p className="font-semibold text-gray-900 text-sm">{t('client.dashboard.reportProblem')}</p>
          <p className="text-xs text-gray-500">{t('client.newRequest.requestType')}</p>
        </div>
        <ArrowRight className="w-4 h-4 text-gray-400 ml-auto" />
      </Link>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 stagger-children">
        {statCards.map((card, i) => (
          <Link key={i} to={card.to} className="card-lift bg-white rounded-xl p-4 border border-gray-200 text-center">
            <div className={`w-10 h-10 ${card.iconBg} rounded-xl flex items-center justify-center mx-auto mb-2`}>
              <card.icon className={`w-5 h-5 ${card.iconColor}`} />
            </div>
            <p className="text-2xl font-bold text-gray-900">
              <CountUp value={card.value} />
            </p>
            <p className="text-[10px] text-gray-500 mt-0.5">{card.label}</p>
          </Link>
        ))}
      </div>

      {/* Latest Invoice (if any) */}
      {latestInvoice && (
        <Link to={`/client/invoices/${latestInvoice.id}`}
          className="card-lift block bg-gradient-to-r from-green-600 to-emerald-600 animate-gradient rounded-xl p-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-green-100">{t('client.dashboard.latestInvoice')}</p>
              <p className="text-lg font-bold mt-0.5">{latestInvoice.invoice_number}</p>
              <p className="text-sm text-green-100">{formatTZS(latestInvoice.total_amount)} · {t(`invoices.statuses.${latestInvoice.status}`)}</p>
            </div>
            <ArrowRight className="w-5 h-5 text-white/80" />
          </div>
        </Link>
      )}

      {/* Active Services / Job Cards */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{t('client.dashboard.jobCardsTitle')}</h2>
          {activeServices.length > 0 && (
            <Link to="/client/services" className="text-sm text-blue-600 flex items-center gap-1">
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
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{t('client.dashboard.inspectionsTitle')}</h2>
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
                <div key={insp.id} className="flex items-center gap-3 p-4">
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
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
