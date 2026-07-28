import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import { useNotifications } from '../hooks/useNotifications'
import { supabase, formatDate, formatDateTime } from '../lib/supabase'
import {
  ClipboardCheck,
  ClipboardList,
  HandMetal,
  Send,
  Clock,
  CheckCircle2,
  ArrowRight,
  MessageSquare,
  Handshake,
  CreditCard,
  FileText,
  CheckCheck,
  Wrench,
  Truck,
} from 'lucide-react'

// Status alias groups — mirrored on the destination pages so the deep-links
// stay in sync. Keep these in lock-step with Inspections.jsx / JobCards.jsx.
const INSPECTION_GROUPS = {
  requested: ['requested', 'pending_payment'],
  ongoing: ['paid', 'in_progress'],
  completed: ['completed'],
}
const JOB_GROUPS = {
  requested: ['customer_request', 'pre_job_card', 'pending_approval'],
  in_progress: ['open', 'in_progress', 'waiting_parts'],
}

// What the portal can raise, mapped to how it should look on the board. The
// bargaining types come first in the list because they are the ones that stall
// a job until somebody answers them.
const NOTIF_STYLES = {
  inspection_bargain: { Icon: Handshake, color: 'text-amber-700', bg: 'bg-amber-100' },
  invoice_bargain: { Icon: Handshake, color: 'text-amber-700', bg: 'bg-amber-100' },
  inspection_request: { Icon: ClipboardCheck, color: 'text-orange-700', bg: 'bg-orange-100' },
  inspection_decision: { Icon: CheckCircle2, color: 'text-green-700', bg: 'bg-green-100' },
  payment_declared: { Icon: CreditCard, color: 'text-green-700', bg: 'bg-green-100' },
  inspection_payment_declared: { Icon: CreditCard, color: 'text-green-700', bg: 'bg-green-100' },
  proforma_request: { Icon: FileText, color: 'text-blue-700', bg: 'bg-blue-100' },
}

