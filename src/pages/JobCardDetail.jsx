import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase, formatTZS, formatDate } from '../lib/supabase'
import { findLiveProforma, syncProformaTotals, totalsFromJobItems, proformaUpdateFor, overpaymentOn, DEFAULT_VAT_RATE } from '../lib/proforma'
import { fetchEvidence, evidenceUrl, fetchFindings } from '../lib/evidence'
import { Plus, Trash2, FileText, Printer, ArrowLeft, Package, Wrench, DollarSign, X, CheckCircle2, XCircle, UserPlus, AlertCircle, Share2, Pencil, Camera, Flag } from 'lucide-react'
import toast from 'react-hot-toast'

export default function JobCardDetail() {
  const { id } = useParams()
  const { t } = useLanguage()
  const { canViewInternal, isManager, profile } = useAuth()
  const navigate = useNavigate()
  const [job, setJob] = useState(null)
  const [items, setItems] = useState([])
  const [parts, setParts] = useState([])
  const [labourRates, setLabourRates] = useState([])
  const [inspectionItems, setInspectionItems] = useState([])
  const [liveProforma, setLiveProforma] = useState(null)
  const [evidence, setEvidence] = useState([])
  const [findings, setFindings] = useState([])
  const [pricingFinding, setPricingFinding] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAddItem, setShowAddItem] = useState(false)
  const [showAssignTech, setShowAssignTech] = useState(false)
  const [techName, setTechName] = useState('')
  const [techId, setTechId] = useState('')
  const [mechanics, setMechanics] = useState([])
  const [itemType, setItemType] = useState('part')
  const [editingDesc, setEditingDesc] = useState(false)
  const [descInput, setDescInput] = useState('')
  const [savingDesc, setSavingDesc] = useState(false)
  const [itemForm, setItemForm] = useState({
    part_id: '', labour_id: '', description: '', quantity: 1,
    cost_price: 0, selling_price: 0,
  })

  useEffect(() => {
    fetchJob()
    fetchParts()
    fetchLabourRates()
    fetchMechanics()
    fetchEvidence(id).then(setEvidence).catch(() => setEvidence([]))
    fetchFindings(id).then(setFindings).catch(() => setFindings([]))
  }, [id])

  // Turn a reported fault into a priced line: opens the normal Add Item form
  // with the mechanic's words already in it.
  const priceFinding = (f) => {
    setPricingFinding(f)
    setItemType('additional')
    setItemForm({ part_id: '', labour_id: '', description: f.description, quantity: 1, cost_price: 0, selling_price: 0 })
    setShowAddItem(true)
  }

  const declineFinding = async (f) => {
    try {
      const { data, error } = await supabase.from('job_findings').update({
        status: 'declined',
        reviewed_by: profile?.id || null,
        reviewed_at: new Date().toISOString(),
      }).eq('id', f.id).select('id')
      if (error) throw error
      if (!data?.length) throw new Error(t('jobs.faultUpdateBlocked'))
      setFindings(await fetchFindings(id).catch(() => findings))
    } catch (err) {
      toast.error(err.message)
    }
  }

  const fetchMechanics = async () => {
    const { data } = await supabase.from('mechanics').select('id, name, active').eq('active', true).order('name')
    setMechanics(data || [])
  }

  const fetchJob = async () => {
    try {
      const { data, error } = await supabase
        .from('job_cards')
        .select(`
          *,
          customers(full_name, phone, email, company_name),
          vehicles(registration_number, make, model, year, mileage_km)
        `)
        .eq('id', id)
        .single()
      if (error) throw error
      setJob(data)

      // Fetch items
      const { data: jobItems } = await supabase
        .from('job_card_items')
        .select('*, parts(name), labour_rates(service_name)')
        .eq('job_card_id', id)
        .order('created_at')
      setItems(jobItems || [])

      // If pre_job_card, fetch inspection items for approval
      if (data.inspection_id && (data.status === 'pre_job_card' || data.status === 'pending_approval')) {
        const { data: inspItems } = await supabase
          .from('inspection_items')
          .select('*')
          .eq('inspection_id', data.inspection_id)
          .order('sort_order')
        setInspectionItems(inspItems || [])
      }

      // Drives the button label: there is at most one live proforma per job
      // card now, so the action is "create" once and "update" forever after.
      setLiveProforma(await findLiveProforma(id).catch(() => null))
    } catch (err) {
      toast.error(t('jobs.loadError'))
      navigate('/admin/job-cards')
    } finally {
      setLoading(false)
    }
  }

  // Toggle approval for inspection items (pre-job card)
  const toggleItemApproval = async (itemId, approved) => {
    try {
      await supabase.from('inspection_items').update({ customer_approved: approved }).eq('id', itemId)
      setInspectionItems(prev => prev.map(i => i.id === itemId ? { ...i, customer_approved: approved } : i))
    } catch (err) {
      toast.error(err.message)
    }
  }

  // Approve all inspection items
  const approveAllItems = async () => {
    try {
      await supabase.from('inspection_items').update({ customer_approved: true }).eq('inspection_id', job.inspection_id)
      setInspectionItems(prev => prev.map(i => ({ ...i, customer_approved: true })))
      toast.success(t('jobs.allApproved'))
    } catch (err) {
      toast.error(err.message)
    }
  }

  // Generate official Job Card from Pre-Job Card
  const generateOfficialJobCard = async () => {
    const approved = inspectionItems.filter(i => i.customer_approved === true)
    if (approved.length === 0) {
      toast.error(t('jobs.mustApproveOne'))
      return
    }
    try {
      // Update status to open (official job card)
      const update = { status: 'open' }
      if (techName || job.assigned_technician) {
        update.assigned_technician = techName || job.assigned_technician
      }
      const { error } = await supabase.from('job_cards').update(update).eq('id', id)
      if (error) throw error

      toast.success(t('jobs.jobCardGenerated'))
      fetchJob()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // Assign a mechanic. Stores the mechanic id (so the mechanic portal can find
  // this job) plus their name for display.
  const assignTechnician = async (e) => {
    e.preventDefault()
    if (!techId) {
      toast.error(t('jobs.selectMechanic'))
      return
    }
    const picked = mechanics.find(m => m.id === techId)
    try {
      // .update() resolves with an error rather than throwing, and a row blocked
      // by RLS comes back as a silent no-op — so check both, or the toast lies.
      const { data, error } = await supabase.from('job_cards').update({
        assigned_mechanic_id: techId,
        assigned_technician: picked?.name || techName,
      }).eq('id', id).select('id')
      if (error) throw error
      if (!data?.length) throw new Error(t('jobs.assignBlocked'))
      toast.success(t('jobs.technicianAssigned'))
      setShowAssignTech(false)
      fetchJob()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // Approve additional service item
  const approveAdditionalItem = async (itemId, approved) => {
    try {
      await supabase.from('job_card_items').update({
        approval_status: approved ? 'approved' : 'rejected',
        approved_by: profile?.full_name || 'Unknown',
      }).eq('id', itemId)
      toast.success(approved ? t('jobs.serviceApproved') : t('jobs.serviceRejected'))
      await syncProformaTotals(id)
      fetchJob()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const fetchParts = async () => {
    const { data } = await supabase.from('parts').select('*').eq('is_active', true).order('name')
    setParts(data || [])
  }

  const fetchLabourRates = async () => {
    const { data } = await supabase.from('labour_rates').select('*').eq('is_active', true).order('service_name')
    setLabourRates(data || [])
  }

  // Searchable combobox (input + datalist): the staff member types to filter the
  // catalog OR types a brand-new name to add a custom part/service. If the typed
  // text matches a catalog entry, its price fills in as an editable default;
  // otherwise it's a custom line with a manual price. (client req 2026-07-26 #5)
  const handlePartInput = (name) => {
    const part = parts.find(p => p.name?.trim().toLowerCase() === name.trim().toLowerCase())
    if (part) {
      setItemForm({
        ...itemForm,
        description: name,
        part_id: part.id,
        cost_price: part.cost_price ?? 0,
        selling_price: part.selling_price ?? 0,
      })
    } else {
      setItemForm({ ...itemForm, description: name, part_id: '' })
    }
  }

  const handleLabourInput = (name) => {
    const labour = labourRates.find(l => l.service_name?.trim().toLowerCase() === name.trim().toLowerCase())
    if (labour) {
      setItemForm({
        ...itemForm,
        description: name,
        labour_id: labour.id,
        quantity: labour.estimated_hours,
        cost_price: labour.cost_rate ?? 0,
        selling_price: labour.selling_rate ?? 0,
      })
    } else {
      setItemForm({ ...itemForm, description: name, labour_id: '' })
    }
  }

  const handleAddItem = async (e) => {
    e.preventDefault()
    try {
      // If job is in_progress, new items are additional and need approval
      // A fault the mechanic found is extra work by definition — nobody quoted
      // it and the customer has never seen it — so it always needs approval,
      // whatever state the card happens to be in. Without this an 'open' card
      // would price the finding straight through as pre-approved, which is the
      // opposite of what the workshop panel promises.
      const isAdditional = job.status === 'in_progress' || !!pricingFinding
      const payload = {
        job_card_id: id,
        item_type: itemType,
        description: itemForm.description,
        quantity: Number(itemForm.quantity),
        cost_price: Number(itemForm.cost_price),
        selling_price: Number(itemForm.selling_price),
        part_id: itemType === 'part' ? itemForm.part_id || null : null,
        labour_id: itemType === 'labour' ? itemForm.labour_id || null : null,
        is_additional: isAdditional,
        requires_approval: isAdditional,
        approval_status: isAdditional ? 'pending' : 'approved',
      }
      const { data: inserted, error } = await supabase
        .from('job_card_items').insert(payload).select('id').single()
      if (error) throw error

      // Note: the garage does not manage spare-part inventory in the system
      // (per client), so adding a part no longer decrements catalog stock.

      // Pricing a fault the mechanic reported closes that report out and links
      // the two, so the workshop can see what became of what it sent in.
      if (pricingFinding) {
        await supabase.from('job_findings').update({
          status: 'accepted',
          job_card_item_id: inserted?.id || null,
          reviewed_by: profile?.id || null,
          reviewed_at: new Date().toISOString(),
        }).eq('id', pricingFinding.id)
        setPricingFinding(null)
        fetchFindings(id).then(setFindings).catch(() => {})
      }

      toast.success(t('jobs.itemAdded'))
      setShowAddItem(false)
      setItemForm({ part_id: '', labour_id: '', description: '', quantity: 1, cost_price: 0, selling_price: 0 })
      // The job card is the only place these lines are edited, so it is also
      // the only place that can keep the quote honest.
      await syncProformaTotals(id)
      fetchJob()
      fetchParts()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const saveDescription = async () => {
    setSavingDesc(true)
    try {
      const { error } = await supabase.from('job_cards')
        .update({ description: descInput }).eq('id', id)
      if (error) throw error
      toast.success(t('jobs.descriptionSaved'))
      setEditingDesc(false)
      fetchJob()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingDesc(false)
    }
  }

  const handleDeleteItem = async (itemId) => {
    try {
      await supabase.from('job_card_items').delete().eq('id', itemId)
      toast.success(t('jobs.itemRemoved'))
      await syncProformaTotals(id)
      fetchJob()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const generateInvoice = async (type) => {
    try {
      // One proforma per job card (client req 28 Jul 2026). Pressing this button
      // twice used to mint a second quote for the same work; it now refreshes
      // the one that already exists so the customer keeps seeing one document.
      const existing = type === 'proforma' ? await findLiveProforma(id) : null

      const totals = totalsFromJobItems(items, existing?.vat_rate ?? DEFAULT_VAT_RATE)

      // Re-pricing a quote the customer has already paid against is allowed
      // (Antony, 4 Aug 2026 — he adds parts while the customer is still in the
      // workshop and takes the difference on the same proforma), but it moves a
      // number someone has already handed over money for, so say so first.
      const alreadyPaid = Number(existing?.amount_paid) || 0
      if (alreadyPaid > 0) {
        const refund = overpaymentOn(alreadyPaid, totals.total_amount)
        const warning = (refund > 0 ? t('invoices.retotalRefundConfirm') : t('invoices.retotalPaidConfirm'))
          .replace('{paid}', formatTZS(alreadyPaid))
          .replace('{total}', formatTZS(totals.total_amount))
          .replace('{balance}', formatTZS(Math.max(0, totals.total_amount - alreadyPaid)))
          .replace('{refund}', formatTZS(refund))
        if (!confirm(warning)) return
      }

      let invoiceId
      if (existing) {
        const { data, error } = await supabase.from('invoices')
          .update(proformaUpdateFor(existing, items)).eq('id', existing.id).select('id')
        if (error) throw error
        if (!data || data.length === 0) throw new Error(t('invoices.loadError'))
        invoiceId = existing.id
      } else {
        const { data, error } = await supabase.from('invoices').insert({
          job_card_id: id,
          customer_id: job.customer_id,
          invoice_type: type,
          ...totals,
        }).select('id').single()
        if (error) throw error
        invoiceId = data.id
      }

      // Generating a proforma fulfils any pending client request for one.
      if (type === 'proforma') {
        await supabase.from('proforma_requests')
          .update({ status: 'fulfilled' })
          .eq('job_card_id', id)
          .eq('status', 'pending')

        // Quoting the customer moves the job into processing (client request
        // 27 Jul 2026). Left alone once the job is finished or cancelled.
        if (job.status !== 'completed' && job.status !== 'cancelled') {
          await supabase.from('job_cards')
            .update({ status: 'in_progress' })
            .eq('id', id)
        }
      }
      toast.success(
        type !== 'proforma' ? t('invoices.invoiceGenerated')
          : existing ? t('invoices.proformaUpdated')
          : t('invoices.proformaGenerated')
      )
      navigate(`/admin/invoices/${invoiceId}`)
    } catch (err) {
      toast.error(err.message)
    }
  }

  const totalCost = items.reduce((sum, i) => sum + Number(i.total_cost || 0), 0)
  const totalSelling = items.reduce((sum, i) => sum + Number(i.total_selling || 0), 0)
  const profit = totalSelling - totalCost

  // What the live proforma would say if it were re-totalled right now — from the
  // shared helper, so the warning banner can't drift from the figure the quote
  // actually lands on.
  const proformaPaid = Number(liveProforma?.amount_paid) || 0
  const retotalled = liveProforma
    ? totalsFromJobItems(items, liveProforma.vat_rate).total_amount
    : 0
  const retotalledBalance = Math.max(0, retotalled - proformaPaid)
  const retotalledRefund = overpaymentOn(proformaPaid, retotalled)

  if (loading) return <div className="flex justify-center p-8"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div></div>
  if (!job) return null

  const statusColors = {
    pre_job_card: 'bg-purple-100 text-purple-700',
    pending_approval: 'bg-amber-100 text-amber-700',
    open: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    waiting_parts: 'bg-orange-100 text-orange-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
  }

  const isPreJobCard = job?.status === 'pre_job_card' || job?.status === 'pending_approval'

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/admin/job-cards')} className="p-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{job.job_number}</h1>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColors[job.status]}`}>
              {t(`jobs.statuses.${job.status}`)}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{formatDate(job.created_at)}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Share with customer */}
          <button onClick={() => {
            const url = `${window.location.origin}/c/${id}`
            navigator.clipboard.writeText(url)
            toast.success(t('inspection.linkCopied'))
          }}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium">
            <Share2 className="w-4 h-4" /> {t('common.share')}
          </button>
          {/* Assigning a mechanic used to be possible only while the card was
              still a pre-job card, so a job that went official unassigned could
              never reach anyone's phone. Available now for the whole life of the
              job, until it is closed. */}
          {job.status !== 'completed' && job.status !== 'cancelled' && (
            <button onClick={() => { setTechName(job.assigned_technician || ''); setTechId(job.assigned_mechanic_id || ''); setShowAssignTech(true) }}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
              <UserPlus className="w-4 h-4" />
              {job.assigned_mechanic_id ? t('jobs.changeMechanic') : t('preJobCard.assignTechnician')}
            </button>
          )}
          {isPreJobCard ? (
            <>
              <button onClick={generateOfficialJobCard}
                className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
                <CheckCircle2 className="w-4 h-4" /> {t('preJobCard.generateJobCard')}
              </button>
            </>
          ) : (
            /* Only the proforma starts here — the final invoice is generated
               from inside the proforma, so quoting always precedes billing. */
            <button onClick={() => generateInvoice('proforma')}
              className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
              <FileText className="w-4 h-4" />
              {liveProforma
                ? `${t('jobs.updateProforma')} · ${liveProforma.invoice_number}`
                : t('jobs.generateProforma')}
            </button>
          )}
        </div>
      </div>

      {/* Money has already changed hands against this job's quote, and every
          edit below re-prices it (Antony, 4 Aug 2026 — add the part while the
          customer is still here and take the difference). Standing warning
          rather than a prompt per line, so staff can see what he owes while
          they work instead of dismissing the same dialog five times. */}
      {proformaPaid > 0 && (
        <div className={`flex items-start gap-2.5 p-4 border rounded-xl text-sm ${
          retotalledRefund > 0 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
        }`}>
          <AlertCircle className={`w-5 h-5 shrink-0 mt-0.5 ${retotalledRefund > 0 ? 'text-red-600' : 'text-amber-600'}`} />
          <div className={retotalledRefund > 0 ? 'text-red-800' : 'text-amber-800'}>
            <p className="font-semibold">
              {retotalledRefund > 0 ? t('jobs.proformaOverpaidWarning') : t('jobs.proformaPaidWarning')}
            </p>
            <p className="mt-0.5">
              {(retotalledRefund > 0 ? t('jobs.proformaOverpaidBalance') : t('jobs.proformaPaidBalance'))
                .replace('{paid}', formatTZS(proformaPaid))
                .replace('{total}', formatTZS(retotalled))
                .replace('{balance}', formatTZS(retotalledBalance))
                .replace('{refund}', formatTZS(retotalledRefund))}
            </p>
          </div>
        </div>
      )}

      {/* Job Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Customer Info */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-3">{t('jobs.customer')}</h3>
          <div className="space-y-2 text-sm">
            <p><span className="text-gray-500">{t('customers.name')}:</span> <span className="font-medium">{job.customers?.full_name}</span></p>
            <p><span className="text-gray-500">{t('customers.phone')}:</span> {job.customers?.phone}</p>
            {job.customers?.email && <p><span className="text-gray-500">{t('customers.email')}:</span> {job.customers?.email}</p>}
            {job.customers?.company_name && <p><span className="text-gray-500">{t('customers.company')}:</span> {job.customers?.company_name}</p>}
          </div>
        </div>

        {/* Vehicle Info */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-3">{t('jobs.vehicle')}</h3>
          <div className="space-y-2 text-sm">
            <p><span className="text-gray-500">{t('vehicles.regNumber')}:</span> <span className="font-bold">{job.vehicles?.registration_number}</span></p>
            <p><span className="text-gray-500">{t('vehicles.make')}:</span> {job.vehicles?.make} {job.vehicles?.model} {job.vehicles?.year ? `(${job.vehicles.year})` : ''}</p>
            <p><span className="text-gray-500">{t('jobs.mileageIn')}:</span> {job.mileage_in?.toLocaleString() || '-'} km</p>
            <p><span className="text-gray-500">{t('jobs.fuelLevel')}:</span> {job.fuel_level || '-'}</p>
          </div>
        </div>
      </div>

      {/* Work Description */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-900">{t('jobs.description')}</h3>
          {job.status !== 'completed' && job.status !== 'cancelled' && !editingDesc && (
            <button onClick={() => { setDescInput(job.description || ''); setEditingDesc(true) }}
              className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium">
              <Pencil className="w-3.5 h-3.5" /> {t('jobs.editDescription')}
            </button>
          )}
        </div>
        {editingDesc ? (
          <div>
            <textarea value={descInput} onChange={e => setDescInput(e.target.value)} rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder={t('jobs.descriptionPlaceholder')} />
            <div className="flex gap-2 mt-2">
              <button onClick={saveDescription} disabled={savingDesc}
                className="px-3 py-1.5 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-40">{t('common.save')}</button>
              <button onClick={() => setEditingDesc(false)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">{t('common.cancel')}</button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-700 whitespace-pre-line">{job.description || <span className="text-gray-400">{t('common.noData')}</span>}</p>
        )}
        {job.diagnosis && (
          <>
            <h3 className="font-semibold text-gray-900 mt-4 mb-2">{t('jobs.diagnosis')}</h3>
            <p className="text-sm text-gray-700">{job.diagnosis}</p>
          </>
        )}
      </div>

      {/* Assigned Technician */}
      {job.assigned_technician && (
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UserPlus className="w-5 h-5 text-blue-600" />
            <div>
              <p className="text-sm text-gray-500">{t('preJobCard.assignTechnician')}</p>
              <p className="font-semibold text-blue-700">{job.assigned_technician}</p>
            </div>
          </div>
          {!isPreJobCard && job.status !== 'completed' && (
            <button onClick={() => { setTechName(job.assigned_technician); setTechId(job.assigned_mechanic_id || ''); setShowAssignTech(true) }}
              className="text-xs text-blue-600 hover:underline">{t('jobs.change')}</button>
          )}
        </div>
      )}

      {/* Pre-Job Card: Inspection Findings Approval */}
      {isPreJobCard && inspectionItems.length > 0 && (
        <div className="bg-white rounded-xl border-2 border-purple-200 overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-purple-100 bg-purple-50">
            <div>
              <h3 className="font-semibold text-purple-900">{t('preJobCard.title')}</h3>
              <p className="text-xs text-purple-600 mt-0.5">{t('preJobCard.description')}</p>
            </div>
            <button onClick={approveAllItems}
              className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">
              {t('preJobCard.approveAll')}
            </button>
          </div>
          <div className="divide-y divide-gray-100">
            {inspectionItems.map((item, idx) => (
              <div key={item.id} className={`p-4 ${item.customer_approved === false ? 'bg-red-50/50' : item.customer_approved === true ? 'bg-green-50/50' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-gray-400">#{idx + 1}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        item.severity === 'critical' ? 'bg-red-100 text-red-700' :
                        item.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                        item.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {t(`inspection.severities.${item.severity}`)}
                      </span>
                      {item.customer_approved === true && (
                        <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> {t('preJobCard.approved')}
                        </span>
                      )}
                      {item.customer_approved === false && (
                        <span className="text-xs text-red-600 font-medium flex items-center gap-1">
                          <XCircle className="w-3 h-3" /> {t('preJobCard.rejected')}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-gray-900">{item.problem_description}</p>
                    {item.recommended_action && <p className="text-sm text-blue-600 mt-0.5">{item.recommended_action}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold mr-2">{formatTZS(item.estimated_cost)}</span>
                    <button onClick={() => toggleItemApproval(item.id, true)}
                      className={`p-1.5 rounded-lg ${item.customer_approved === true ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-400 hover:bg-green-100 hover:text-green-600'}`}>
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => toggleItemApproval(item.id, false)}
                      className={`p-1.5 rounded-lg ${item.customer_approved === false ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-400 hover:bg-red-100 hover:text-red-600'}`}>
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            <div className="p-4 bg-purple-50 flex justify-between items-center">
              <span className="text-sm font-medium text-purple-700">
                {inspectionItems.filter(i => i.customer_approved === true).length} of {inspectionItems.length} approved
              </span>
              <span className="font-bold">
                {t('jobs.approvedTotal')}: {formatTZS(inspectionItems.filter(i => i.customer_approved === true).reduce((s, i) => s + Number(i.estimated_cost || 0), 0))}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Items Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">{t('jobs.items')}</h3>
          {job.status !== 'completed' && job.status !== 'cancelled' && (
            <div className="flex gap-2">
              <button onClick={() => { setItemType('part'); setShowAddItem(true) }}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100">
                <Package className="w-3.5 h-3.5" /> {t('jobs.addPart')}
              </button>
              <button onClick={() => { setItemType('labour'); setShowAddItem(true) }}
                className="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-sm font-medium hover:bg-green-100">
                <Wrench className="w-3.5 h-3.5" /> {t('jobs.addLabour')}
              </button>
              <button onClick={() => { setItemType('additional'); setShowAddItem(true) }}
                className="flex items-center gap-1 px-3 py-1.5 bg-orange-50 text-orange-700 rounded-lg text-sm font-medium hover:bg-orange-100">
                <DollarSign className="w-3.5 h-3.5" /> {t('jobs.addAdditional')}
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left p-3 font-medium text-gray-600">{t('common.type')}</th>
                <th className="text-left p-3 font-medium text-gray-600">{t('common.description')}</th>
                <th className="text-right p-3 font-medium text-gray-600">{t('common.quantity')}</th>
                {canViewInternal && <th className="text-right p-3 font-medium text-gray-600">{t('common.cost')}</th>}
                <th className="text-right p-3 font-medium text-gray-600">{t('common.price')}</th>
                {canViewInternal && <th className="text-right p-3 font-medium text-gray-600">{t('jobs.totalCost')}</th>}
                <th className="text-right p-3 font-medium text-gray-600">{t('common.total')}</th>
                <th className="text-right p-3 font-medium text-gray-600"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.length === 0 ? (
                <tr><td colSpan="8" className="p-8 text-center text-gray-400">{t('common.noData')}</td></tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium capitalize ${
                          item.item_type === 'part' ? 'bg-blue-50 text-blue-700' :
                          item.item_type === 'labour' ? 'bg-green-50 text-green-700' :
                          'bg-orange-50 text-orange-700'
                        }`}>{item.item_type}</span>
                        {item.is_additional && (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            item.approval_status === 'pending' ? 'bg-amber-100 text-amber-700' :
                            item.approval_status === 'rejected' ? 'bg-red-100 text-red-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {item.approval_status === 'pending' ? 'Pending' : item.approval_status === 'rejected' ? 'Rejected' : 'OK'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-gray-700">{item.description}</td>
                    <td className="p-3 text-right text-gray-700">{item.quantity}</td>
                    {canViewInternal && <td className="p-3 text-right text-gray-500">{formatTZS(item.cost_price)}</td>}
                    <td className="p-3 text-right text-gray-700">{formatTZS(item.selling_price)}</td>
                    {canViewInternal && <td className="p-3 text-right text-gray-500">{formatTZS(item.total_cost)}</td>}
                    <td className="p-3 text-right font-medium">{formatTZS(item.total_selling)}</td>
                    <td className="p-3 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        {item.is_additional && item.approval_status === 'pending' && isManager && (
                          <>
                            <button onClick={() => approveAdditionalItem(item.id, true)} className="p-1 rounded hover:bg-green-50" title="Approve">
                              <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                            </button>
                            <button onClick={() => approveAdditionalItem(item.id, false)} className="p-1 rounded hover:bg-red-50" title="Reject">
                              <XCircle className="w-3.5 h-3.5 text-red-500" />
                            </button>
                          </>
                        )}
                        {job.status !== 'completed' && (
                          <button onClick={() => handleDeleteItem(item.id)} className="p-1 rounded hover:bg-red-50">
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="border-t-2 border-gray-200">
              <tr className="bg-gray-50">
                <td colSpan={canViewInternal ? 5 : 4} className="p-3 text-right font-semibold">{t('jobs.totalSelling')}:</td>
                {canViewInternal && <td className="p-3 text-right text-gray-500 font-semibold">{formatTZS(totalCost)}</td>}
                <td className="p-3 text-right font-bold text-lg">{formatTZS(totalSelling)}</td>
                <td></td>
              </tr>
              {canViewInternal && (
                <tr className="bg-green-50">
                  <td colSpan={6} className="p-3 text-right font-semibold text-green-700">{t('jobs.profit')}:</td>
                  <td className="p-3 text-right font-bold text-lg text-green-700">{formatTZS(profit)}</td>
                  <td></td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      </div>

      {/* Faults the workshop found that nobody asked for (migration 032).
          The mechanic files words and a photo; pricing is the office's job, and
          the priced line then goes through the normal additional-item approval. */}
      {findings.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-1">
            <Flag className="w-5 h-5 text-red-500" /> {t('jobs.reportedFaults')}
          </h2>
          <p className="text-xs text-gray-500 mb-4">{t('jobs.reportedFaultsHint')}</p>
          <div className="space-y-3">
            {findings.map((f) => (
              <div key={f.id} className={`flex items-start gap-3 p-3 rounded-lg border ${
                f.status === 'pending' ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'
              }`}>
                {f.evidence_path && (
                  <a href={evidenceUrl(f.evidence_path)} target="_blank" rel="noreferrer" className="flex-shrink-0">
                    <img src={evidenceUrl(f.evidence_path)} alt="" loading="lazy"
                      className="w-16 h-16 object-cover rounded border border-gray-200" />
                  </a>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">{f.description}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-gray-500">
                      {t(`inspection.severities.${f.severity}`)} · {formatDate(f.created_at)}
                    </span>
                    {f.status !== 'pending' && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        f.status === 'accepted' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {t(`mechanic.job.faultStatuses.${f.status}`)}
                      </span>
                    )}
                  </div>
                </div>
                {f.status === 'pending' && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => priceFinding(f)}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs font-medium">
                      {t('jobs.priceFault')}
                    </button>
                    <button onClick={() => declineFinding(f)}
                      className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 text-xs font-medium">
                      {t('jobs.dismissFault')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Evidence the mechanic uploaded from the workshop (migration 030) */}
      {evidence.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-1">
            <Camera className="w-5 h-5 text-blue-600" /> {t('jobs.evidence')}
          </h2>
          <p className="text-xs text-gray-500 mb-4">{t('jobs.evidenceHint')}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {evidence.map((ev) => (
              <a key={ev.id} href={evidenceUrl(ev.storage_path)} target="_blank" rel="noreferrer" className="block">
                <img src={evidenceUrl(ev.storage_path)} alt={ev.caption || ''} loading="lazy"
                  className="w-full h-28 object-cover rounded-lg border border-gray-200 hover:opacity-90 transition" />
                <p className="text-[11px] text-gray-400 mt-1">{formatDate(ev.created_at)}</p>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Assign Technician Modal */}
      {showAssignTech && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold">{t('preJobCard.assignTechnician')}</h2>
              <button onClick={() => setShowAssignTech(false)} className="p-1 rounded hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={assignTechnician} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('jobs.selectMechanic')} *</label>
                {mechanics.length === 0 ? (
                  <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3">
                    {t('jobs.noMechanics')}
                  </p>
                ) : (
                  <select value={techId} onChange={e => setTechId(e.target.value)} required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                    <option value="">{t('jobs.selectMechanic')}</option>
                    {mechanics.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                )}
                <p className="text-xs text-gray-400 mt-1.5">{t('jobs.mechanicAssignHint')}</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 py-2.5 bg-blue-700 text-white font-medium rounded-lg hover:bg-blue-800 transition">
                  {t('common.save')}
                </button>
                <button type="button" onClick={() => setShowAssignTech(false)}
                  className="px-6 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition">
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Item Modal */}
      {showAddItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold capitalize">
                {itemType === 'part' ? t('jobs.addPart') : itemType === 'labour' ? t('jobs.addLabour') : t('jobs.addAdditional')}
              </h2>
              <button onClick={() => setShowAddItem(false)} className="p-1 rounded hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddItem} className="p-5 space-y-4">
              {itemType === 'part' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('jobs.selectPart')}</label>
                  <input type="text" list="parts-catalog" value={itemForm.description}
                    onChange={e => handlePartInput(e.target.value)} required
                    placeholder={t('jobs.searchOrType')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                  <datalist id="parts-catalog">
                    {parts.map(p => <option key={p.id} value={p.name} />)}
                  </datalist>
                  <p className="text-xs text-gray-400 mt-1.5">{t('jobs.pickerHint')}</p>
                </div>
              )}
              {itemType === 'labour' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('jobs.selectService')}</label>
                  <input type="text" list="labour-catalog" value={itemForm.description}
                    onChange={e => handleLabourInput(e.target.value)} required
                    placeholder={t('jobs.searchOrType')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                  <datalist id="labour-catalog">
                    {labourRates.map(l => <option key={l.id} value={l.service_name} />)}
                  </datalist>
                  <p className="text-xs text-gray-400 mt-1.5">{t('jobs.pickerHint')}</p>
                </div>
              )}
              {itemType === 'additional' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.description')} *</label>
                  <input type="text" value={itemForm.description} onChange={e => setItemForm({...itemForm, description: e.target.value})} required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.quantity')}</label>
                  <input type="number" value={itemForm.quantity} onChange={e => setItemForm({...itemForm, quantity: e.target.value})}
                    min="0.1" step="0.1" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                {canViewInternal && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.cost')} (TZS)</label>
                    <input type="number" value={itemForm.cost_price} onChange={e => setItemForm({...itemForm, cost_price: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.price')} (TZS)</label>
                  <input type="number" value={itemForm.selling_price} onChange={e => setItemForm({...itemForm, selling_price: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              {canViewInternal && (
                <div className="bg-green-50 p-3 rounded-lg text-sm">
                  <p className="text-green-700">
                    {t('jobs.profitPerUnit')}: {formatTZS(Number(itemForm.selling_price) - Number(itemForm.cost_price))} |
                    {t('common.total')}: {formatTZS((Number(itemForm.selling_price) - Number(itemForm.cost_price)) * Number(itemForm.quantity))}
                  </p>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 py-2.5 bg-blue-700 text-white font-medium rounded-lg hover:bg-blue-800 transition">
                  {t('common.save')}
                </button>
                <button type="button" onClick={() => setShowAddItem(false)}
                  className="px-6 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition">
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
