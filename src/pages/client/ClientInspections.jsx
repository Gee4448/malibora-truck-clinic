import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { useClient } from '../../contexts/ClientAuthContext'
import { supabase, formatTZS, formatDate } from '../../lib/supabase'
import { ClipboardCheck, ArrowRight, AlertTriangle, Plus, Clock } from 'lucide-react'
import { ListSkeleton } from '../../components/common/Skeleton'

// The customer's own inspection reports. Until now these were visible on the
// dashboard as a dead-end list — no link, and the "Inspections" stat card
// pointed at /client/services. This is the real destination.
export default function ClientInspections() {
  const { t } = useLanguage()
  const { customer } = useClient()
  const [inspections, setInspections] = useState([])
  const [pendingIds, setPendingIds] = useState(new Set())
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (customer?.id) fetchInspections()
  }, [customer?.id])

  const fetchInspections = async () => {
    try {
      const { data } = await supabase
        .from('inspections')
        .select('*, vehicles(registration_number, make, model)')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })

      const list = data || []
      setInspections(list)

      // Flag the reports still waiting on the customer, so the list can nudge
      // them rather than making them open each one to find out.
      if (list.length > 0) {
        const { data: items } = await supabase
          .from('inspection_items')
          .select('inspection_id, customer_approved')
          .in('inspection_id', list.map(i => i.id))
        const waiting = new Set(
          (items || [])
            .filter(i => i.customer_approved === null)
            .map(i => i.inspection_id)
        )
        setPendingIds(waiting)
      }
    } catch (err) {
      console.error('Inspections error:', err)
    } finally {
      setLoading(false)
    }
  }

  const statusConfig = {
    // 'requested' = the customer raised it from here and the garage has not
    // named a fee yet (migration 022). Deliberately not amber like
    // pending_payment: nothing is owed until staff quote it.
    requested: { color: 'text-gray-600', bg: 'bg-gray-100', border: 'border-gray-200' },
    pending_payment: { color: 'text-amber-600', bg: 'bg-amber-100', border: 'border-amber-200' },
    paid: { color: 'text-blue-600', bg: 'bg-blue-100', border: 'border-blue-200' },
    in_progress: { color: 'text-yellow-600', bg: 'bg-yellow-100', border: 'border-yellow-200' },
    completed: { color: 'text-green-600', bg: 'bg-green-100', border: 'border-green-200' },
    cancelled: { color: 'text-gray-500', bg: 'bg-gray-100', border: 'border-gray-200' },
  }

  const filtered = filter === 'awaiting'
    ? inspections.filter(i => pendingIds.has(i.id))
    : filter === 'completed'
    ? inspections.filter(i => i.status === 'completed')
    : inspections

  if (loading) return <ListSkeleton rows={4} />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-gray-900">{t('client.inspections.title')}</h1>
        <Link
          to="/client/new-request?type=inspection"
          className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-700 text-white rounded-xl text-sm font-medium hover:bg-blue-800 active:scale-[0.98] transition shrink-0"
        >
          <Plus className="w-4 h-4" />
          {t('client.inspections.requestNew')}
        </Link>
      </div>

      <div className="flex gap-2">
        {['all', 'awaiting', 'completed'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors cursor-pointer ${
              filter === f
                ? 'bg-blue-700 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t(`client.inspections.filter.${f}`)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">{t('client.inspections.empty')}</p>
          <Link
            to="/client/new-request?type=inspection"
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-700 text-white rounded-xl text-sm font-medium hover:bg-blue-800 transition"
          >
            <Plus className="w-4 h-4" />
            {t('client.inspections.requestNew')}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((insp) => {
            const cfg = statusConfig[insp.status] || statusConfig.in_progress
            const needsYou = pendingIds.has(insp.id)
            return (
              <Link
                key={insp.id}
                to={`/client/inspections/${insp.id}`}
                className={`block bg-white rounded-xl border ${cfg.border} p-4 hover:shadow-md active:scale-[0.99] transition`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
                    <ClipboardCheck className={`w-5 h-5 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-gray-900 text-sm">{insp.inspection_number}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.color}`}>
                        {t(`inspection.statuses.${insp.status}`)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {insp.vehicles?.registration_number} — {insp.vehicles?.make} {insp.vehicles?.model}
                    </p>
                    {insp.status === 'requested' ? (
                      <p className="text-xs text-gray-500 font-medium mt-1.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {t('client.inspections.awaitingQuote')}
                      </p>
                    ) : needsYou && (
                      <p className="text-xs text-orange-600 font-medium mt-1.5 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {t('client.inspections.needsYourReply')}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1.5">
                      {formatDate(insp.created_at)}
                      {Number(insp.payment_amount) > 0 && ` · ${formatTZS(insp.payment_amount)}`}
                    </p>
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
