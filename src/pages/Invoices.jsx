import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase, formatTZS, formatDate } from '../lib/supabase'
import { sendSMS, smsTemplates } from '../lib/sms'
import { Search, Filter, Eye, FileText } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Invoices() {
  const { t } = useLanguage()
  const { canViewInternal } = useAuth()
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  // #2: proforma and final invoices live in their own sections (Antony: "don't mix them").
  // Remember the last section the user was on; ignore a stale 'internal' pref for
  // non-managers (that tab isn't rendered for them).
  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem('malibora_invoice_tab')
    if (saved === 'internal' && !canViewInternal) return 'proforma'
    return saved || 'proforma'
  })
  const [statusFilter, setStatusFilter] = useState('all')

  const selectTab = (key) => {
    setActiveTab(key)
    localStorage.setItem('malibora_invoice_tab', key)
  }

  useEffect(() => { fetchInvoices() }, [])

  // First visit only (no saved preference): if the default Proforma section is empty,
  // land on the first section that actually has invoices instead of a blank list.
  useEffect(() => {
    if (loading || localStorage.getItem('malibora_invoice_tab')) return
    const order = ['proforma', 'final', ...(canViewInternal ? ['internal'] : [])]
    const firstNonEmpty = order.find(k => invoices.some(i => i.invoice_type === k))
    if (firstNonEmpty) setActiveTab(firstNonEmpty)
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchInvoices = async () => {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          customers(full_name, phone),
          job_cards(job_number, vehicles(registration_number))
        `)
        .order('created_at', { ascending: false })
      if (error) throw error
      setInvoices(data || [])
    } catch (err) {
      toast.error(t('invoices.loadError'))
    } finally {
      setLoading(false)
    }
  }

  const updateStatus = async (id, status) => {
    try {
      const update = { status }
      if (status === 'paid') update.paid_at = new Date().toISOString()
      await supabase.from('invoices').update(update).eq('id', id)
      // Notify the customer when an invoice is sent to them (non-blocking).
      if (status === 'sent') {
        const inv = invoices.find(i => i.id === id)
        if (inv) sendSMS({
          to: inv.customers?.phone,
          message: smsTemplates.invoice_ready(inv.customers?.full_name, inv.invoice_number, formatTZS(inv.total_amount)),
          event: 'invoice_ready',
          customerId: inv.customer_id,
        })
      }
      toast.success(t('invoices.updated'))
      fetchInvoices()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // Search + status apply within every section; the active tab picks the type.
  const matchesFilters = (inv) => {
    const matchSearch = inv.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
      inv.customers?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      inv.job_cards?.job_number?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || inv.status === statusFilter
    return matchSearch && matchStatus
  }

  const inScope = invoices.filter(matchesFilters)
  const counts = {
    proforma: inScope.filter(i => i.invoice_type === 'proforma').length,
    final: inScope.filter(i => i.invoice_type === 'final').length,
    internal: inScope.filter(i => i.invoice_type === 'internal').length,
  }
  const tabs = [
    { key: 'proforma', label: t('invoices.tabProforma') },
    { key: 'final', label: t('invoices.tabFinal') },
    ...(canViewInternal ? [{ key: 'internal', label: t('invoices.tabInternal') }] : []),
  ]
  const filtered = inScope.filter(inv => inv.invoice_type === activeTab)

  const statusColors = {
    draft: 'bg-gray-100 text-gray-600',
    sent: 'bg-blue-100 text-blue-700',
    approved: 'bg-green-100 text-green-700',
    negotiating: 'bg-amber-100 text-amber-700',
    partial: 'bg-orange-100 text-orange-700',
    paid: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-red-100 text-red-700',
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{t('invoices.title')}</h1>
      </div>

      {/* #2: separate Proforma / Final (/ Internal) sections */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => selectTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {tab.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              activeTab === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
            }`}>{counts[tab.key]}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t('invoices.search')}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm">
          <option value="all">{t('common.all')} {t('invoices.status')}</option>
          <option value="draft">{t('invoices.statuses.draft')}</option>
          <option value="sent">{t('invoices.statuses.sent')}</option>
          <option value="approved">{t('invoices.statuses.approved')}</option>
          <option value="partial">{t('invoices.statuses.partial')}</option>
          <option value="paid">{t('invoices.statuses.paid')}</option>
        </select>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center p-8">
            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-gray-500">{t('invoices.noneInSection')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left p-3 font-medium text-gray-600">{t('invoices.number')}</th>
                  <th className="text-left p-3 font-medium text-gray-600">{t('invoices.customer')}</th>
                  <th className="text-left p-3 font-medium text-gray-600 hidden md:table-cell">{t('invoices.job')}</th>
                  <th className="text-right p-3 font-medium text-gray-600">{t('invoices.total')}</th>
                  {canViewInternal && <th className="text-right p-3 font-medium text-gray-600 hidden lg:table-cell">{t('invoices.profitMargin')}</th>}
                  <th className="text-center p-3 font-medium text-gray-600">{t('invoices.status')}</th>
                  <th className="text-left p-3 font-medium text-gray-600 hidden lg:table-cell">{t('common.created')}</th>
                  <th className="text-right p-3 font-medium text-gray-600">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="p-3">
                      <Link to={`/admin/invoices/${inv.id}`} className="font-medium text-blue-700 hover:text-blue-800">
                        {inv.invoice_number}
                      </Link>
                    </td>
                    <td className="p-3 text-gray-700">{inv.customers?.full_name}</td>
                    <td className="p-3 hidden md:table-cell">
                      <Link to={`/admin/job-cards/${inv.job_card_id}`} className="text-blue-600 hover:text-blue-700 text-xs">
                        {inv.job_cards?.job_number}
                      </Link>
                    </td>
                    <td className="p-3 text-right font-semibold">{formatTZS(inv.total_amount)}</td>
                    {canViewInternal && (
                      <td className="p-3 text-right hidden lg:table-cell">
                        <span className={`text-sm font-medium ${Number(inv.profit_margin) > 20 ? 'text-green-600' : 'text-orange-600'}`}>
                          {Number(inv.profit_margin).toFixed(1)}%
                        </span>
                      </td>
                    )}
                    <td className="p-3 text-center">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[inv.status]}`}>
                        {t(`invoices.statuses.${inv.status}`)}
                      </span>
                    </td>
                    <td className="p-3 hidden lg:table-cell text-gray-500 text-xs">{formatDate(inv.created_at)}</td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link to={`/admin/invoices/${inv.id}`} className="p-1.5 rounded hover:bg-blue-50">
                          <Eye className="w-4 h-4 text-blue-600" />
                        </Link>
                        {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                          <select value="" onChange={e => { if (e.target.value) updateStatus(inv.id, e.target.value) }}
                            className="text-xs border border-gray-300 rounded px-1.5 py-1 outline-none">
                            <option value="">{t('invoices.update')}</option>
                            <option value="sent">{t('invoices.statuses.sent')}</option>
                            <option value="approved">{t('invoices.statuses.approved')}</option>
                            <option value="paid">{t('invoices.statuses.paid')}</option>
                            <option value="cancelled">{t('invoices.statuses.cancelled')}</option>
                          </select>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
