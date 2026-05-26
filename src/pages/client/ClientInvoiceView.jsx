import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase, formatTZS, formatDate } from '../../lib/supabase'
import { ArrowLeft, FileText, CheckCircle2, XCircle, Phone } from 'lucide-react'

export default function ClientInvoiceView() {
  const { id } = useParams()
  const { t } = useLanguage()
  const [invoice, setInvoice] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchInvoice() }, [id])

  const fetchInvoice = async () => {
    try {
      const { data: inv } = await supabase
        .from('invoices')
        .select('*, customers(full_name, phone, company, address), vehicles(registration_number, make, model), job_cards(job_number)')
        .eq('id', id)
        .single()

      if (inv) {
        setInvoice(inv)
        const { data: jobItems } = await supabase
          .from('job_card_items')
          .select('*')
          .eq('job_card_id', inv.job_card_id)
          .order('item_type', { ascending: true })
        setItems(jobItems || [])
      }
    } catch (err) {
      console.error('Invoice error:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="text-center py-12">
        <XCircle className="w-12 h-12 text-red-300 mx-auto mb-3" />
        <p className="text-gray-500">{t('common.noData')}</p>
        <Link to="/client/invoices" className="text-blue-600 text-sm mt-2 inline-block">{t('common.back')}</Link>
      </div>
    )
  }

  const parts = items.filter(i => i.item_type === 'part')
  const labour = items.filter(i => i.item_type === 'labour')
  const additional = items.filter(i => i.item_type === 'additional')

  return (
    <div className="space-y-4">
      <Link to="/client/invoices" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> {t('common.back')}
      </Link>

      {/* Invoice Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-bold text-gray-900">{invoice.invoice_number}</p>
              <p className="text-xs text-gray-500">
                {invoice.invoice_type === 'proforma' ? t('invoices.proforma') : t('invoices.final')}
              </p>
            </div>
          </div>
          <span className={`text-xs px-3 py-1 rounded-full font-medium ${
            invoice.status === 'paid' ? 'bg-green-100 text-green-700' :
            invoice.status === 'approved' ? 'bg-purple-100 text-purple-700' :
            'bg-blue-100 text-blue-700'
          }`}>
            {t(`invoices.statuses.${invoice.status}`)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-gray-400 text-xs">{t('invoices.customer')}</p>
            <p className="font-medium text-gray-900">{invoice.customers?.full_name}</p>
            {invoice.customers?.company && <p className="text-xs text-gray-500">{invoice.customers.company}</p>}
          </div>
          <div>
            <p className="text-gray-400 text-xs">{t('customerView.vehicle')}</p>
            <p className="font-medium text-gray-900">{invoice.vehicles?.registration_number}</p>
            <p className="text-xs text-gray-500">{invoice.vehicles?.make} {invoice.vehicles?.model}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs">{t('invoices.job')}</p>
            <p className="font-medium text-gray-900">{invoice.job_cards?.job_number}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs">{t('common.created')}</p>
            <p className="font-medium text-gray-900">{formatDate(invoice.created_at)}</p>
          </div>
        </div>
      </div>

      {/* Items Breakdown (customer-facing: only selling prices) */}
      {parts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-3 bg-gray-50 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">{t('invoices.partsMaterials')}</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {parts.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 truncate">{item.description}</p>
                  <p className="text-xs text-gray-400">{item.quantity} x {formatTZS(item.selling_price || item.unit_price)}</p>
                </div>
                <p className="text-sm font-medium text-gray-900 ml-3">
                  {formatTZS((item.selling_price || item.unit_price) * item.quantity)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {labour.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-3 bg-gray-50 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">{t('invoices.labourServices')}</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {labour.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 truncate">{item.description}</p>
                  <p className="text-xs text-gray-400">{item.quantity} x {formatTZS(item.selling_price || item.unit_price)}</p>
                </div>
                <p className="text-sm font-medium text-gray-900 ml-3">
                  {formatTZS((item.selling_price || item.unit_price) * item.quantity)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {additional.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-3 bg-gray-50 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">{t('invoices.additionalCosts')}</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {additional.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 truncate">{item.description}</p>
                </div>
                <p className="text-sm font-medium text-gray-900 ml-3">
                  {formatTZS((item.selling_price || item.unit_price) * (item.quantity || 1))}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Totals */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        {invoice.subtotal_parts > 0 && (
          <div className="flex justify-between text-sm py-1">
            <span className="text-gray-500">{t('invoices.subtotalParts')}</span>
            <span className="text-gray-900">{formatTZS(invoice.subtotal_parts)}</span>
          </div>
        )}
        {invoice.subtotal_labour > 0 && (
          <div className="flex justify-between text-sm py-1">
            <span className="text-gray-500">{t('invoices.subtotalLabour')}</span>
            <span className="text-gray-900">{formatTZS(invoice.subtotal_labour)}</span>
          </div>
        )}
        {invoice.subtotal_additional > 0 && (
          <div className="flex justify-between text-sm py-1">
            <span className="text-gray-500">{t('invoices.subtotalAdditional')}</span>
            <span className="text-gray-900">{formatTZS(invoice.subtotal_additional)}</span>
          </div>
        )}
        {invoice.vat_amount > 0 && (
          <div className="flex justify-between text-sm py-1">
            <span className="text-gray-500">{t('invoices.vat')}</span>
            <span className="text-gray-900">{formatTZS(invoice.vat_amount)}</span>
          </div>
        )}
        {invoice.discount_amount > 0 && (
          <div className="flex justify-between text-sm py-1">
            <span className="text-gray-500">{t('invoices.discount')}</span>
            <span className="text-green-600">-{formatTZS(invoice.discount_amount)}</span>
          </div>
        )}
        <div className="flex justify-between text-base py-2 mt-1 border-t border-gray-200">
          <span className="font-bold text-gray-900">{t('invoices.total')}</span>
          <span className="font-bold text-gray-900 text-lg">{formatTZS(invoice.total_amount)}</span>
        </div>
        {invoice.status === 'paid' && invoice.payment_date && (
          <div className="mt-2 p-2.5 bg-green-50 rounded-lg flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <p className="text-xs text-green-700">
              {t('invoices.paidOn')} {formatDate(invoice.payment_date)}
              {invoice.payment_method && ` · ${t(`paymentMethods.${invoice.payment_method}`)}`}
            </p>
          </div>
        )}
      </div>

      {/* Contact */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
        <p className="text-xs text-gray-500 mb-2">{t('client.invoices.paymentQuestion')}</p>
        <a href="tel:+255123456789" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 active:scale-95 transition">
          <Phone className="w-4 h-4" /> {t('customerView.callUs')}
        </a>
      </div>
    </div>
  )
}
