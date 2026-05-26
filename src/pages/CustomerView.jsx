import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext'
import { supabase, formatTZS, formatDate } from '../lib/supabase'
import {
  Truck, CheckCircle2, XCircle, AlertTriangle, Clock,
  ClipboardCheck, Wrench, Phone, CreditCard, Globe
} from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'

export default function CustomerView() {
  const { token } = useParams()
  const { t, locale, switchLanguage } = useLanguage()
  const [data, setData] = useState(null)
  const [items, setItems] = useState([])
  const [jobCard, setJobCard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => { fetchData() }, [token])

  const fetchData = async () => {
    try {
      // Try to find an inspection with this ID
      const { data: inspection, error: inspErr } = await supabase
        .from('inspections')
        .select(`*, customers(full_name, phone), vehicles(registration_number, make, model, year)`)
        .eq('id', token)
        .single()

      if (inspErr) {
        // Try as a job card
        const { data: jc, error: jcErr } = await supabase
          .from('job_cards')
          .select(`*, customers(full_name, phone), vehicles(registration_number, make, model, year)`)
          .eq('id', token)
          .single()
        if (jcErr) throw new Error('Record not found')

        setJobCard(jc)
        // Fetch inspection items if linked
        if (jc.inspection_id) {
          const { data: inspItems } = await supabase
            .from('inspection_items').select('*')
            .eq('inspection_id', jc.inspection_id).order('sort_order')
          setItems(inspItems || [])

          const { data: insp } = await supabase
            .from('inspections').select('*').eq('id', jc.inspection_id).single()
          setData(insp)
        }
      } else {
        setData(inspection)
        // Fetch inspection items
        const { data: inspItems } = await supabase
          .from('inspection_items').select('*')
          .eq('inspection_id', token).order('sort_order')
        setItems(inspItems || [])

        // Fetch linked job card if exists
        const { data: jcs } = await supabase
          .from('job_cards').select('*')
          .eq('inspection_id', token).order('created_at', { ascending: false }).limit(1)
        if (jcs?.length > 0) setJobCard(jcs[0])
      }
    } catch (err) {
      setError(t('customerView.linkExpired'))
    } finally {
      setLoading(false)
    }
  }

  const toggleApproval = async (itemId, approved) => {
    try {
      await supabase.from('inspection_items').update({ customer_approved: approved }).eq('id', itemId)
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, customer_approved: approved } : i))
      toast.success(approved ? t('customerView.approved') : t('customerView.declined'))
    } catch (err) {
      toast.error(t('customerView.failedUpdate'))
    }
  }

  const approveAll = async () => {
    const inspectionId = data?.id || jobCard?.inspection_id
    if (!inspectionId) return
    try {
      await supabase.from('inspection_items').update({ customer_approved: true }).eq('inspection_id', inspectionId)
      setItems(prev => prev.map(i => ({ ...i, customer_approved: true })))
      toast.success(t('customerView.allApproved'))
    } catch (err) {
      toast.error(t('customerView.failedUpdate'))
    }
  }

  const severityColors = {
    low: { bg: 'bg-gray-100', text: 'text-gray-600', label: t('inspection.severities.low') },
    medium: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: t('inspection.severities.medium') },
    high: { bg: 'bg-orange-100', text: 'text-orange-700', label: t('inspection.severities.high') },
    critical: { bg: 'bg-red-100', text: 'text-red-700', label: t('inspection.severities.critical') },
  }

  const totalEstimated = items.reduce((s, i) => s + Number(i.estimated_cost || 0), 0)
  const approvedTotal = items.filter(i => i.customer_approved === true).reduce((s, i) => s + Number(i.estimated_cost || 0), 0)
  const approvedCount = items.filter(i => i.customer_approved === true).length
  const isPreJobCard = jobCard?.status === 'pre_job_card' || jobCard?.status === 'pending_approval'
  const canApprove = isPreJobCard || (data && data.status === 'completed')

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-gray-500 text-sm">{t('customerView.loading')}</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="text-center bg-white rounded-2xl p-8 shadow-lg max-w-sm">
        <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">{t('customerView.linkInvalid')}</h2>
        <p className="text-gray-500">{error}</p>
      </div>
    </div>
  )

  const vehicle = data?.vehicles || jobCard?.vehicles
  const customer = data?.customers || jobCard?.customers

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-center" toastOptions={{ duration: 2000 }} />

      {/* Header */}
      <div className="bg-blue-800 text-white px-4 py-5">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <Truck className="w-8 h-8" />
            <div className="flex-1">
              <h1 className="text-lg font-bold">{t('app.name')}</h1>
              <p className="text-blue-200 text-xs">{t('customerView.serviceReport')}</p>
            </div>
            <button
              onClick={() => switchLanguage(locale === 'en' ? 'sw' : 'en')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 transition-colors"
            >
              <Globe className="w-3.5 h-3.5" />
              {locale === 'en' ? 'Kiswahili' : 'English'}
            </button>
          </div>
          <div className="bg-blue-900/50 rounded-xl p-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-blue-300 text-xs">{t('customerView.customer')}</p>
                <p className="font-semibold">{customer?.full_name}</p>
              </div>
              <div>
                <p className="text-blue-300 text-xs">{t('customerView.vehicle')}</p>
                <p className="font-semibold">{vehicle?.registration_number}</p>
                <p className="text-blue-200 text-xs">{vehicle?.make} {vehicle?.model}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {/* Status Banner */}
        <div className={`rounded-xl p-4 flex items-center gap-3 ${
          jobCard?.status === 'completed' ? 'bg-green-50 border border-green-200' :
          jobCard?.status === 'in_progress' ? 'bg-yellow-50 border border-yellow-200' :
          isPreJobCard ? 'bg-purple-50 border border-purple-200' :
          'bg-blue-50 border border-blue-200'
        }`}>
          {jobCard?.status === 'completed' ? <CheckCircle2 className="w-6 h-6 text-green-600" /> :
           jobCard?.status === 'in_progress' ? <Wrench className="w-6 h-6 text-yellow-600 animate-pulse" /> :
           isPreJobCard ? <ClipboardCheck className="w-6 h-6 text-purple-600" /> :
           <Clock className="w-6 h-6 text-blue-600" />}
          <div>
            <p className="font-semibold text-gray-900">
              {jobCard?.status === 'completed' ? t('customerView.repairsCompleted') :
               jobCard?.status === 'in_progress' ? t('customerView.workInProgress') :
               isPreJobCard ? t('customerView.approvalNeeded') :
               data?.status === 'in_progress' ? t('customerView.inspectionInProgress') :
               data?.status === 'completed' ? t('customerView.inspectionComplete') :
               data?.status === 'pending_payment' ? t('customerView.awaitingPayment') :
               t('customerView.processing')}
            </p>
            <p className="text-xs text-gray-500">
              {data?.inspection_number && `Inspection: ${data.inspection_number}`}
              {jobCard?.job_number && ` | Job: ${jobCard.job_number}`}
            </p>
          </div>
        </div>

        {/* Customer Complaint */}
        {data?.description && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-500 mb-1">{t('customerView.yourComplaint')}</h3>
            <p className="text-sm text-gray-800">{data.description}</p>
          </div>
        )}

        {/* Problems / Findings */}
        {items.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{t('customerView.inspectionFindings')}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{items.length} {t('customerView.issuesFound')}</p>
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
                            {item.severity === 'high' || item.severity === 'critical' ? (
                              <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {sev.label}</span>
                            ) : sev.label}
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
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-500">{t('customerView.totalEstimated')}</span>
                <span className="font-medium">{formatTZS(totalEstimated)}</span>
              </div>
              {approvedCount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-green-700 font-medium">{t('customerView.approvedItems')} ({approvedCount} {t('customerView.items')})</span>
                  <span className="font-bold text-green-700">{formatTZS(approvedTotal)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Job Card Progress (when work is ongoing) */}
        {jobCard && !isPreJobCard && jobCard.status !== 'pre_job_card' && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3">{t('customerView.repairProgress')}</h3>
            <div className="flex items-center justify-between text-sm">
              {[
                { label: t('customerView.stepInspection'), done: true },
                { label: t('customerView.stepApproved'), done: true },
                { label: t('customerView.stepInProgress'), done: jobCard.status === 'in_progress' || jobCard.status === 'completed' },
                { label: t('customerView.stepDone'), done: jobCard.status === 'completed' },
              ].map((step, idx) => (
                <div key={idx} className="flex flex-col items-center gap-1 flex-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    step.done ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'
                  }`}>{idx + 1}</div>
                  <span className={`text-xs text-center ${step.done ? 'text-green-700 font-medium' : 'text-gray-400'}`}>{step.label}</span>
                </div>
              ))}
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

        <p className="text-center text-xs text-gray-400 pb-4">
          {t('customerView.poweredBy')}
        </p>
      </div>
    </div>
  )
}
