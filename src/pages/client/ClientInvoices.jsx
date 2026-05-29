import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { useClient } from '../../contexts/ClientAuthContext'
import { supabase, formatTZS, formatDate } from '../../lib/supabase'
import { FileText, ArrowRight, CheckCircle2 } from 'lucide-react'

export default function ClientInvoices() {
  const { t } = useLanguage()
  const { customer } = useClient()
  const [invoices, setInvoices] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (customer?.id) fetchInvoices()
  }, [customer?.id])

  const fetchInvoices = async () => {
    try {
      const { data } = await supabase
        .from('invoices')
        .select('*, vehicles(registration_number), job_cards(job_number)')
        .eq('customer_id', customer.id)
        .in('invoice_type', ['proforma', 'final'])
        .order('created_at', { ascending: false })
      setInvoices(data || [])
    } catch (err) {
      console.error('Invoices error:', err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = filter === 'all' ? invoices
    : filter === 'unpaid' ? invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled')
    : invoices.filter(i => i.status === 'paid')

  const statusColors = {
    draft: 'bg-gray-100 text-gray-600',
    sent: 'bg-blue-100 text-blue-700',
    approved: 'bg-purple-100 text-purple-700',
    negotiating: 'bg-amber-100 text-amber-700',
    paid: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
  }

  const typeLabels = {
    proforma: t('invoices.proforma'),
    final: t('invoices.final'),
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-gray-900">{t('client.invoices.title')}</h1>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {['all', 'unpaid', 'paid'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-blue-700 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t(`client.invoices.filter.${f}`)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">{t('client.invoices.noInvoices')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((inv) => (
            <Link
              key={inv.id}
              to={`/client/invoices/${inv.id}`}
              className="block bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md active:scale-[0.99] transition"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900 text-sm">{inv.invoice_number}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                    {typeLabels[inv.invoice_type] || inv.invoice_type}
                  </span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[inv.status] || 'bg-gray-100 text-gray-600'}`}>
                  {t(`invoices.statuses.${inv.status}`)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">{inv.vehicles?.registration_number} · {inv.job_cards?.job_number}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDate(inv.created_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold text-gray-900">{formatTZS(inv.total_amount)}</p>
                  <ArrowRight className="w-4 h-4 text-gray-300" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
