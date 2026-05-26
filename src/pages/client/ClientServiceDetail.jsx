import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase, formatTZS, formatDate } from '../../lib/supabase'
import {
  ArrowLeft, CheckCircle2, XCircle, AlertTriangle, Clock,
  Wrench, ClipboardCheck, Phone
} from 'lucide-react'
import toast from 'react-hot-toast'

export default function ClientServiceDetail() {
  const { id } = useParams()
  const { t } = useLanguage()
  const [jobCard, setJobCard] = useState(null)
  const [inspection, setInspection] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [id])

  const fetchData = async () => {
    try {
      const { data: jc } = await supabase
        .from('job_cards')
        .select('*, customers(full_name, phone), vehicles(registration_number, make, model, year)')
        .eq('id', id)
        .single()

      if (!jc) { setLoading(false); return }
      setJobCard(jc)

      if (jc.inspection_id) {
        const [inspRes, itemsRes] = await Promise.all([
          supabase.from('inspections').select('*').eq('id', jc.inspection_id).single(),
          supabase.from('inspection_items').select('*').eq('inspection_id', jc.inspection_id).order('sort_order'),
        ])
        setInspection(inspRes.data)
        setItems(itemsRes.data || [])
      }
    } catch (err) {
      console.error('Service detail error:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleApproval = async (itemId, approved) => {
    try {
      await supabase.from('inspection_items').update({ customer_approved: approved }).eq('id', itemId)
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, customer_approved: approved } : i))
      toast.success(approved ? t('customerView.approved') : t('customerView.declined'))
    } catch {
      toast.error(t('customerView.failedUpdate'))
    }
  }

  const approveAll = async () => {
    const inspectionId = inspection?.id || jobCard?.inspection_id
    if (!inspectionId) return
    try {
      await supabase.from('inspection_items').update({ customer_approved: true }).eq('inspection_id', inspectionId)
      setItems(prev => prev.map(i => ({ ...i, customer_approved: true })))
      toast.success(t('customerView.allApproved'))
    } catch {
      toast.error(t('customerView.failedUpdate'))
    }
  }

  const severityColors = {
    low: { bg: 'bg-gray-100', text: 'text-gray-600' },
    medium: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
    high: { bg: 'bg-orange-100', text: 'text-orange-700' },
    critical: { bg: 'bg-red-100', text: 'text-red-700' },
  }

  const isPreJobCard = jobCard?.status === 'pre_job_card' || jobCard?.status === 'pending_approval'
  const canApprove = isPreJobCard || (inspection && inspection.status === 'completed')
  const totalEstimated = items.reduce((s, i) => s + Number(i.estimated_cost || 0), 0)
  const approvedCount = items.filter(i => i.customer_approved === true).length
  const approvedTotal = items.filter(i => i.customer_approved === true).reduce((s, i) => s + Number(i.estimated_cost || 0), 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (!jobCard) {
    return (
      <div className="text-center py-12">
        <XCircle className="w-12 h-12 text-red-300 mx-auto mb-3" />
        <p className="text-gray-500">{t('client.services.notFound')}</p>
        <Link to="/client/services" className="text-blue-600 text-sm mt-2 inline-block">{t('common.back')}</Link>
      </div>
    )
  }

  const vehicle = jobCard.vehicles
  const progressSteps = [
    { label: t('customerView.stepInspection'), done: true },
    { label: t('customerView.stepApproved'), done: !isPreJobCard },
    { label: t('customerView.stepInProgress'), done: jobCard.status === 'in_progress' || jobCard.status === 'completed' },
    { label: t('customerView.stepDone'), done: jobCard.status === 'completed' },
  ]

  return (
    <div className="space-y-4">
      {/* Back */}
      <Link to="/client/services" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> {t('common.back')}
      </Link>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-lg font-bold text-gray-900">{jobCard.job_number}</p>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            jobCard.status === 'completed' ? 'bg-green-100 text-green-700' :
            jobCard.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700' :
            isPreJobCard ? 'bg-purple-100 text-purple-700' :
            'bg-blue-100 text-blue-700'
          }`}>
            {t(`jobs.statuses.${jobCard.status}`)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-gray-400 text-xs">{t('customerView.vehicle')}</p>
            <p className="font-medium text-gray-900">{vehicle?.registration_number}</p>
            <p className="text-xs text-gray-500">{vehicle?.make} {vehicle?.model}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs">{t('jobs.dateIn')}</p>
            <p className="font-medium text-gray-900">{formatDate(jobCard.created_at)}</p>
          </div>
        </div>
      </div>

      {/* Progress */}
      {!isPreJobCard && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-3 text-sm">{t('customerView.repairProgress')}</h3>
          <div className="flex items-center justify-between">
            {progressSteps.map((step, idx) => (
              <div key={idx} className="flex flex-col items-center gap-1 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  step.done ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'
                }`}>{idx + 1}</div>
                <span className={`text-[10px] text-center leading-tight ${step.done ? 'text-green-700 font-medium' : 'text-gray-400'}`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Customer Complaint */}
      {(inspection?.description || jobCard.description) && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-xs font-semibold text-gray-400 mb-1">{t('customerView.yourComplaint')}</h3>
          <p className="text-sm text-gray-800">{inspection?.description || jobCard.description}</p>
        </div>
      )}

      {/* Inspection Findings */}
      {items.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">{t('customerView.inspectionFindings')}</h3>
                <p className="text-xs text-gray-500">{items.length} {t('customerView.issuesFound')}</p>
              </div>
              {canApprove && (
                <button onClick={approveAll}
                  className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 active:scale-95 transition">
                  {t('customerView.approveAll')}
                </button>
              )}
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {items.map((item, idx) => {
              const sev = severityColors[item.severity] || severityColors.medium
              return (
                <div key={item.id} className={`p-4 ${
                  item.customer_approved === true ? 'bg-green-50/40' :
                  item.customer_approved === false ? 'bg-red-50/40' : ''
                }`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-bold text-gray-400">#{idx + 1}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sev.bg} ${sev.text}`}>
                          {(item.severity === 'high' || item.severity === 'critical') && (
                            <AlertTriangle className="w-3 h-3 inline mr-0.5" />
                          )}
                          {t(`inspection.severities.${item.severity}`)}
                        </span>
                        {item.customer_approved === true && (
                          <span className="text-xs text-green-600 font-medium flex items-center gap-0.5">
                            <CheckCircle2 className="w-3 h-3" /> {t('customerView.approved')}
                          </span>
                        )}
                        {item.customer_approved === false && (
                          <span className="text-xs text-red-600 font-medium flex items-center gap-0.5">
                            <XCircle className="w-3 h-3" /> {t('customerView.declined')}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-gray-900">{item.problem_description}</p>
                      {item.recommended_action && (
                        <p className="text-xs text-blue-600 mt-1">{t('customerView.recommended')}: {item.recommended_action}</p>
                      )}
                    </div>

                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-gray-900 mb-2">{formatTZS(item.estimated_cost)}</p>
                      {canApprove && (
                        <div className="flex gap-1.5">
                          <button onClick={() => toggleApproval(item.id, true)}
                            className={`p-2 rounded-lg transition active:scale-95 ${
                              item.customer_approved === true
                                ? 'bg-green-600 text-white shadow-sm'
                                : 'bg-gray-100 text-gray-400 hover:bg-green-50 hover:text-green-600'
                            }`}>
                            <CheckCircle2 className="w-5 h-5" />
                          </button>
                          <button onClick={() => toggleApproval(item.id, false)}
                            className={`p-2 rounded-lg transition active:scale-95 ${
                              item.customer_approved === false
                                ? 'bg-red-600 text-white shadow-sm'
                                : 'bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-red-600'
                            }`}>
                            <XCircle className="w-5 h-5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Summary */}
          <div className="p-4 bg-gray-50 border-t border-gray-200">
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-gray-500">{t('customerView.totalEstimated')}</span>
              <span className="font-medium">{formatTZS(totalEstimated)}</span>
            </div>
            {approvedCount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-green-700 font-medium">{t('customerView.approvedItems')} ({approvedCount})</span>
                <span className="font-bold text-green-700">{formatTZS(approvedTotal)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contact */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
        <p className="text-xs text-gray-500 mb-2">{t('customerView.contactQuestion')}</p>
        <a href="tel:+255123456789" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 active:scale-95 transition">
          <Phone className="w-4 h-4" /> {t('customerView.callUs')}
        </a>
      </div>
    </div>
  )
}
