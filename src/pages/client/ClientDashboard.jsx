import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { useClient } from '../../contexts/ClientAuthContext'
import { supabase, formatTZS, formatDate } from '../../lib/supabase'
import {
  Truck, ClipboardList, FileText, ArrowRight,
  Clock, CheckCircle2, Wrench, AlertTriangle
} from 'lucide-react'

export default function ClientDashboard() {
  const { t } = useLanguage()
  const { customer } = useClient()
  const [stats, setStats] = useState({ vehicles: 0, activeJobs: 0, pendingInvoices: 0 })
  const [activeServices, setActiveServices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (customer?.id) fetchData()
  }, [customer?.id])

  const fetchData = async () => {
    try {
      const [vehiclesRes, jobsRes, invoicesRes] = await Promise.all([
        supabase.from('vehicles').select('id').eq('customer_id', customer.id),
        supabase.from('job_cards').select('*, vehicles(registration_number, make, model)')
          .eq('customer_id', customer.id)
          .in('status', ['open', 'in_progress', 'waiting_parts', 'pre_job_card', 'pending_approval'])
          .order('created_at', { ascending: false }),
        supabase.from('invoices').select('id')
          .eq('customer_id', customer.id)
          .in('status', ['draft', 'sent', 'approved']),
      ])

      setStats({
        vehicles: vehiclesRes.data?.length || 0,
        activeJobs: jobsRes.data?.length || 0,
        pendingInvoices: invoicesRes.data?.length || 0,
      })
      setActiveServices(jobsRes.data?.slice(0, 5) || [])
    } catch (err) {
      console.error('Dashboard error:', err)
    } finally {
      setLoading(false)
    }
  }

  const statusConfig = {
    pre_job_card: { icon: ClipboardList, color: 'text-purple-600', bg: 'bg-purple-100' },
    pending_approval: { icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-100' },
    open: { icon: Clock, color: 'text-blue-600', bg: 'bg-blue-100' },
    in_progress: { icon: Wrench, color: 'text-yellow-600', bg: 'bg-yellow-100' },
    waiting_parts: { icon: Clock, color: 'text-orange-600', bg: 'bg-orange-100' },
    completed: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100' },
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Welcome */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-600 rounded-2xl p-5 text-white">
        <h1 className="text-lg font-bold">
          {t('client.dashboard.welcome')}, {customer?.full_name?.split(' ')[0]}!
        </h1>
        <p className="text-blue-100 text-sm mt-1">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Link to="/client/vehicles" className="bg-white rounded-xl p-4 border border-gray-200 text-center hover:shadow-md transition-shadow">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-2">
            <Truck className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.vehicles}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">{t('client.dashboard.vehicles')}</p>
        </Link>
        <Link to="/client/services" className="bg-white rounded-xl p-4 border border-gray-200 text-center hover:shadow-md transition-shadow">
          <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center mx-auto mb-2">
            <ClipboardList className="w-5 h-5 text-yellow-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.activeJobs}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">{t('client.dashboard.activeServices')}</p>
        </Link>
        <Link to="/client/invoices" className="bg-white rounded-xl p-4 border border-gray-200 text-center hover:shadow-md transition-shadow">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-2">
            <FileText className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.pendingInvoices}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">{t('client.dashboard.pendingInvoices')}</p>
        </Link>
      </div>

      {/* Active Services */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{t('client.dashboard.activeServicesTitle')}</h2>
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
    </div>
  )
}
