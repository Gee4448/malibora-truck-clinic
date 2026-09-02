import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { useClient } from '../../contexts/ClientAuthContext'
import { supabase, formatDate } from '../../lib/supabase'
import {
  ClipboardList, Clock, CheckCircle2, Wrench,
  AlertTriangle, XCircle, ArrowRight, Send
} from 'lucide-react'
import { ListSkeleton } from '../../components/common/Skeleton'
import Reveal from '../../components/common/Reveal'
import StatusTracker from '../../components/common/StatusTracker'
import { JOB_STAGE_KEYS, jobStage } from '../../lib/clientStages'

export default function ClientServices() {
  const { t } = useLanguage()
  const { customer } = useClient()
  const [jobs, setJobs] = useState([])
  const [filter, setFilter] = useState('active')
  const [loading, setLoading] = useState(true)
  // The last two stages of the customer track live in other tables, so they are
  // resolved once for the whole list rather than per row. See lib/clientStages.js.
  const [invoicedJobIds, setInvoicedJobIds] = useState(new Set())
  const [deliveredJobIds, setDeliveredJobIds] = useState(new Set())

  useEffect(() => {
    if (customer?.id) fetchJobs()
  }, [customer?.id])

  const fetchJobs = async () => {
    try {
      const [jobsRes, invoicesRes, handoversRes] = await Promise.all([
        supabase.from('job_cards')
          .select('*, vehicles(registration_number, make, model)')
          .eq('customer_id', customer.id)
          .order('created_at', { ascending: false }),
        supabase.from('invoices').select('job_card_id')
          .eq('customer_id', customer.id)
          .eq('invoice_type', 'final')
          .neq('status', 'cancelled'),
        supabase.from('handover_cards').select('job_card_id').eq('customer_id', customer.id),
      ])
      setJobs(jobsRes.data || [])
      setInvoicedJobIds(new Set((invoicesRes.data || []).map(i => i.job_card_id).filter(Boolean)))
      setDeliveredJobIds(new Set((handoversRes.data || []).map(h => h.job_card_id).filter(Boolean)))
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

  const jobSteps = JOB_STAGE_KEYS.map(k => ({ key: k, label: t(`client.dashboard.stages.${k}`) }))

  if (loading) {
    return <ListSkeleton rows={4} />
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
                ? 'bg-zinc-900 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t(`client.services.filter.${f}`)}
          </button>
        ))}
      </div>

      {/* Job List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">{t('client.services.noServices')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((job, i) => {
            const cfg = statusConfig[job.status] || statusConfig.open
            const stage = jobStage(job, {
              hasFinalInvoice: invoicedJobIds.has(job.id),
              hasHandover: deliveredJobIds.has(job.id),
            })
            return (
              <Reveal
                as={Link}
                key={job.id}
                delay={Math.min(i, 8) * 45}
                to={`/client/services/${job.id}`}
                className={`block bg-white rounded-2xl border ${cfg.border} p-4 hover:shadow-md active:scale-[0.99] transition`}
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
                {/* Same stage track the dashboard shows, so tapping "View all"
                    doesn't drop the customer into a list that has forgotten it. */}
                {!stage.cancelled && (
                  <StatusTracker className="mt-3" steps={jobSteps} current={stage.index} compact />
                )}
              </Reveal>
            )
          })}
        </div>
      )}
    </div>
  )
}
