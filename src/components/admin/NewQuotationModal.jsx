import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { DEFAULT_VAT_RATE } from '../../lib/billing'
import { X, FileText } from 'lucide-react'
import toast from 'react-hot-toast'

// A quotation that starts from the customer, not from a job card (migration
// 041; Antony, 25 Sep 2026). Nothing here that only a workshop visit can
// answer: no fuel level, no mileage, no promise date. The vehicle is optional
// — a customer may want a price for a truck that is not on file, or has no
// truck yet — and a free-text subject says what the quote is for instead.
//
// It creates the proforma empty and opens it; the lines are written on the
// invoice page, which edits invoice_items for a quotation with no job card.
export default function NewQuotationModal({ onClose, t }) {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [form, setForm] = useState({ customer_id: '', vehicle_id: '', subject: '', vat_rate: String(DEFAULT_VAT_RATE) })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('customers')
      .select('id, full_name, company_name, phone')
      .neq('status', 'rejected')
      .order('full_name')
      .then(({ data }) => setCustomers(data || []))
  }, [])

  const pickCustomer = async (customer_id) => {
    setForm(f => ({ ...f, customer_id, vehicle_id: '' }))
    if (!customer_id) { setVehicles([]); return }
    const { data } = await supabase.from('vehicles')
      .select('id, registration_number, make, model')
      .eq('customer_id', customer_id)
      .order('created_at', { ascending: false })
    setVehicles(data || [])
  }

  const create = async (e) => {
    e.preventDefault()
    if (!form.customer_id) { toast.error(t('invoices.pickCustomer')); return }
    const vat = Number(form.vat_rate)
    if (isNaN(vat) || vat < 0 || vat > 100) { toast.error(t('invoices.invalidVat')); return }
    setSaving(true)
    try {
      const { data, error } = await supabase.from('invoices').insert({
        invoice_type: 'proforma',
        status: 'draft',
        customer_id: form.customer_id,
        vehicle_id: form.vehicle_id || null,
        subject: form.subject.trim() || null,
        job_card_id: null,
        vat_rate: vat,
        subtotal_parts: 0, subtotal_labour: 0, subtotal_additional: 0,
        vat_amount: 0, total_amount: 0,
        internal_cost_parts: 0, internal_cost_labour: 0,
        profit_parts: 0, profit_labour: 0, profit_total: 0, profit_margin: 0,
      }).select('id').single()
      if (error) throw error
      toast.success(t('invoices.quotationCreated'))
      onClose()
      navigate(`/admin/invoices/${data.id}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const label = (c) => c.company_name ? `${c.full_name} — ${c.company_name}` : c.full_name

  return (
    <div className="fixed inset-0 glass-overlay z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md modal-card">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-700" /> {t('invoices.newQuotation')}
          </h2>
          <button onClick={onClose} className="tap p-1 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={create} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('invoices.customer')} *</label>
            <select value={form.customer_id} onChange={e => pickCustomer(e.target.value)} required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="">-- {t('invoices.pickCustomer')} --</option>
              {customers.map(c => <option key={c.id} value={c.id}>{label(c)}{c.phone ? ` · ${c.phone}` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('jobs.vehicle')} <span className="text-gray-400 font-normal">({t('invoices.vehicleOptional')})</span></label>
            <select value={form.vehicle_id} onChange={e => setForm({ ...form, vehicle_id: e.target.value })}
              disabled={!form.customer_id}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-50">
              <option value="">{t('invoices.noVehicle')}</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.registration_number} — {v.make} {v.model || ''}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('invoices.quotationSubject')}</label>
            <input type="text" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })}
              placeholder={t('invoices.quotationSubjectHint')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('invoices.vat')} (%)</label>
            <input type="number" min="0" max="100" step="any" value={form.vat_rate}
              onChange={e => setForm({ ...form, vat_rate: e.target.value })}
              className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <p className="text-xs text-gray-500">{t('invoices.quotationLinesHint')}</p>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 bg-blue-700 text-white font-medium rounded-lg hover:bg-blue-800 transition disabled:opacity-50">
              {saving ? t('common.saving') : t('invoices.createQuotation')}
            </button>
            <button type="button" onClick={onClose}
              className="px-6 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition">
              {t('common.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
