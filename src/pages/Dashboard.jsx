import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase, formatTZS, formatDate } from '../lib/supabase'
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  UserCheck,
} from 'lucide-react'

export default function Dashboard() {
  const { t } = useLanguage()
  const { profile, canViewInternal } = useAuth()
  const [stats, setStats] = useState({
    openJobs: 0,
    inProgress: 0,
    completedToday: 0,
    totalRevenue: 0,
    pendingApprovals: 0,
    customerRequests: 0,
  })
  const [recentJobs, setRecentJobs] = useState([])
  const [lowStock, setLowStock] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      // Fetch job stats
      const { data: jobs } = await supabase
        .from('job_cards')
        .select('status, created_at')

      const today = new Date().toISOString().split('T')[0]

      const { count: pendingCount } = await supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')

      const customerRequestCount = jobs?.filter(j => j.status === 'customer_request').length || 0

      setStats({
        openJobs: jobs?.filter(j => j.status === 'open').length || 0,
        inProgress: jobs?.filter(j => j.status === 'in_progress').length || 0,
        completedToday: jobs?.filter(j => j.status === 'completed' && j.date_completed?.startsWith(today)).length || 0,
        totalRevenue: 0,
        pendingApprovals: pendingCount || 0,
        customerRequests: customerRequestCount,
      })

      // Fetch recent jobs
      const { data: recent } = await supabase
        .from('job_cards')
        .select('*, customers(full_name), vehicles(registration_number, make)')
        .order('created_at', { ascending: false })
        .limit(5)
      setRecentJobs(recent || [])

      // Fetch low stock parts
      const { data: parts } = await supabase
        .from('parts')
        .select('*')
        .lt('quantity_in_stock', 5)
        .eq('is_active', true)
        .limit(5)
      setLowStock(parts || [])

      // Fetch revenue (paid invoices)
      if (canViewInternal) {
        const { data: invoices } = await supabase
          .from('invoices')
          .select('total_amount')
          .eq('status', 'paid')
          .eq('invoice_type', 'final')
        const revenue = invoices?.reduce((sum, inv) => sum + Number(inv.total_amount), 0) || 0
        setStats(prev => ({ ...prev, totalRevenue: revenue }))
      }
    } catch (err) {
      console.error('Dashboard error:', err)
    } finally {
      setLoading(false)
    }
  }

  const colorMap = {
    blue: { bg: 'bg-blue-100', text: 'text-blue-600' },
    yellow: { bg: 'bg-yellow-100', text: 'text-yellow-600' },
    green: { bg: 'bg-green-100', text: 'text-green-600' },
    purple: { bg: 'bg-purple-100', text: 'text-purple-600' },
  }

  const statCards = [
    { label: t('dashboard.openJobs'), value: stats.openJobs, icon: ClipboardList, color: 'blue', to: '/admin/job-cards?status=open' },
    { label: t('dashboard.inProgress'), value: stats.inProgress, icon: Clock, color: 'yellow', to: '/admin/job-cards?status=in_progress' },
    { label: t('dashboard.completedToday'), value: stats.completedToday, icon: CheckCircle2, color: 'green', to: '/admin/job-cards?status=completed' },
    ...(canViewInternal ? [{ label: t('dashboard.totalRevenue'), value: formatTZS(stats.totalRevenue), icon: TrendingUp, color: 'purple', to: '/admin/reports' }] : []),
    ...(stats.pendingApprovals > 0 ? [{ label: t('dashboard.pendingApprovals'), value: stats.pendingApprovals, icon: UserCheck, color: 'orange', to: '/admin/customers' }] : []),
  ]

  const colorMapExtra = {
    orange: { bg: 'bg-orange-100', text: 'text-orange-600' },
  }

  const statusColors = {
    open: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    waiting_parts: 'bg-orange-100 text-orange-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
    customer_request: 'bg-pink-100 text-pink-700',
    pre_job_card: 'bg-purple-100 text-purple-700',
    pending_approval: 'bg-orange-100 text-orange-700',
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
          {t('dashboard.welcome')}, {profile?.full_name?.split(' ')[0] || 'User'}! 👋
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Link
            key={card.label}
            to={card.to}
            className="bg-white rounded-xl p-5 border border-gray-200 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{card.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {typeof card.value === 'number' ? card.value : card.value}
                </p>
              </div>
              <div className={`w-12 h-12 rounded-xl ${(colorMap[card.color] || colorMapExtra[card.color]).bg} flex items-center justify-center`}>
                <card.icon className={`w-6 h-6 ${(colorMap[card.color] || colorMapExtra[card.color]).text}`} />
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Jobs */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">{t('dashboard.recentJobs')}</h2>
            <Link to="/admin/job-cards" className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {recentJobs.length === 0 ? (
              <p className="p-5 text-gray-500 text-sm">{t('common.noData')}</p>
            ) : (
              recentJobs.map((job) => (
                <Link key={job.id} to={`/admin/job-cards/${job.id}`} className="flex items-center justify-between p-4 hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{job.job_number}</p>
                    <p className="text-xs text-gray-500">
                      {job.vehicles?.registration_number} • {job.customers?.full_name}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[job.status]}`}>
                    {t(`jobs.statuses.${job.status}`)}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Low Stock Alert */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              {t('dashboard.lowStock')}
            </h2>
            <Link to="/admin/inventory" className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {lowStock.length === 0 ? (
              <p className="p-5 text-gray-500 text-sm">{t('common.noData')}</p>
            ) : (
              lowStock.map((part) => (
                <div key={part.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{part.name}</p>
                    <p className="text-xs text-gray-500">{part.category}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    part.quantity_in_stock === 0 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                  }`}>
                    {part.quantity_in_stock} {part.unit}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
