import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { useMechanic } from '../../contexts/MechanicAuthContext'
import { supabase, formatDate } from '../../lib/supabase'
import { Truck, ClipboardList, ArrowRight, CheckCircle2, Wrench } from 'lucide-react'

const ACTIVE = ['customer_request', 'pre_job_card', 'pending_approval', 'open', 'in_progress', 'waiting_parts']

export default function MechanicJobs() {
  const { t } = useLanguage()
  const { mechanic } = useMechanic()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('active')

  useEffect(() => {
    if (mechanic?.id) fetchJobs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mechanic?.id])

  const fetchJobs = async () => {
    try {
      const { data } = await supabase.rpc('mechanic_jobs', { p_mechanic_id: mechanic.id })
      setJobs(data || [])
    } catch (err) {
      console.error('Mechanic jobs error:', err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = filter === 'active'
    ? jobs.filter(j => ACTIVE.includes(j.status))
    : jobs.filter(j => j.status === 'completed')

  const statusColors = {
    open: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    waiting_parts: 'bg-orange-100 text-orange-700',
    pre_job_card: 'bg-purple-100 text-purple-700',
    pending_approval: 'bg-orange-100 text-orange-700',
    customer_request: 'bg-pink-100 text-pink-700',
    completed: 'bg-green-100 text-green-700',
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-900">{t('mechanic.jobs.title')}</h1>
        <p className="text-sm text-gray-500">{t('mechanic.jobs.subtitle')}</p>
      </div>

      <div className="flex gap-2">
        {['active', 'completed'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              filter === f ? 'bg-slate-800 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t(`mechanic.jobs.filter.${f}`)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">{t('mechanic.jobs.empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((job) => (
            <Link
              key={job.id}
              to={`/mechanic/jobs/${job.id}`}
              className="block bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md active:scale-[0.99] transition"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Wrench className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Truck className="w-3.5 h-3.5 text-gray-400" />
                    <p className="text-sm font-bold text-gray-900 truncate">
                      {job.registration_number} — {job.make} {job.model || ''}
                    </p>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                    <ClipboardList className="w-3 h-3" /> {job.job_number} · {formatDate(job.created_at)}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[job.status] || 'bg-gray-100 text-gray-600'}`}>
                  {t(`jobs.statuses.${job.status}`)}
                </span>
                <ArrowRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