export default function Dashboard() {
  const { t } = useLanguage()
  const { profile } = useAuth()
  const [counts, setCounts] = useState({
    inspections: { requested: 0, ongoing: 0, completed: 0 },
    jobs: { requested: 0, in_progress: 0 },
    handovers: 0,
  })
  const [recentHandovers, setRecentHandovers] = useState([])
  const [loading, setLoading] = useState(true)
  // Same feed as the Header bell. It lives here too because the bell is a badge
  // you have to notice and click — a customer's counter-offer was sitting behind
  // it unread while the job waited.
  const { items: notifications, unreadCount, markAllRead, markRead } = useNotifications()
  const navigate = useNavigate()

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const countByGroup = (rows, statusField, groups) => {
    const out = {}
    for (const [key, statuses] of Object.entries(groups)) {
      out[key] = rows.filter((r) => statuses.includes(r[statusField])).length
    }
    return out
  }

  const fetchDashboardData = async () => {
    try {
      const [inspectionsRes, jobsRes, handoversRes] = await Promise.all([
        supabase.from('inspections').select('id, status'),
        supabase.from('job_cards').select('id, status'),
        supabase
          .from('handover_cards')
          .select('id, handover_number, handover_date, customers(full_name), vehicles(registration_number), job_cards(job_number)')
          .order('handover_date', { ascending: false })
          .limit(5),
      ])

      setCounts({
        inspections: countByGroup(inspectionsRes.data || [], 'status', INSPECTION_GROUPS),
        jobs: countByGroup(jobsRes.data || [], 'status', JOB_GROUPS),
        handovers: handoversRes.data?.length || 0,
      })
      setRecentHandovers(handoversRes.data || [])
    } catch (err) {
      console.error('Dashboard error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Same routing rule as the Header bell — keep the two in step.
  const openNotification = (notif) => {
    markRead(notif.id)
    if (notif.invoice_id) navigate(`/admin/invoices/${notif.invoice_id}`)
    else if (notif.job_card_id) navigate(`/admin/job-cards/${notif.job_card_id}`)
    else if (notif.inspection_id) navigate(`/admin/inspections/${notif.inspection_id}`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {t('dashboard.welcome')}, {profile?.full_name?.split(' ')[0] || 'User'}!
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Customer messages — negotiations, requests and declared payments.
          Sits above the counters because it is the only thing here that is
          waiting on a human reply. */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0 relative">
              <MessageSquare className="w-5 h-5 text-amber-600" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-gray-900">{t('dashboard.widgets.messages.title')}</h2>
              <p className="text-xs text-gray-500 truncate">{t('dashboard.widgets.messages.subtitle')}</p>
            </div>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1 flex-shrink-0 cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('dashboard.widgets.messages.markAllRead')}</span>
            </button>
          )}
        </div>
        <div className="divide-y divide-gray-100">
          {notifications.length === 0 ? (
            <div className="p-8 text-center">
              <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">{t('dashboard.widgets.messages.empty')}</p>
            </div>
          ) : (
            notifications.slice(0, 6).map((n) => {
              const style = NOTIF_STYLES[n.type] || { Icon: MessageSquare, color: 'text-gray-600', bg: 'bg-gray-100' }
              return (
                <button
                  key={n.id}
                  onClick={() => openNotification(n)}
                  className={`w-full text-left flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors cursor-pointer ${
                    n.is_read ? '' : 'bg-amber-50/40'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl ${style.bg} flex items-center justify-center flex-shrink-0`}>
                    <style.Icon className={`w-5 h-5 ${style.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{n.title}</p>
                    {n.body && <p className="text-xs text-gray-500 truncate">{n.body}</p>}
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:block">
                    {formatDateTime(n.created_at)}
                  </span>
                  {!n.is_read && <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />}
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Inspections Widget */}
      <WidgetCard
        icon={ClipboardCheck}
        iconColor="text-purple-600"
        iconBg="bg-purple-100"
        title={t('dashboard.widgets.inspections.title')}
        subtitle={t('dashboard.widgets.inspections.subtitle')}
        viewAllTo="/admin/inspections"
        viewAllLabel={t('dashboard.viewAll')}
        buttons={[
          {
            to: '/admin/inspections?status=requested',
            label: t('dashboard.widgets.inspections.requested'),
            count: counts.inspections.requested,
            Icon: Send,
            color: 'text-pink-700',
            bg: 'bg-pink-50 hover:bg-pink-100 border-pink-200',
          },
          {
            to: '/admin/inspections?status=ongoing',
            label: t('dashboard.widgets.inspections.ongoing'),
            count: counts.inspections.ongoing,
            Icon: Wrench,
            color: 'text-yellow-700',
            bg: 'bg-yellow-50 hover:bg-yellow-100 border-yellow-200',
          },
          {
            to: '/admin/inspections?status=completed',
            label: t('dashboard.widgets.inspections.completed'),
            count: counts.inspections.completed,
            Icon: CheckCircle2,
            color: 'text-green-700',
            bg: 'bg-green-50 hover:bg-green-100 border-green-200',
          },
        ]}
      />

      {/* Jobs Widget */}
      <WidgetCard
        icon={ClipboardList}
        iconColor="text-blue-600"
        iconBg="bg-blue-100"
        title={t('dashboard.widgets.jobs.title')}
        subtitle={t('dashboard.widgets.jobs.subtitle')}
        viewAllTo="/admin/job-cards"
        viewAllLabel={t('dashboard.viewAll')}
        buttons={[
          {
            to: '/admin/job-cards?status=requested',
            label: t('dashboard.widgets.jobs.requested'),
            count: counts.jobs.requested,
            Icon: Send,
            color: 'text-pink-700',
            bg: 'bg-pink-50 hover:bg-pink-100 border-pink-200',
          },
          {
            to: '/admin/job-cards?status=in_progress',
            label: t('dashboard.widgets.jobs.inProgress'),
            count: counts.jobs.in_progress,
            Icon: Clock,
            color: 'text-yellow-700',
            bg: 'bg-yellow-50 hover:bg-yellow-100 border-yellow-200',
          },
        ]}
      />

      {/* Handover Widget — customer reports for completed jobs */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-green-100 flex items-center justify-center">
              <HandMetal className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">{t('dashboard.widgets.handover.title')}</h2>
              <p className="text-xs text-gray-500">{t('dashboard.widgets.handover.subtitle')}</p>
            </div>
          </div>
          <Link to="/admin/handover" className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
            {t('dashboard.viewAll')} <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="divide-y divide-gray-100">
          {recentHandovers.length === 0 ? (
            <div className="p-8 text-center">
              <HandMetal className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">{t('dashboard.widgets.handover.empty')}</p>
            </div>
          ) : (
            recentHandovers.map((h) => (
              <Link
                key={h.id}
                to="/admin/handover"
                className="flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {h.handover_number} · {h.job_cards?.job_number}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {h.customers?.full_name} · <Truck className="w-3 h-3 inline" /> {h.vehicles?.registration_number}
                  </p>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(h.handover_date)}</span>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function WidgetCard({ icon: Icon, iconColor, iconBg, title, subtitle, viewAllTo, viewAllLabel, buttons }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between p-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-xl ${iconBg} flex items-center justify-center`}>
            <Icon className={`w-5 h-5 ${iconColor}`} />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">{title}</h2>
            <p className="text-xs text-gray-500">{subtitle}</p>
          </div>
        </div>
        <Link to={viewAllTo} className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
          {viewAllLabel} <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
        {buttons.map((b) => (
          <Link
            key={b.to}
            to={b.to}
            className={`flex items-center gap-3 p-4 rounded-xl border ${b.bg} transition-colors active:scale-[0.99]`}
          >
            <div className={`w-10 h-10 rounded-lg bg-white/70 flex items-center justify-center flex-shrink-0`}>
              <b.Icon className={`w-5 h-5 ${b.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${b.color}`}>{b.label}</p>
              <p className="text-2xl font-bold text-gray-900 leading-tight">{b.count}</p>
            </div>
            <ArrowRight className={`w-4 h-4 ${b.color} opacity-60`} />
          </Link>
        ))}
      </div>
    </div>
  )
}
