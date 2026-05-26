import { useState, useEffect } from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import { supabase, formatDate } from '../lib/supabase'
import { Plus, Eye, Download, Search, X, ClipboardCheck } from 'lucide-react'
import { generateHandoverPDF } from '../lib/pdf'
import toast from 'react-hot-toast'

export default function Handover() {
  const { t } = useLanguage()
  const [handovers, setHandovers] = useState([])
  const [completedJobs, setCompletedJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showDetail, setShowDetail] = useState(null)
  const [form, setForm] = useState({
    job_card_id: '', work_summary: '', parts_summary: '',
    recommendations: '', next_service_date: '', next_service_mileage: '',
    mileage_out: '', fuel_level_out: '', received_by: '',
    warranty_parts_days: '30', warranty_labour_days: '7', notes: '',
  })

  useEffect(() => {
    fetchHandovers()
    fetchCompletedJobs()
  }, [])

  const fetchHandovers = async () => {
    try {
      const { data, error } = await supabase
        .from('handover_cards')
        .select(`
          *,
          customers(full_name, phone),
          vehicles(registration_number, make, model),
          job_cards(job_number)
        `)
        .order('created_at', { ascending: false })
      if (error) throw error
      setHandovers(data || [])
    } catch (err) {
      toast.error(t('handover.loadError'))
    } finally {
      setLoading(false)
    }
  }

  const fetchCompletedJobs = async () => {
    const { data } = await supabase
      .from('job_cards')
      .select('id, job_number, customer_id, vehicle_id, vehicles(registration_number), customers(full_name)')
      .eq('status', 'completed')
      .order('date_completed', { ascending: false })
    setCompletedJobs(data || [])
  }

  const handleJobSelect = (jobId) => {
    const job = completedJobs.find(j => j.id === jobId)
    if (job) {
      setForm({
        ...form,
        job_card_id: jobId,
      })
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const job = completedJobs.find(j => j.id === form.job_card_id)
    if (!job) return toast.error(t('handover.completedJob'))

    try {
      const payload = {
        job_card_id: form.job_card_id,
        customer_id: job.customer_id,
        vehicle_id: job.vehicle_id,
        work_summary: form.work_summary,
        parts_summary: form.parts_summary || null,
        recommendations: form.recommendations || null,
        next_service_date: form.next_service_date || null,
        next_service_mileage: form.next_service_mileage ? parseInt(form.next_service_mileage) : null,
        mileage_out: form.mileage_out ? parseInt(form.mileage_out) : null,
        fuel_level_out: form.fuel_level_out || null,
        received_by: form.received_by || null,
        warranty_parts_days: parseInt(form.warranty_parts_days) || 30,
        warranty_labour_days: parseInt(form.warranty_labour_days) || 7,
        notes: form.notes || null,
      }

      const { error } = await supabase.from('handover_cards').insert(payload)
      if (error) throw error
      toast.success(t('handover.created'))
      setShowForm(false)
      resetForm()
      fetchHandovers()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleDownloadPDF = (handover) => {
    generateHandoverPDF(handover)
    toast.success(t('handover.pdfDownloaded'))
  }

  const resetForm = () => {
    setForm({ job_card_id: '', work_summary: '', parts_summary: '', recommendations: '', next_service_date: '', next_service_mileage: '', mileage_out: '', fuel_level_out: '', received_by: '', warranty_parts_days: '30', warranty_labour_days: '7', notes: '' })
  }

  const filtered = handovers.filter(h =>
    h.handover_number?.toLowerCase().includes(search.toLowerCase()) ||
    h.customers?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    h.vehicles?.registration_number?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{t('handover.title')}</h1>
        <button onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition text-sm font-medium">
          <Plus className="w-4 h-4" /> {t('handover.create')}
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={t('handover.search')}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
      </div>

      {/* Handover Cards List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center p-8"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center border border-gray-200">
            <ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">{t('common.noData')}</p>
          </div>
        ) : (
          filtered.map((h) => (
            <div key={h.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-blue-700">{h.handover_number}</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {h.vehicles?.registration_number} ({h.vehicles?.make}) - {h.customers?.full_name}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">Job: {h.job_cards?.job_number} | {formatDate(h.handover_date)}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowDetail(h)} className="p-2 rounded-lg hover:bg-blue-50 text-blue-600">
                    <Eye className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDownloadPDF(h)} className="p-2 rounded-lg hover:bg-green-50 text-green-600">
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Detail Modal */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold">{showDetail.handover_number}</h2>
              <button onClick={() => setShowDetail(null)} className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div><span className="text-gray-500">{t('inspection.customer')}:</span><p className="font-medium">{showDetail.customers?.full_name}</p></div>
                <div><span className="text-gray-500">{t('jobs.vehicle')}:</span><p className="font-medium">{showDetail.vehicles?.registration_number}</p></div>
                <div><span className="text-gray-500">{t('handover.mileageOut')}:</span><p className="font-medium">{showDetail.mileage_out?.toLocaleString() || '-'} km</p></div>
                <div><span className="text-gray-500">{t('handover.fuelLevelOut')}:</span><p className="font-medium capitalize">{showDetail.fuel_level_out || '-'}</p></div>
              </div>
              <div><span className="text-gray-500">{t('handover.workSummary')}:</span><p className="mt-1">{showDetail.work_summary}</p></div>
              {showDetail.parts_summary && <div><span className="text-gray-500">{t('handover.partsUsed')}:</span><p className="mt-1">{showDetail.parts_summary}</p></div>}
              {showDetail.recommendations && <div><span className="text-gray-500">{t('handover.recommendations')}:</span><p className="mt-1">{showDetail.recommendations}</p></div>}
              <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                <div><span className="text-gray-500">{t('handover.partsWarranty')}:</span><p className="font-medium">{showDetail.warranty_parts_days} {t('handover.days')}</p></div>
                <div><span className="text-gray-500">{t('handover.labourWarranty')}:</span><p className="font-medium">{showDetail.warranty_labour_days} {t('handover.days')}</p></div>
                {showDetail.next_service_date && <div><span className="text-gray-500">{t('handover.nextService')}:</span><p className="font-medium">{formatDate(showDetail.next_service_date)}</p></div>}
                {showDetail.received_by && <div><span className="text-gray-500">{t('handover.receivedBy')}:</span><p className="font-medium">{showDetail.received_by}</p></div>}
              </div>
              <button onClick={() => { handleDownloadPDF(showDetail); setShowDetail(null) }}
                className="w-full py-2.5 bg-blue-700 text-white font-medium rounded-lg hover:bg-blue-800 flex items-center justify-center gap-2">
                <Download className="w-4 h-4" /> {t('handover.print')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Handover Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold">{t('handover.create')}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('handover.completedJob')} *</label>
                <select value={form.job_card_id} onChange={e => handleJobSelect(e.target.value)} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="">{t('handover.selectCompletedJob')}</option>
                  {completedJobs.map(j => (
                    <option key={j.id} value={j.id}>
                      {j.job_number} - {j.vehicles?.registration_number} ({j.customers?.full_name})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('handover.workSummary')} *</label>
                <textarea value={form.work_summary} onChange={e => setForm({...form, work_summary: e.target.value})} required rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                  placeholder="Summarize all work done..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('handover.partsSummary')}</label>
                <textarea value={form.parts_summary} onChange={e => setForm({...form, parts_summary: e.target.value})} rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('handover.recommendations')}</label>
                <textarea value={form.recommendations} onChange={e => setForm({...form, recommendations: e.target.value})} rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                  placeholder="Future service recommendations..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('handover.mileageOut')}</label>
                  <input type="number" value={form.mileage_out} onChange={e => setForm({...form, mileage_out: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('handover.fuelLevelOut')}</label>
                  <select value={form.fuel_level_out} onChange={e => setForm({...form, fuel_level_out: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">--</option>
                    <option value="empty">{t('fuelLevels.empty')}</option>
                    <option value="quarter">{t('fuelLevels.quarter')}</option>
                    <option value="half">{t('fuelLevels.half')}</option>
                    <option value="three_quarter">{t('fuelLevels.three_quarter')}</option>
                    <option value="full">{t('fuelLevels.full')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('handover.nextServiceDate')}</label>
                  <input type="date" value={form.next_service_date} onChange={e => setForm({...form, next_service_date: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('handover.receivedBy')}</label>
                  <input type="text" value={form.received_by} onChange={e => setForm({...form, received_by: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('handover.warrantyParts')}</label>
                  <input type="number" value={form.warranty_parts_days} onChange={e => setForm({...form, warranty_parts_days: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('handover.warrantyLabour')}</label>
                  <input type="number" value={form.warranty_labour_days} onChange={e => setForm({...form, warranty_labour_days: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 py-2.5 bg-blue-700 text-white font-medium rounded-lg hover:bg-blue-800 transition">{t('common.save')}</button>
                <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition">{t('common.cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
