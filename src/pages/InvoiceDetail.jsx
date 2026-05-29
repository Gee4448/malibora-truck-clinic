import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase, formatTZS, formatDate } from '../lib/supabase'
import { ArrowLeft, Printer, Download, MessageCircle, CheckCircle, CreditCard, Send, MessageSquare, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { generateInvoicePDF } from '../lib/pdf'

export default function InvoiceDetail() {
  const { id } = useParams()
  const { t } = useLanguage()
  const { canViewInternal } = useAuth()
  const navigate = useNavigate()
  const [invoice, setInvoice] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [paymentForm, setPaymentForm] = useState({ method: 'cash', reference: '' })
  const [showPayment, setShowPayment] = useState(false)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [depositPct, setDepositPct] = useState(70)

  useEffect(() => { fetchInvoice() }, [id])

  const fetchInvoice = async () => {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          customers(full_name, phone, email, company_name, tin_number, address),
          job_cards(
            job_number, description, section,
            vehicles(registration_number, make, model, year)
          )
        `)
        .eq('id', id)
        .single()
      if (error) throw error
      setInvoice(data)

      // Fetch job items
      const { data: jobItems } = await supabase
        .from('job_card_items')
        .select('*')
        .eq('job_card_id', data.job_card_id)
        .order('item_type, created_at')
      setItems(jobItems || [])
      setDepositPct(data.deposit_percentage || 70)

      // Fetch negotiation messages
      const { data: msgs } = await supabase
        .from('invoice_negotiations')
        .select('*')
        .eq('invoice_id', data.id)
        .order('created_at', { ascending: true })
      setMessages(msgs || [])
    } catch (err) {
      toast.error(t('invoices.loadError'))
      navigate('/admin/invoices')
    } finally {
      setLoading(false)
    }
  }

  const updateStatus = async (status) => {
    try {
      const update = { status }
      if (status === 'paid') {
        update.paid_at = new Date().toISOString()
        update.payment_method = paymentForm.method
        update.payment_reference = paymentForm.reference
      }
      await supabase.from('invoices').update(update).eq('id', id)
      toast.success(t('invoices.updated'))
      setShowPayment(false)
      fetchInvoice()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const handleDownloadPDF = () => {
    if (!invoice) return
    generateInvoicePDF(invoice, items, canViewInternal)
    toast.success(t('invoices.pdfDownloaded'))
  }

  const handleWhatsApp = () => {
    if (!invoice?.customers?.phone) return
    const phone = invoice.customers.phone.replace(/[^0-9]/g, '')
    const msg = encodeURIComponent(
      `Habari ${invoice.customers.full_name},\n\n` +
      `Invoice: ${invoice.invoice_number}\n` +
      `Vehicle: ${invoice.job_cards?.vehicles?.registration_number}\n` +
      `Total: ${formatTZS(invoice.total_amount)}\n\n` +
      `Asante - Malibora Truck Clinic`
    )
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')
  }

  if (loading) return <div className="flex justify-center p-8"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div></div>
  if (!invoice) return null

  const typeLabels = { proforma: t('invoices.proforma'), final: t('invoices.final'), internal: t('invoices.internal') }
  const handleSendStaffMessage = async () => {
    if (!newMessage.trim()) return
    setSendingMessage(true)
    try {
      const { error } = await supabase.from('invoice_negotiations').insert({
        invoice_id: invoice.id,
        sender_type: 'staff',
        message: newMessage.trim(),
      })
      if (error) throw error
      setNewMessage('')
      toast.success(t('invoices.messageSent'))
      fetchInvoice()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSendingMessage(false)
    }
  }

  const handleSaveDeposit = async () => {
    try {
      const depositAmt = Number(invoice.total_amount) * depositPct / 100
      const { error } = await supabase.from('invoices').update({
        deposit_percentage: depositPct,
        deposit_amount: depositAmt,
      }).eq('id', invoice.id)
      if (error) throw error
      toast.success(t('invoices.depositSaved'))
      fetchInvoice()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const statusColors = {
    draft: 'bg-gray-100 text-gray-600',
    sent: 'bg-blue-100 text-blue-700',
    approved: 'bg-green-100 text-green-700',
    negotiating: 'bg-amber-100 text-amber-700',
    paid: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-red-100 text-red-700',
  }

  const partItems = items.filter(i => i.item_type === 'part')
  const labourItems = items.filter(i => i.item_type === 'labour')
  const additionalItems = items.filter(i => i.item_type === 'additional')

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Actions Bar - no-print */}
      <div className="flex items-center justify-between no-print">
        <button onClick={() => navigate('/admin/invoices')} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" /> {t('common.back')}
        </button>
        <div className="flex gap-2">
          <button onClick={handleDownloadPDF} className="flex items-center gap-1.5 px-3 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 text-sm font-medium">
            <Download className="w-4 h-4" /> {t('common.pdf')}
          </button>
          <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium">
            <Printer className="w-4 h-4" /> {t('invoices.print')}
          </button>
          <button onClick={handleWhatsApp} className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
            <MessageCircle className="w-4 h-4" /> WhatsApp
          </button>
          {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
            <>
              <button onClick={() => updateStatus('approved')} className="flex items-center gap-1.5 px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-sm font-medium">
                <CheckCircle className="w-4 h-4" /> {t('invoices.approve')}
              </button>
              <button onClick={() => setShowPayment(true)} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium">
                <CreditCard className="w-4 h-4" /> {t('invoices.markPaid')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Invoice Document */}
      <div className="bg-white rounded-xl border border-gray-200 p-8 print:border-0 print:shadow-none print:p-0">
        {/* Header */}
        <div className="flex justify-between items-start border-b-2 border-blue-700 pb-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-blue-800">MALIBORA TRUCK CLINIC</h1>
            <p className="text-sm text-gray-500 mt-1">Professional Vehicle Service & Repair</p>
            <p className="text-xs text-gray-400 mt-1">Arusha, Tanzania</p>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-bold text-gray-900 uppercase">{typeLabels[invoice.invoice_type]}</h2>
            <p className="text-lg font-mono text-blue-700 mt-1">{invoice.invoice_number}</p>
            <p className="text-sm text-gray-500 mt-1">{formatDate(invoice.created_at)}</p>
            <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium mt-2 ${statusColors[invoice.status]}`}>
              {t(`invoices.statuses.${invoice.status}`)}
            </span>
          </div>
        </div>

        {/* Customer & Vehicle Info */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">{t('invoices.billTo')}</h3>
            <p className="font-semibold text-gray-900">{invoice.customers?.full_name}</p>
            {invoice.customers?.company_name && <p className="text-sm text-gray-600">{invoice.customers.company_name}</p>}
            <p className="text-sm text-gray-600">{invoice.customers?.phone}</p>
            {invoice.customers?.email && <p className="text-sm text-gray-600">{invoice.customers.email}</p>}
            {invoice.customers?.address && <p className="text-sm text-gray-600">{invoice.customers.address}</p>}
            {invoice.customers?.tin_number && <p className="text-sm text-gray-600">TIN: {invoice.customers.tin_number}</p>}
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">{t('jobs.vehicle')}</h3>
            <p className="font-semibold text-gray-900">{invoice.job_cards?.vehicles?.registration_number}</p>
            <p className="text-sm text-gray-600">{invoice.job_cards?.vehicles?.make} {invoice.job_cards?.vehicles?.model}</p>
            {invoice.job_cards?.vehicles?.year && <p className="text-sm text-gray-600">Year: {invoice.job_cards.vehicles.year}</p>}
            <p className="text-sm text-gray-600 mt-1">Job: <Link to={`/admin/job-cards/${invoice.job_card_id}`} className="text-blue-600">{invoice.job_cards?.job_number}</Link></p>
          </div>
        </div>

        {/* Items Table */}
        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="bg-blue-50 border-b-2 border-blue-200">
              <th className="text-left p-2.5 font-semibold text-blue-900">#</th>
              <th className="text-left p-2.5 font-semibold text-blue-900">{t('invoices.description')}</th>
              <th className="text-right p-2.5 font-semibold text-blue-900">{t('invoices.qty')}</th>
              <th className="text-right p-2.5 font-semibold text-blue-900">{t('invoices.unitPrice')}</th>
              <th className="text-right p-2.5 font-semibold text-blue-900">{t('invoices.amount')}</th>
            </tr>
          </thead>
          <tbody>
            {/* Parts Section */}
            {partItems.length > 0 && (
              <>
                <tr><td colSpan="5" className="p-2 font-semibold text-gray-700 bg-gray-50 border-b">{t('invoices.partsMaterials')}</td></tr>
                {partItems.map((item, i) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="p-2.5 text-gray-500">{i + 1}</td>
                    <td className="p-2.5">{item.description}</td>
                    <td className="p-2.5 text-right">{item.quantity}</td>
                    <td className="p-2.5 text-right">{formatTZS(item.selling_price)}</td>
                    <td className="p-2.5 text-right font-medium">{formatTZS(item.total_selling)}</td>
                  </tr>
                ))}
              </>
            )}
            {/* Labour Section */}
            {labourItems.length > 0 && (
              <>
                <tr><td colSpan="5" className="p-2 font-semibold text-gray-700 bg-gray-50 border-b">{t('invoices.labourServices')}</td></tr>
                {labourItems.map((item, i) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="p-2.5 text-gray-500">{i + 1}</td>
                    <td className="p-2.5">{item.description}</td>
                    <td className="p-2.5 text-right">{item.quantity} hrs</td>
                    <td className="p-2.5 text-right">{formatTZS(item.selling_price)}</td>
                    <td className="p-2.5 text-right font-medium">{formatTZS(item.total_selling)}</td>
                  </tr>
                ))}
              </>
            )}
            {/* Additional Section */}
            {additionalItems.length > 0 && (
              <>
                <tr><td colSpan="5" className="p-2 font-semibold text-gray-700 bg-gray-50 border-b">{t('invoices.additionalCosts')}</td></tr>
                {additionalItems.map((item, i) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="p-2.5 text-gray-500">{i + 1}</td>
                    <td className="p-2.5">{item.description}</td>
                    <td className="p-2.5 text-right">{item.quantity}</td>
                    <td className="p-2.5 text-right">{formatTZS(item.selling_price)}</td>
                    <td className="p-2.5 text-right font-medium">{formatTZS(item.total_selling)}</td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-72">
            <div className="flex justify-between py-2 border-b border-gray-200">
              <span className="text-gray-600">{t('invoices.subtotalParts')}</span>
              <span className="font-medium">{formatTZS(invoice.subtotal_parts)}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-200">
              <span className="text-gray-600">{t('invoices.subtotalLabour')}</span>
              <span className="font-medium">{formatTZS(invoice.subtotal_labour)}</span>
            </div>
            {Number(invoice.subtotal_additional) > 0 && (
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-600">{t('invoices.subtotalAdditional')}</span>
                <span className="font-medium">{formatTZS(invoice.subtotal_additional)}</span>
              </div>
            )}
            {Number(invoice.discount_amount) > 0 && (
              <div className="flex justify-between py-2 border-b border-gray-200 text-red-600">
                <span>{t('invoices.discount')}</span>
                <span>-{formatTZS(invoice.discount_amount)}</span>
              </div>
            )}
            <div className="flex justify-between py-2 border-b border-gray-200">
              <span className="text-gray-600">{t('invoices.vat')}</span>
              <span className="font-medium">{formatTZS(invoice.vat_amount)}</span>
            </div>
            <div className="flex justify-between py-3 border-b-2 border-blue-700 bg-blue-50 px-3 -mx-3 mt-1 rounded">
              <span className="text-lg font-bold text-blue-900">{t('invoices.total')}</span>
              <span className="text-lg font-bold text-blue-900">{formatTZS(invoice.total_amount)}</span>
            </div>
          </div>
        </div>

        {/* Internal Cost Breakdown (Management only) */}
        {canViewInternal && invoice.invoice_type !== 'proforma' && (
          <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg no-print">
            <h3 className="font-semibold text-yellow-800 mb-3">{t('invoices.internalBreakdown')}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-yellow-700">{t('invoices.partsCost')}</p>
                <p className="font-bold text-gray-900">{formatTZS(invoice.internal_cost_parts)}</p>
              </div>
              <div>
                <p className="text-yellow-700">{t('invoices.partsProfit')}</p>
                <p className="font-bold text-green-600">{formatTZS(invoice.profit_parts)}</p>
              </div>
              <div>
                <p className="text-yellow-700">{t('invoices.labourCost')}</p>
                <p className="font-bold text-gray-900">{formatTZS(invoice.internal_cost_labour)}</p>
              </div>
              <div>
                <p className="text-yellow-700">{t('invoices.labourProfit')}</p>
                <p className="font-bold text-green-600">{formatTZS(invoice.profit_labour)}</p>
              </div>
              <div className="col-span-2">
                <p className="text-yellow-700">{t('invoices.totalProfit')}</p>
                <p className="text-xl font-bold text-green-600">{formatTZS(invoice.profit_total)}</p>
              </div>
              <div className="col-span-2">
                <p className="text-yellow-700">{t('invoices.profitMargin')}</p>
                <p className="text-xl font-bold text-green-600">{Number(invoice.profit_margin).toFixed(1)}%</p>
              </div>
            </div>
          </div>
        )}

        {/* Payment info */}
        {invoice.status === 'paid' && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm">
            <p className="font-semibold text-emerald-800">{t('invoices.paidOn')} {formatDate(invoice.paid_at)}</p>
            {invoice.payment_method && <p className="text-emerald-700 capitalize">{t('invoices.method')}: {invoice.payment_method.replace('_', ' ')}</p>}
            {invoice.payment_reference && <p className="text-emerald-700">{t('invoices.ref')}: {invoice.payment_reference}</p>}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-gray-200 text-center text-xs text-gray-400">
          <p>Thank you for choosing Malibora Truck Clinic</p>
          <p className="mt-1">Asante kwa kuchagua Malibora Truck Clinic</p>
        </div>
      </div>

      {/* Deposit Controls (no-print) */}
      {invoice.invoice_type === 'proforma' && invoice.status !== 'paid' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 no-print">
          <h3 className="text-sm font-semibold text-amber-800 mb-3">{t('invoices.setDeposit')}</h3>
          <div className="flex items-center gap-3">
            <select value={depositPct} onChange={e => setDepositPct(Number(e.target.value))}
              className="px-3 py-2 border border-amber-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-amber-500 outline-none">
              <option value={50}>50%</option>
              <option value={70}>70%</option>
            </select>
            <span className="text-sm text-amber-800">
              = {formatTZS(Number(invoice.total_amount) * depositPct / 100)}
            </span>
            <button onClick={handleSaveDeposit}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium">
              <Save className="w-3.5 h-3.5" /> {t('common.save')}
            </button>
          </div>
          {invoice.customer_agreed_at && (
            <p className="text-xs text-green-700 mt-2 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> {t('invoices.customerAgreed')} — {formatDate(invoice.customer_agreed_at)}
            </p>
          )}
        </div>
      )}

      {/* Negotiation Thread (no-print) */}
      {invoice.invoice_type === 'proforma' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden no-print">
          <div className="p-4 border-b border-gray-100 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-700">{t('invoices.negotiation')}</h3>
            {messages.length > 0 && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{messages.length}</span>}
          </div>
          <div className="p-4 space-y-3 max-h-64 overflow-y-auto">
            {messages.length === 0 ? (
              <p className="text-center text-xs text-gray-400 py-4">{t('invoices.noMessages')}</p>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.sender_type === 'staff' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-xl px-3 py-2 ${
                    msg.sender_type === 'staff' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'
                  }`}>
                    <p className="text-[10px] font-medium mb-0.5 ${msg.sender_type === 'staff' ? 'text-blue-200' : 'text-gray-500'}">
                      {msg.sender_type === 'staff' ? 'Staff' : 'Customer'}
                    </p>
                    <p className="text-sm">{msg.message}</p>
                    <p className={`text-[10px] mt-1 ${msg.sender_type === 'staff' ? 'text-blue-200' : 'text-gray-400'}`}>
                      {formatDate(msg.created_at)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="p-3 border-t border-gray-100 flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              placeholder={t('invoices.negotiationPlaceholder')}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              onKeyDown={e => { if (e.key === 'Enter' && newMessage.trim()) handleSendStaffMessage() }}
            />
            <button
              onClick={handleSendStaffMessage}
              disabled={!newMessage.trim() || sendingMessage}
              className="px-3 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold mb-4">{t('invoices.markPaid')}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('invoices.paymentMethod')}</label>
                <select value={paymentForm.method} onChange={e => setPaymentForm({...paymentForm, method: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="cash">{t('paymentMethods.cash')}</option>
                  <option value="bank_transfer">{t('paymentMethods.bank_transfer')}</option>
                  <option value="mobile_money">{t('paymentMethods.mobile_money')}</option>
                  <option value="cheque">{t('paymentMethods.cheque')}</option>
                  <option value="credit">{t('paymentMethods.credit')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('invoices.paymentRef')}</label>
                <input type="text" value={paymentForm.reference} onChange={e => setPaymentForm({...paymentForm, reference: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Transaction reference..." />
              </div>
              <div className="flex gap-3">
                <button onClick={() => updateStatus('paid')} className="flex-1 py-2.5 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700">
                  {t('common.confirm')}
                </button>
                <button onClick={() => setShowPayment(false)} className="px-6 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50">
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
