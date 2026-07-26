import { useState, useEffect } from 'react'
import { useLanguage } from '../../contexts/LanguageContext'
import { useClient } from '../../contexts/ClientAuthContext'
import { supabase, formatDate } from '../../lib/supabase'
import { ClipboardCheck, X, ArrowRight, ShieldCheck, Wrench, CalendarClock } from 'lucide-react'
import { ListSkeleton } from '../../components/common/Skeleton'

export default function ClientHandovers() {
  const { t } = useLanguage()
  const { customer } = useClient()
  const [handovers, setHandovers] = useState([])
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (customer?.id) fetchHandovers()
  }, [customer?.id])

  const fetchHandovers = async () => {
    try {
      const { data } = await supabase
        .from('handover_cards')
        .select('*, vehicles(registration_number, make, model), job_cards(job_number)')
        .eq('customer_id', customer.id)
        .order('handover_date', { ascending: false })
      setHandovers(data || [])
    } catch (err) {
      console.error('Handovers error:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <ListSkeleton rows={3} />

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-gray-900">{t('client.handovers.title')}</h1>

      {handovers.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">{t('client.handovers.empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {handovers.map((h) => (
            <button
              key={h.id}
              onClick={() => setDetail(h)}
              className="w-full text-left block bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md active:scale-[0.99] transition"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                  <ClipboardCheck className="w-5 h-5 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{h.handover_number}</p>
                  <p className="text-sm text-gray-600 mt-0.5">
                    {h.vehicles?.registration_number} — {h.vehicles?.make} {h.vehicles?.model}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">{formatDate(h.handover_date)}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Detail modal (read-only) */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{detail.handover_number}</h2>
                <p className="text-xs text-gray-500">{detail.vehicles?.registration_number} · {formatDate(detail.handover_date)}</p>
              </div>
              <button onClick={() => setDetail(null)} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-5 space-y-4 text-sm">
              {/* Work summary */}
              <div>
                <h3 className="text-xs font-semibold text-gray-400 mb-1 flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5" /> {t('handover.workSummary')}
                </h3>
                <p className="text-gray-800 whitespace-pre-line">{detail.work_summary}</p>
              </div>

              {detail.parts_summary && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 mb-1">{t('handover.partsUsed')}</h3>
                  <p className="text-gray-800 whitespace-pre-line">{detail.parts_summary}</p>
                </div>
              )}

              {detail.recommendations && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 mb-1">{t('handover.recommendations')}</h3>
                  <p className="text-gray-800 whitespace-pre-line">{detail.recommendations}</p>
                </div>
              )}

              {/* Vehicle out */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <p className="text-gray-400 text-xs">{t('handover.mileageOut')}</p>
                  <p className="font-medium text-gray-900">{detail.mileage_out ? `${detail.mileage_out.toLocaleString()} km` : '—'}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs">{t('handover.fuelLevelOut')}</p>
                  <p className="font-medium text-gray-900">{detail.fuel_level_out ? t(`fuelLevels.${detail.fuel_level_out}`) : '—'}</p>
                </div>
              </div>

              {/* Warranty */}
              <div className="bg-green-50 border border-green-100 rounded-xl p-3">
                <h3 className="text-xs font-semibold text-green-800 mb-2 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" /> {t('client.handovers.warranty')}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex justify-between">
                    <span className="text-green-700">{t('handover.partsWarranty')}</span>
                    <span className="font-medium text-green-900">{detail.warranty_parts_days} {t('handover.days')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-700">{t('handover.labourWarranty')}</span>
                    <span className="font-medium text-green-900">{detail.warranty_labour_days} {t('handover.days')}</span>
                  </div>
                </div>
              </div>

              {/* Next service */}
              {(detail.next_service_date || detail.next_service_mileage) && (
                <div className="flex items-center gap-2 text-gray-600">
                  <CalendarClock className="w-4 h-4 text-blue-600" />
                  <span>
                    {t('handover.nextService')}:{' '}
                    {detail.next_service_date ? formatDate(detail.next_service_date) : ''}
                    {detail.next_service_mileage ? ` · ${detail.next_service_mileage.toLocaleString()} km` : ''}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
