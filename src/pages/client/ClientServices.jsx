import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { useClient } from '../../contexts/ClientAuthContext'
import { supabase, formatDate } from '../../lib/supabase'
import {
  ClipboardList, Clock, CheckCircle2, Wrench,
  AlertTriangle, XCircle, ArrowRight, Send
} from 'lucide-react'

export default function ClientServices() {
  const { t } = useLanguage()
  const { customer } = useClient()
  const [jobs, setJobs] = useState([])
  const [filter, setFilter] = useState('active')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (customer?.id) fetchJobs()
  }, [customer?.id])

  const fetchJobs = async () => {
    try {
      const { data } = await supabase
        .from('job_cards')
        .select('*, vehicles(registration_number, make, model)')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
      setJobs(data || [])
    } catch (err) {
      console.error('Services error:', err)
    } finally {
      setLoading(false)
    }
  }

  const activeStatuses = ['customer_request', 'open', 'in_progress', 'waiting_parts', 'pre_job_card', 'pending_approval']
  const filtered = filter === 'active'
    ? jobs.filter(j => activeStatuses.includes(j.status))
    : filter === 'completed'
    ? jobs.filter(j => j.status === 'completed')
    : jobs

  const statusConfig = {
    customer_request: { icon: Send, color: 'text-pink-600', bg: 'bg-pink-100', border: 'border-pink-200' },
    pre_job_card: { icon: ClipboardList, color: 'text-purple-600', bg: 'bg-purple-100', border: 'border-purple-200' },
    pending_approval: { icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-100', border: 'border-orange-200' },
    open: { icon: Clock, color: 'text-blue-600', bg: 'bg-blue-100', border: 'border-blue-200' },
    in_progress: { icon: Wrench, color: 'text-yellow-600', bg: 'bg-yellow-100', border: 'border-yellow-200' },
    waiting_parts: { icon: Clock, color: 'text-orange-600', bg: 'bg-orange-100', border: 'border-orange-200' },
    completed: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100', border: 'border-green-200' },
    cancelled: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-100', border: 'border-red-200' },
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-gray-900">{t('client.services.title')}</h1>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {['active', 'completed', 'all'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-blue-700 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t(`client.services.filter.${f}`)}
          </button>
        ))}
      </div>

      {/* Job List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">{t('client.services.noServices')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((job) => {
            const cfg = statusConfig[job.status] || statusConfig.open
            return (
              <Link
                key={job.id}
                to={`/client/services/${job.id}`}
                className={`block bg-white rounded-xl border ${cfg.border} p-4 hover:shadow-md active:scale-[0.99] transition`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
                    <cfg.icon className={`w-5 h-5 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-gray-900 text-sm">{job.job_number}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.color}`}>
                        {t(`jobs.statuses.${job.status}`)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {job.vehicles?.registration_number} — {job.vehicles?.make} {job.vehicles?.model}
                    </p>
                    {job.description && (
                      <p className="text-xs text-gray-400 mt-1 line-clamp-1">{job.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1.5">{formatDate(job.created_at)}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
