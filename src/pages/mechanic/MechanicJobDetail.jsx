import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { useMechanic } from '../../contexts/MechanicAuthContext'
import { supabase, formatDate, errorMessage } from '../../lib/supabase'
import { uploadEvidence, fetchEvidence, evidenceUrl, reportFinding, fetchFindings } from '../../lib/evidence'
import { logLabour, fetchMyLabour, deleteLabour } from '../../lib/labour'
import {
  ArrowLeft, Truck, Wrench, XCircle, Send, AlertTriangle,
  Camera, CheckCircle2, Trash2, RotateCcw, Loader2, Flag, Paperclip, Clock,
} from 'lucide-react'
import toast from 'react-hot-toast'
import Reveal from '../../components/common/Reveal'

export default function MechanicJobDetail() {
  const { id } = useParams()
  const { t } = useLanguage()
  const { mechanic } = useMechanic()
  const navigate = useNavigate()
  const [job, setJob] = useState(null)
  const [inspection, setInspection] = useState(null)
  const [items, setItems] = useState([])
  const [situation, setSituation] = useState('')
  const [savingSituation, setSavingSituation] = useState(false)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [evidence, setEvidence] = useState([])
  const [uploading, setUploading] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [findings, setFindings] = useState([])
  const [faultForm, setFaultForm] = useState({ description: '', severity: 'medium', file: null })
  const [reporting, setReporting] = useState(false)
  const [labourEntries, setLabourEntries] = useState([])
  const [labourForm, setLabourForm] = useState({ hours: '', note: '' })
  const [loggingLabour, setLoggingLabour] = useState(false)

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const fetchData = async () => {
    try {
      const { data: jc } = await supabase
        .from('job_cards')
        .select('id, job_number, status, description, inspection_id, assigned_mechanic_id, mechanic_completed_at, vehicles(registration_number, make, model, year)')
        .eq('id', id)
        .single()

      // Only the assigned mechanic may open this job.
      if (!jc || jc.assigned_mechanic_id !== mechanic?.id) {
        setDenied(true)
        setLoading(false)
        return
      }
      setJob(jc)
      setEvidence(await fetchEvidence(jc.id).catch(() => []))
      setFindings(await fetchFindings(jc.id).catch(() => []))
      setLabourEntries(await fetchMyLabour({ mechanicId: mechanic.id, jobCardId: jc.id }).catch(() => []))

      if (jc.inspection_id) {
        const [inspRes, itemsRes] = await Promise.all([
          supabase.from('inspections').select('id, description, repair_summary, repair_updated_at').eq('id', jc.inspection_id).single(),
          supabase.from('inspection_items').select('*').eq('inspection_id', jc.inspection_id).order('sort_order'),
        ])
        setInspection(inspRes.data)
        setSituation(inspRes.data?.repair_summary || '')
        setItems(itemsRes.data || [])
      }
    } catch (err) {
      console.error('Mechanic job error:', err)
    } finally {
      setLoading(false)
    }
  }

  const setItemStatus = async (item, status) => {
    const done_at = status === 'done' ? new Date().toISOString() : null
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, repair_status: status, repair_done_at: done_at } : i))
    try {
      const { error } = await supabase.rpc('mechanic_set_item_repair', {
        p_mechanic_id: mechanic.id, p_item_id: item.id, p_status: status,
      })
      if (error) throw error
    } catch (err) {
      toast.error(err.message)
      fetchData()
    }
  }

  // Photos of the finished work. Several can be picked at once — the phone
  // camera roll is how these arrive.
  const addPhotos = async (fileList) => {
    const files = Array.from(fileList || []).filter(f => f.type.startsWith('image/'))
    if (!files.length) return
    setUploading(true)
    let added = 0
    for (const file of files) {
      try {
        await uploadEvidence({ file, jobCardId: job.id, mechanicId: mechanic.id })
        added += 1
      } catch (err) {
        toast.error(errorMessage(err, t('mechanic.job.uploadFailed')))
      }
    }
    if (added) toast.success(t('mechanic.job.photosAdded', { count: added }))
    setEvidence(await fetchEvidence(job.id).catch(() => evidence))
    setUploading(false)
  }

  const removePhoto = async (ev) => {
    setEvidence(prev => prev.filter(e => e.id !== ev.id))
    try {
      const { error } = await supabase.rpc('mechanic_delete_evidence', {
        p_mechanic_id: mechanic.id, p_evidence_id: ev.id,
      })
      if (error) throw error
    } catch (err) {
      toast.error(errorMessage(err, t('mechanic.job.deleteFailed')))
      fetchData()
    }
  }

  // A fault nobody asked him to look at. He describes it and the office prices
  // it — he never sees or sets a price.
  const submitFault = async (e) => {
    e.preventDefault()
    if (!faultForm.description.trim()) return toast.error(t('mechanic.job.faultRequired'))
    setReporting(true)
    try {
      await reportFinding({
        file: faultForm.file,
        jobCardId: job.id,
        mechanicId: mechanic.id,
        description: faultForm.description.trim(),
        severity: faultForm.severity,
      })
      toast.success(t('mechanic.job.faultSent'))
      setFaultForm({ description: '', severity: 'medium', file: null })
      setFindings(await fetchFindings(job.id).catch(() => findings))
    } catch (err) {
      toast.error(errorMessage(err, t('mechanic.job.faultFailed')))
    } finally {
      setReporting(false)
    }
  }

  const withdrawFault = async (f) => {
    setFindings(prev => prev.filter(x => x.id !== f.id))
    try {
      const { error } = await supabase.rpc('mechanic_delete_finding', {
        p_mechanic_id: mechanic.id, p_finding_id: f.id,
      })
      if (error) throw error
    } catch (err) {
      toast.error(errorMessage(err, t('mechanic.job.faultFailed')))
      fetchData()
    }
  }

  // Log the hours spent on this job. Hours only — the office sets the rate and
  // turns these into a billable line; the mechanic never sees a price.
  const submitLabour = async (e) => {
    e.preventDefault()
    const hours = Number(labourForm.hours)
    if (!hours || hours <= 0 || hours > 24) return toast.error(t('mechanic.job.labourBadHours'))
    setLoggingLabour(true)
    try {
      await logLabour({ mechanicId: mechanic.id, jobCardId: job.id, hours, note: labourForm.note.trim() })
      toast.success(t('mechanic.job.labourLogged'))
      setLabourForm({ hours: '', note: '' })
      setLabourEntries(await fetchMyLabour({ mechanicId: mechanic.id, jobCardId: job.id }).catch(() => labourEntries))
    } catch (err) {
      toast.error(errorMessage(err, t('mechanic.job.labourFailed')))
    } finally {
      setLoggingLabour(false)
    }
  }

  const removeLabour = async (entry) => {
    setLabourEntries(prev => prev.filter(x => x.id !== entry.id))
    try {
      await deleteLabour({ mechanicId: mechanic.id, entryId: entry.id })
    } catch (err) {
      toast.error(errorMessage(err, t('mechanic.job.labourFailed')))
      fetchData()
    }
  }

  // The tick: the work is done. Also closes the job card itself, server-side,
  // but only from a status that means "being worked on" (migration 030).
  const finishJob = async () => {
    setFinishing(true)
    try {
      const { error } = await supabase.rpc('mechanic_complete_job', {
        p_mechanic_id: mechanic.id, p_job_card_id: job.id, p_note: situation || null,
      })
      if (error) throw error
      toast.success(t('mechanic.job.markedDone'))
      fetchData()
    } catch (err) {
      toast.error(errorMessage(err, t('mechanic.job.finishFailed')))
    } finally {
      setFinishing(false)
    }
  }

  const undoFinish = async () => {
    setFinishing(true)
    try {
      const { error } = await supabase.rpc('mechanic_reopen_job', {
        p_mechanic_id: mechanic.id, p_job_card_id: job.id,
      })
      if (error) throw error
      toast.success(t('mechanic.job.reopened'))
      fetchData()
    } catch (err) {
      toast.error(errorMessage(err, t('mechanic.job.finishFailed')))
    } finally {
      setFinishing(false)
    }
  }

  const saveSituation = async () => {
    if (!inspection?.id) return
    setSavingSituation(true)
    try {
      const { error } = await supabase.rpc('mechanic_update_situation', {
        p_mechanic_id: mechanic.id, p_inspection_id: inspection.id, p_summary: situation,
      })
      if (error) throw error
      toast.success(t('mechanic.job.situationPosted'))
      fetchData()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingSituation(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (denied || !job) {
    return (
      <div className="text-center py-12">
        <XCircle className="w-12 h-12 text-red-300 mx-auto mb-3" />
        <p className="text-gray-500">{t('mechanic.job.notYours')}</p>
        <button onClick={() => navigate('/mechanic/jobs')} className="text-amber-600 text-sm mt-2">{t('common.back')}</button>
      </div>
    )
  }

  const v = job.vehicles
  const done = items.filter(i => i.repair_status === 'done').length
  const pct = items.length ? Math.round((done / items.length) * 100) : 0

  const severityColors = {
    low: { bg: 'bg-gray-100', text: 'text-gray-600' },
    medium: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
    high: { bg: 'bg-orange-100', text: 'text-orange-700' },
    critical: { bg: 'bg-red-100', text: 'text-red-700' },
  }

  return (
    <div className="space-y-4">
      <Link to="/mechanic/jobs" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> {t('common.back')}
      </Link>

      {/* Vehicle / job header */}
      <Reveal className="bg-white rounded-2xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-lg font-bold text-gray-900">{job.job_number}</p>
          <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-slate-100 text-slate-700">
            {t(`jobs.statuses.${job.status}`)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <Truck className="w-4 h-4 text-gray-400" />
          <span className="font-bold">{v?.registration_number}</span>
          <span className="text-gray-500">{v?.make} {v?.model} {v?.year || ''}</span>
        </div>
        {(inspection?.description || job.description) && (
          <p className="text-sm text-gray-600 mt-2 pt-2 border-t border-gray-100 whitespace-pre-line">
            {inspection?.description || job.description}
          </p>
        )}
      </Reveal>

      {/* Progress */}
      {items.length > 0 && (
        <Reveal className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-medium text-gray-600">{t('mechanic.job.progress')}</span>
            <span className="text-sm font-bold text-green-700">{done}/{items.length} · {pct}%</span>
          </div>
          <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </Reveal>
      )}

      {/* Repair checklist */}
      {items.length > 0 ? (
        <Reveal className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900 text-sm">{t('mechanic.job.checklist')}</h3>
            <p className="text-xs text-gray-500">{t('mechanic.job.checklistHint')}</p>
          </div>
          <div className="divide-y divide-gray-100">
            {items.map((item, idx) => {
              const sev = severityColors[item.severity] || severityColors.medium
              return (
                <div key={item.id} className="p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-xs font-bold text-gray-400 mt-0.5">#{idx + 1}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sev.bg} ${sev.text}`}>
                          {(item.severity === 'high' || item.severity === 'critical') && (
                            <AlertTriangle className="w-3 h-3 inline mr-0.5" />
                          )}
                          {t(`inspection.severities.${item.severity}`)}
                        </span>
                        {item.customer_approved === false && (
                          <span className="text-xs text-red-600 font-medium">{t('customerView.declined')}</span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-gray-900">{item.problem_description}</p>
                      {item.recommended_action && (
                        <p className="text-xs text-blue-600 mt-0.5">{t('inspection.recommended')}: {item.recommended_action}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap pl-5">
                    {['pending', 'in_progress', 'done'].map((s) => (
                      <button
                        key={s}
                        onClick={() => setItemStatus(item, s)}
                        className={`text-xs px-3 py-1.5 rounded-full font-medium transition ${
                          (item.repair_status || 'pending') === s
                            ? s === 'done' ? 'bg-green-600 text-white'
                              : s === 'in_progress' ? 'bg-yellow-500 text-white'
                              : 'bg-gray-500 text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {t(`inspection.repairStatuses.${s}`)}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </Reveal>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <Wrench className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">{t('mechanic.job.noItems')}</p>
        </div>
      )}

      {/* Current situation note */}
      {inspection?.id && (
        <Reveal className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Wrench className="w-4 h-4 text-amber-600" />
            <h3 className="font-semibold text-gray-900 text-sm">{t('mechanic.job.situation')}</h3>
          </div>
          <p className="text-xs text-gray-500 mb-3">{t('mechanic.job.situationHint')}</p>
          <textarea
            value={situation}
            onChange={(e) => setSituation(e.target.value)}
            rows={3}
            placeholder={t('inspection.situationPlaceholder')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none resize-none text-gray-900"
          />
          <div className="flex items-center justify-between mt-3 gap-3">
            <span className="text-xs text-gray-400">
              {inspection.repair_updated_at
                ? `${t('inspection.situationLastUpdated')}: ${formatDate(inspection.repair_updated_at)}`
                : ''}
            </span>
            <button
              onClick={saveSituation}
              disabled={savingSituation}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium disabled:opacity-40 flex-shrink-0"
            >
              <Send className="w-4 h-4" /> {t('mechanic.job.postSituation')}
            </button>
          </div>
        </Reveal>
      )}

      {/* Log my time — hours only, never a price */}
      <Reveal className="bg-white rounded-2xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Clock className="w-4 h-4 text-amber-600" />
          <h3 className="font-semibold text-gray-900 text-sm">{t('mechanic.job.logTime')}</h3>
        </div>
        <p className="text-xs text-gray-500 mb-3">{t('mechanic.job.logTimeHint')}</p>

        {labourEntries.length > 0 && (
          <div className="space-y-2 mb-4">
            {labourEntries.map((le) => (
              <div key={le.id} className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg">
                <span className="text-sm font-bold text-amber-700 flex-shrink-0">
                  {le.hours} {t('mechanic.job.hoursShort')}
                </span>
                <div className="flex-1 min-w-0">
                  {le.note && <p className="text-sm text-gray-700">{le.note}</p>}
                  <p className="text-[11px] text-gray-400">{formatDate(le.work_date || le.created_at)}</p>
                </div>
                {le.billed ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-green-100 text-green-700 flex-shrink-0">
                    {t('mechanic.job.labourBilled')}
                  </span>
                ) : (
                  <button onClick={() => removeLabour(le)} title={t('common.delete')}
                    className="p-1 rounded text-gray-400 hover:text-red-600 flex-shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            <p className="text-xs text-gray-500 pt-1">
              {t('mechanic.job.labourTotal')}: <span className="font-semibold text-gray-700">
                {labourEntries.reduce((s, e) => s + Number(e.hours || 0), 0)} {t('mechanic.job.hoursShort')}
              </span>
            </p>
          </div>
        )}

        <form onSubmit={submitLabour} className="space-y-3">
          <div className="flex items-center gap-2">
            <input type="number" min="0.25" max="24" step="0.25"
              value={labourForm.hours}
              onChange={(e) => setLabourForm({ ...labourForm, hours: e.target.value })}
              placeholder={t('mechanic.job.hoursPlaceholder')}
              className="w-28 px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-500 text-gray-900 text-sm" />
            <input type="text"
              value={labourForm.note}
              onChange={(e) => setLabourForm({ ...labourForm, note: e.target.value })}
              placeholder={t('mechanic.job.labourNotePlaceholder')}
              className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-500 text-gray-900 text-sm" />
          </div>
          <button type="submit" disabled={loggingLabour}
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium disabled:opacity-40">
            {loggingLabour ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
            {t('mechanic.job.logTimeButton')}
          </button>
        </form>
      </Reveal>

      {/* Report a fault the customer never mentioned */}
      <Reveal className="bg-white rounded-2xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Flag className="w-4 h-4 text-red-500" />
          <h3 className="font-semibold text-gray-900 text-sm">{t('mechanic.job.reportFault')}</h3>
        </div>
        <p className="text-xs text-gray-500 mb-3">{t('mechanic.job.reportFaultHint')}</p>

        {findings.length > 0 && (
          <div className="space-y-2 mb-4">
            {findings.map((f) => {
              const sev = severityColors[f.severity] || severityColors.medium
              return (
                <div key={f.id} className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg">
                  {f.evidence_path && (
                    <a href={evidenceUrl(f.evidence_path)} target="_blank" rel="noreferrer" className="flex-shrink-0">
                      <img src={evidenceUrl(f.evidence_path)} alt="" loading="lazy"
                        className="w-12 h-12 object-cover rounded border border-gray-200" />
                    </a>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">{f.description}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${sev.bg} ${sev.text}`}>
                        {t(`inspection.severities.${f.severity}`)}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        f.status === 'accepted' ? 'bg-green-100 text-green-700'
                          : f.status === 'declined' ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {t(`mechanic.job.faultStatuses.${f.status}`)}
                      </span>
                    </div>
                  </div>
                  {f.status === 'pending' && f.mechanic_id === mechanic?.id && (
                    <button onClick={() => withdrawFault(f)} title={t('common.delete')}
                      className="p-1 rounded text-gray-400 hover:text-red-600 flex-shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <form onSubmit={submitFault} className="space-y-3">
          <textarea
            value={faultForm.description}
            onChange={(e) => setFaultForm({ ...faultForm, description: e.target.value })}
            rows={2}
            placeholder={t('mechanic.job.faultPlaceholder')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none resize-none text-gray-900 text-sm"
          />
          <div className="flex items-center gap-2">
            <select value={faultForm.severity}
              onChange={(e) => setFaultForm({ ...faultForm, severity: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-amber-500">
              {['low', 'medium', 'high', 'critical'].map(s => (
                <option key={s} value={s}>{t(`inspection.severities.${s}`)}</option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 cursor-pointer hover:bg-gray-50 flex-1 min-w-0">
              <Paperclip className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{faultForm.file ? faultForm.file.name : t('mechanic.job.faultPhoto')}</span>
              <input type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => setFaultForm({ ...faultForm, file: e.target.files?.[0] || null })} />
            </label>
          </div>
          <button type="submit" disabled={reporting}
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium disabled:opacity-40">
            {reporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {t('mechanic.job.sendFault')}
          </button>
        </form>
      </Reveal>

      {/* Evidence photos */}
      <Reveal className="bg-white rounded-2xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Camera className="w-4 h-4 text-amber-600" />
          <h3 className="font-semibold text-gray-900 text-sm">{t('mechanic.job.evidence')}</h3>
        </div>
        <p className="text-xs text-gray-500 mb-3">{t('mechanic.job.evidenceHint')}</p>

        {evidence.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-3">
            {evidence.map((ev) => (
              <div key={ev.id} className="relative group">
                <a href={evidenceUrl(ev.storage_path)} target="_blank" rel="noreferrer">
                  <img src={evidenceUrl(ev.storage_path)} alt={ev.caption || ''}
                    loading="lazy"
                    className="w-full h-24 object-cover rounded-lg border border-gray-200" />
                </a>
                {ev.mechanic_id === mechanic?.id && (
                  <button onClick={() => removePhoto(ev)}
                    title={t('common.delete')}
                    className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-red-600">
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <label className={`flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed rounded-lg text-sm font-medium transition ${
          uploading ? 'border-gray-200 text-gray-400' : 'border-amber-300 text-amber-700 hover:bg-amber-50 cursor-pointer'
        }`}>
          {uploading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('mechanic.job.uploading')}</>
            : <><Camera className="w-4 h-4" /> {t('mechanic.job.addPhoto')}</>}
          <input type="file" accept="image/*" capture="environment" multiple disabled={uploading}
            onChange={(e) => { addPhotos(e.target.files); e.target.value = '' }}
            className="hidden" />
        </label>
      </Reveal>

      {/* The tick: work finished */}
      <Reveal className="bg-white rounded-2xl border border-gray-200 p-4">
        {job.mechanic_completed_at ? (
          <>
            <div className="flex items-center gap-2 text-green-700 mb-1">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-semibold text-sm">{t('mechanic.job.doneTitle')}</span>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              {t('mechanic.job.doneOn')}: {formatDate(job.mechanic_completed_at)}
            </p>
            <button onClick={undoFinish} disabled={finishing}
              className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium disabled:opacity-40">
              <RotateCcw className="w-4 h-4" /> {t('mechanic.job.undoDone')}
            </button>
          </>
        ) : (
          <>
            <h3 className="font-semibold text-gray-900 text-sm mb-1">{t('mechanic.job.finishTitle')}</h3>
            <p className="text-xs text-gray-500 mb-3">{t('mechanic.job.finishHint')}</p>
            <button onClick={finishJob} disabled={finishing}
              className="flex items-center justify-center gap-2 w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-40">
              {finishing
                ? <Loader2 className="w-5 h-5 animate-spin" />
                : <CheckCircle2 className="w-5 h-5" />}
              {t('mechanic.job.markDone')}
            </button>
          </>
        )}
      </Reveal>
    </div>
  )
}
