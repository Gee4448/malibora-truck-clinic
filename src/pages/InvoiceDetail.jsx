import { useState, useEffect, Fragment } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase, formatTZS, formatDate } from '../lib/supabase'
import { COMPANY, documentAddressLines } from '../lib/company'
import { ArrowLeft, Printer, Download, MessageCircle, CheckCircle, CreditCard, Send, MessageSquare, Save, Pencil, Trash2, Plus, FileText, Undo2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { generateInvoicePDF } from '../lib/pdf'
import { syncProformaTotals, statusAfterRetotal, depositAfterRetotal, overpaymentOn, invoiceAfterRefund, refundLimitFor } from '../lib/proforma'
import { sendSMS, smsTemplates } from '../lib/sms'
import Reveal from '../components/common/Reveal'

export default function InvoiceDetail() {
  const { id } = useParams()
  const { t } = useLanguage()
  const { canViewInternal, user } = useAuth()
  const navigate = useNavigate()
  const [invoice, setInvoice] = useState(null)
  const [items, setItems] = useState([])
  // Which table the line items live in: 'invoice_items' (frozen snapshot on a
  // final invoice) or 'job_card_items' (shared with the job card; proformas + legacy).
  const [itemsSource, setItemsSource] = useState('job_card_items')
  const [loading, setLoading] = useState(true)
  const [paymentForm, setPaymentForm] = useState({ method: 'cash', reference: '', amount: '' })
  const [showPayment, setShowPayment] = useState(false)
  const [editingVat, setEditingVat] = useState(false)
  const [vatInput, setVatInput] = useState('')
  const [savingVat, setSavingVat] = useState(false)
  const [editItems, setEditItems] = useState(false)
  const [draftItems, setDraftItems] = useState([])
  const [deletedIds, setDeletedIds] = useState([])
  const [savingItems, setSavingItems] = useState(false)
  const [linkedFinal, setLinkedFinal] = useState(null) // final invoice generated from this proforma
  const [generatingFinal, setGeneratingFinal] = useState(false)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [depositPct, setDepositPct] = useState(70)
  const [declaredPayments, setDeclaredPayments] = useState([]) // client-declared, awaiting confirm
  const [refunds, setRefunds] = useState([])                   // money handed back (migration 027)
  const [showRefund, setShowRefund] = useState(false)
  const [savingRefund, setSavingRefund] = useState(false)
  const [refundForm, setRefundForm] = useState({ amount: '', method: 'cash', reference: '', reason: '' })

  useEffect(() => { fetchInvoice() }, [id])

  const fetchInvoice = async () => {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          customers(full_name, phone, email, company_name, tin_number, vrn_number,
                    address, region, district, street, po_box),
          job_cards(
            job_number, description, section,
            vehicles(registration_number, make, model, year)
          )
        `)
        .eq('id', id)
        .single()
      if (error) throw error
      setInvoice(data)

      // Line items: a final invoice generated from a proforma has a frozen
      // snapshot in invoice_items; otherwise fall back to the job's shared items.
      const { data: snapItems } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', data.id)
        .order('sort_order', { ascending: true })
      if (snapItems && snapItems.length > 0) {
        setItems(snapItems)
        setItemsSource('invoice_items')
      } else {
        const { data: jobItems } = await supabase
          .from('job_card_items')
          .select('*')
          .eq('job_card_id', data.job_card_id)
          .order('item_type, created_at')
        setItems(jobItems || [])
        setItemsSource('job_card_items')
      }
      setDepositPct(data.deposit_percentage || 70)

      // If this is a proforma, see whether a final invoice was already generated from it.
      if (data.invoice_type === 'proforma') {
        const { data: fin } = await supabase
          .from('invoices')
          .select('id, invoice_number')
          .eq('source_proforma_id', data.id)
          .limit(1)
          .maybeSingle()
        setLinkedFinal(fin || null)
      } else {
        setLinkedFinal(null)
      }

      // Fetch negotiation messages
      const { data: msgs } = await supabase
        .from('invoice_negotiations')
        .select('*')
        .eq('invoice_id', data.id)
        .order('created_at', { ascending: true })
      setMessages(msgs || [])

      // Payments the customer declared from the portal, awaiting staff confirmation.
      const { data: pays } = await supabase
        .from('invoice_payments')
        .select('*')
        .eq('invoice_id', data.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
      setDeclaredPayments(pays || [])

      // Money handed back (migration 027). Selected separately from the invoice
      // so a missing table degrades to "no refunds" rather than 400-ing the
      // whole page the way an unknown embedded relation would.
      const { data: refs } = await supabase
        .from('invoice_refunds')
        .select('*')
        .eq('invoice_id', data.id)
        .order('created_at', { ascending: false })
      setRefunds(refs || [])
    } catch (err) {
      toast.error(t('invoices.loadError'))
      navigate('/admin/invoices')
    } finally {
      setLoading(false)
    }
  }

  const updateStatus = async (status) => {
    try {
      await supabase.from('invoices').update({ status }).eq('id', id)
      toast.success(t('invoices.updated'))
      fetchInvoice()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // #2 fix: ping the customer by SMS when an already-sent, client-facing invoice's
  // figures change, so a different total doesn't surprise them at payment. Silent for
  // drafts (not sent yet), internal invoices, and cancelled ones. Fire-and-forget.
  const notifyClientInvoiceChanged = (newTotal) => {
    if (!invoice) return
    if (invoice.invoice_type === 'internal') return
    if (invoice.status === 'draft' || invoice.status === 'cancelled') return
    sendSMS({
      to: invoice.customers?.phone,
      message: smsTemplates.invoice_updated(invoice.customers?.full_name, invoice.invoice_number, formatTZS(newTotal)),
      event: 'invoice_updated',
      customerId: invoice.customer_id,
    })
  }

  const saveVatRate = async () => {
    const newRate = Number(vatInput)
    if (isNaN(newRate) || newRate < 0 || newRate > 100) {
      toast.error(t('invoices.invalidVat'))
      return
    }
    setSavingVat(true)
    try {
      // Back the pre-VAT subtotal out of stored values so we don't depend on how
      // it was originally composed (discounts etc.): subtotal = total - old VAT.
      const subtotal = (Number(invoice.total_amount) || 0) - (Number(invoice.vat_amount) || 0)
      const vatAmount = subtotal * newRate / 100
      const totalAmount = subtotal + vatAmount
      const costParts = Number(invoice.internal_cost_parts) || 0
      const costLabour = Number(invoice.internal_cost_labour) || 0
      // Profit is measured against the pre-VAT subtotal: VAT is collected for
      // the TRA and passed on, so counting it as profit overstates every job.
      const profitTotal = subtotal - costParts - costLabour
      const { error } = await supabase.from('invoices').update({
        vat_rate: newRate,
        vat_amount: vatAmount,
        total_amount: totalAmount,
        profit_total: profitTotal,
        profit_margin: subtotal > 0 ? (profitTotal / subtotal * 100) : 0,
        // The total just moved, so what's still owed moved with it.
        ...statusAfterRetotal(invoice.status, invoice.amount_paid, totalAmount, invoice.paid_at),
        ...depositAfterRetotal(invoice.deposit_percentage, totalAmount),
      }).eq('id', id)
      if (error) throw error
      notifyClientInvoiceChanged(totalAmount)
      toast.success(t('invoices.updated'))
      setEditingVat(false)
      fetchInvoice()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingVat(false)
    }
  }

  // Billing milestones drive the job card's status so staff don't have to keep
  // the two in sync by hand (client request 27 Jul 2026). Never touches a job
  // that is already finished or cancelled, and never fails the caller — the
  // money operation matters more than the status bookkeeping.
  const syncJobStatus = async (status) => {
    if (!invoice?.job_card_id) return
    try {
      const update = { status }
      if (status === 'completed') update.date_completed = new Date().toISOString()
      await supabase.from('job_cards')
        .update(update)
        .eq('id', invoice.job_card_id)
        .not('status', 'in', '("completed","cancelled")')
    } catch (err) {
      console.error('Job status sync failed:', err)
    }
  }

  // A1: create a final invoice from this approved proforma, snapshotting the
  // current line items so later proforma edits don't change the issued invoice.
  const generateFinalFromProforma = async () => {
    setGeneratingFinal(true)
    try {
      // Carry any money already taken against the proforma (typically the 70%
      // deposit) onto the final invoice. Without this the final starts at zero
      // paid and bills the customer the full amount a second time.
      const carriedPaid = Number(invoice.amount_paid) || 0
      const invoiceTotalAmount = Number(invoice.total_amount) || 0
      const carriedFullyPaid = carriedPaid >= invoiceTotalAmount - 0.005 // rounding tolerance
      const carriedStatus = carriedFullyPaid ? 'paid' : (carriedPaid > 0 ? 'partial' : 'draft')

      const { data: newInv, error } = await supabase.from('invoices').insert({
        job_card_id: invoice.job_card_id,
        customer_id: invoice.customer_id,
        invoice_type: 'final',
        status: carriedStatus,
        amount_paid: carriedPaid,
        paid_at: carriedFullyPaid ? new Date().toISOString() : null,
        payment_method: invoice.payment_method,
        payment_reference: invoice.payment_reference,
        source_proforma_id: invoice.id,
        subtotal_parts: invoice.subtotal_parts,
        subtotal_labour: invoice.subtotal_labour,
        subtotal_additional: invoice.subtotal_additional,
        discount_amount: invoice.discount_amount,
        vat_rate: invoice.vat_rate,
        vat_amount: invoice.vat_amount,
        total_amount: invoice.total_amount,
        internal_cost_parts: invoice.internal_cost_parts,
        internal_cost_labour: invoice.internal_cost_labour,
        profit_parts: invoice.profit_parts,
        profit_labour: invoice.profit_labour,
        profit_total: invoice.profit_total,
        profit_margin: invoice.profit_margin,
      }).select().single()
      if (error) throw error

      // Freeze the current line items onto the new final invoice.
      if (items.length > 0) {
        const rows = items.map((it, i) => ({
          invoice_id: newInv.id,
          item_type: it.item_type,
          description: it.description,
          quantity: Number(it.quantity) || 0,
          cost_price: Number(it.cost_price) || 0,
          selling_price: Number(it.selling_price) || 0,
          sort_order: i,
        }))
        const { error: itErr } = await supabase.from('invoice_items').insert(rows)
        if (itErr) throw itErr
      }
      // Issuing the final invoice puts the job back into processing — unless the
      // proforma deposit already covered the whole bill, in which case it closes.
      await syncJobStatus(carriedFullyPaid ? 'completed' : 'in_progress')
      toast.success(t('invoices.finalGenerated'))
      navigate(`/admin/invoices/${newInv.id}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setGeneratingFinal(false)
    }
  }

  const startEditItems = () => {
    setDraftItems(items.map(it => ({ ...it })))
    setDeletedIds([])
    setEditItems(true)
  }

  const cancelEditItems = () => {
    setEditItems(false)
    setDraftItems([])
    setDeletedIds([])
  }

  const updateDraft = (idx, field, value) => {
    setDraftItems(d => d.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }

  const addDraftLine = (item_type) => {
    setDraftItems(d => [...d, {
      id: null,
      _tmp: (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())),
      item_type,
      description: '',
      quantity: 1,
      selling_price: 0,
      cost_price: 0,
    }])
  }

  const removeDraftLine = (idx) => {
    const it = draftItems[idx]
    if (it?.id) setDeletedIds(x => [...x, it.id])
    setDraftItems(d => d.filter((_, i) => i !== idx))
  }

  const saveItems = async () => {
    for (const it of draftItems) {
      if (!String(it.description || '').trim()) { toast.error(t('invoices.itemNeedsDesc')); return }
      if (Number(it.quantity) <= 0) { toast.error(t('invoices.itemNeedsQty')); return }
    }
    setSavingItems(true)
    try {
      if (deletedIds.length) {
        const { error } = await supabase.from(itemsSource).delete().in('id', deletedIds)
        if (error) throw error
      }
      for (const it of draftItems) {
        const payload = {
          item_type: it.item_type,
          description: String(it.description).trim(),
          quantity: Number(it.quantity) || 0,
          selling_price: Number(it.selling_price) || 0,
          cost_price: Number(it.cost_price) || 0,
        }
        // FK differs by source table
        if (itemsSource === 'invoice_items') payload.invoice_id = invoice.id
        else payload.job_card_id = invoice.job_card_id
        if (it.id) {
          const { error } = await supabase.from(itemsSource).update(payload).eq('id', it.id)
          if (error) throw error
        } else {
          const { error } = await supabase.from(itemsSource).insert(payload)
          if (error) throw error
        }
      }
      // Recompute invoice totals locally (total_* are DB-generated, so derive from qty*price).
      const sumSell = (type) => draftItems.filter(x => x.item_type === type)
        .reduce((s, x) => s + Number(x.quantity || 0) * Number(x.selling_price || 0), 0)
      const sumCost = (type) => draftItems.filter(x => x.item_type === type)
        .reduce((s, x) => s + Number(x.quantity || 0) * Number(x.cost_price || 0), 0)
      const subtotalParts = sumSell('part')
      const subtotalLabour = sumSell('labour')
      const subtotalAdditional = sumSell('additional')
      const subtotal = subtotalParts + subtotalLabour + subtotalAdditional
      const vatAmount = subtotal * vatRate / 100
      const totalAmount = subtotal + vatAmount
      const costParts = sumCost('part')
      const costLabour = sumCost('labour')
      // Pre-VAT subtotal is the profit base — see saveVat above.
      const profitTotal = subtotal - costParts - costLabour
      const { error: invErr } = await supabase.from('invoices').update({
        subtotal_parts: subtotalParts,
        subtotal_labour: subtotalLabour,
        subtotal_additional: subtotalAdditional,
        vat_amount: vatAmount,
        total_amount: totalAmount,
        internal_cost_parts: costParts,
        internal_cost_labour: costLabour,
        profit_parts: subtotalParts - costParts,
        profit_labour: subtotalLabour - costLabour,
        profit_total: profitTotal,
        profit_margin: subtotal > 0 ? (profitTotal / subtotal * 100) : 0,
        // The total just moved, so what's still owed moved with it.
        ...statusAfterRetotal(invoice.status, invoice.amount_paid, totalAmount, invoice.paid_at),
        ...depositAfterRetotal(invoice.deposit_percentage, totalAmount),
      }).eq('id', id)
      if (invErr) throw invErr
      // A final invoice with no frozen snapshot edits the JOB CARD's items, so
      // this job's proforma would silently fall out of step with them.
      if (itemsSource === 'job_card_items') await syncProformaTotals(invoice.job_card_id)
      notifyClientInvoiceChanged(totalAmount)
      toast.success(t('invoices.updated'))
      setEditItems(false)
      setDraftItems([])
      setDeletedIds([])
      fetchInvoice()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingItems(false)
    }
  }

  const openPayment = () => {
    setPaymentForm({ method: 'cash', reference: '', amount: balanceOwed > 0 ? String(balanceOwed) : '' })
    setShowPayment(true)
  }

  const recordPayment = async () => {
    const thisPayment = Number(paymentForm.amount)
    if (!thisPayment || thisPayment <= 0) {
      toast.error(t('invoices.enterAmount'))
      return
    }
    const newPaid = amountPaid + thisPayment
    const fullyPaid = newPaid >= invoiceTotal - 0.005 // rounding tolerance
    try {
      const update = {
        amount_paid: newPaid,
        payment_method: paymentForm.method,
        payment_reference: paymentForm.reference || null,
        status: fullyPaid ? 'paid' : 'partial',
      }
      if (fullyPaid) update.paid_at = new Date().toISOString()
      const { error } = await supabase.from('invoices').update(update).eq('id', id)
      if (error) throw error
      // Settling a final invoice in full closes the job.
      if (fullyPaid && invoice.invoice_type === 'final') await syncJobStatus('completed')
      toast.success(fullyPaid ? t('invoices.updated') : t('invoices.paymentRecorded'))
      setShowPayment(false)
      fetchInvoice()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const openRefund = () => {
    // Prefilled with the over-collection when there is one, because that is the
    // case this exists for — staff re-priced a paid job downwards and are now
    // holding money that isn't theirs.
    setRefundForm({ amount: overpaid > 0 ? String(overpaid) : '', method: 'cash', reference: '', reason: '' })
    setShowRefund(true)
  }

  // Hand money back: write the ledger row, then decrement what the invoice
  // records as held and re-derive its status from the new figure.
  const recordRefund = async () => {
    const amount = Number(refundForm.amount)
    if (!amount || amount <= 0) { toast.error(t('invoices.enterAmount')); return }
    if (amount > refundLimitFor(invoice) + 0.005) {
      toast.error(t('invoices.refundExceedsPaid').replace('{paid}', formatTZS(amountPaid)))
      return
    }
    setSavingRefund(true)
    try {
      const { error: ledgerErr } = await supabase.from('invoice_refunds').insert({
        invoice_id: invoice.id,
        customer_id: invoice.customer_id,
        amount,
        method: refundForm.method,
        reference: refundForm.reference || null,
        reason: refundForm.reason || null,
        refunded_by: user?.id || null,
      })
      if (ledgerErr) throw ledgerErr

      const { error: invErr } = await supabase.from('invoices')
        .update(invoiceAfterRefund(invoice, amount)).eq('id', id)
      if (invErr) throw invErr

      toast.success(t('invoices.refundRecorded'))
      setShowRefund(false)
      fetchInvoice()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingRefund(false)
    }
  }

  // Confirm a customer-declared payment: mark the ledger row confirmed AND apply
  // the amount to the invoice (the only place money moves — same math as recordPayment).
  const confirmDeclaredPayment = async (payment) => {
    try {
      const newPaid = amountPaid + Number(payment.amount)
      const fullyPaid = newPaid >= invoiceTotal - 0.005
      const invUpdate = {
        amount_paid: newPaid,
        payment_method: payment.method || invoice.payment_method,
        payment_reference: payment.reference || invoice.payment_reference,
        status: fullyPaid ? 'paid' : 'partial',
      }
      if (fullyPaid) invUpdate.paid_at = new Date().toISOString()
      const { error: e1 } = await supabase.from('invoices').update(invUpdate).eq('id', id)
      if (e1) throw e1
      const { error: e2 } = await supabase.from('invoice_payments')
        .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
        .eq('id', payment.id)
      if (e2) throw e2
      // Settling a final invoice in full closes the job.
      if (fullyPaid && invoice.invoice_type === 'final') await syncJobStatus('completed')
      toast.success(t('invoices.paymentConfirmed'))
      fetchInvoice()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const rejectDeclaredPayment = async (payment) => {
    try {
      const { error } = await supabase.from('invoice_payments')
        .update({ status: 'rejected' }).eq('id', payment.id)
      if (error) throw error
      toast.success(t('invoices.paymentRejected'))
      fetchInvoice()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const handleDownloadPDF = async () => {
    if (!invoice) return
    await generateInvoicePDF(invoice, items, canViewInternal)
    toast.success(t('invoices.pdfDownloaded'))
  }

  const handleWhatsApp = () => {
    if (!invoice?.customers?.phone) {
      toast.error(t('invoices.noPhone'))
      return
    }
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

  const invoiceTotal = Number(invoice.total_amount) || 0
  const amountPaid = Number(invoice.amount_paid) || 0
  const balanceOwed = Math.max(0, invoiceTotal - amountPaid)
  const overpaid = overpaymentOn(amountPaid, invoiceTotal)
  const vatRate = invoice.vat_rate != null ? Number(invoice.vat_rate) : 18
  // #3 (Antony): "add cost to the same invoice only while not yet approved/paid."
  // This gates the VAT-rate editor (a proforma's LINES are edited on the job
  // card, not here), and the rule still stands for it: the tax rate on a quote
  // the customer agreed to isn't something to change behind him.
  //
  // His 4 Aug 2026 request — re-price a proforma the customer has already paid —
  // is about the WORK, and runs through the job card and syncProformaTotals,
  // which no longer refuse once money has moved.
  const isProforma = invoice.invoice_type === 'proforma'
  const docEditable = isProforma
    ? !['approved', 'partial', 'paid', 'cancelled'].includes(invoice.status)
    : !['partial', 'paid', 'cancelled'].includes(invoice.status)

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
    partial: 'bg-orange-100 text-orange-700',
    paid: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-red-100 text-red-700',
  }

  const partItems = items.filter(i => i.item_type === 'part')
  const labourItems = items.filter(i => i.item_type === 'labour')
  const additionalItems = items.filter(i => i.item_type === 'additional')

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Actions Bar - no-print */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 no-print">
        <button onClick={() => navigate('/admin/invoices')} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 self-start">
          <ArrowLeft className="w-4 h-4" /> {t('common.back')}
        </button>
        <div className="flex flex-wrap gap-2 sm:justify-end">
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
              <button onClick={openPayment} className="tap flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium">
                <CreditCard className="w-4 h-4" /> {invoice.status === 'partial' ? t('invoices.recordPayment') : t('invoices.markPaid')}
              </button>
            </>
          )}
          {/* Refund (migration 027). Offered whenever the garage is holding the
              customer's money, not only when over-collected — a cancelled job
              needs the deposit back too. */}
          {amountPaid > 0 && (
            <button onClick={openRefund}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium ${
                overpaid > 0 ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}>
              <Undo2 className="w-4 h-4" /> {t('invoices.recordRefund')}
            </button>
          )}
          {/* A1: proforma -> final invoice */}
          {invoice.invoice_type === 'proforma' && invoice.status !== 'cancelled' && (
            linkedFinal ? (
              <Link to={`/admin/invoices/${linkedFinal.id}`}
                className="tap flex items-center gap-1.5 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm font-medium">
                <FileText className="w-4 h-4" /> {t('invoices.viewFinal')}: {linkedFinal.invoice_number}
              </Link>
            ) : (
              <button onClick={generateFinalFromProforma} disabled={generatingFinal}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 text-sm font-medium disabled:opacity-40">
                <FileText className="w-4 h-4" /> {t('invoices.generateFinal')}
              </button>
            )
          )}
        </div>
      </div>

      {/* Customer-declared payments awaiting confirmation (no-print) */}
      {declaredPayments.length > 0 && (
        <Reveal className="bg-amber-50 border border-amber-200 rounded-xl p-4 no-print">
          <h3 className="text-sm font-semibold text-amber-900 mb-3 flex items-center gap-1.5">
            <CreditCard className="w-4 h-4" /> {t('invoices.declaredPayments')}
          </h3>
          <div className="space-y-2">
            {declaredPayments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 bg-white rounded-lg border border-amber-100 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900">{formatTZS(p.amount)}</p>
                  <p className="text-xs text-gray-500">
                    {p.method ? t(`paymentMethods.${p.method}`) : '—'}
                    {p.reference ? ` · ${p.reference}` : ''} · {formatDate(p.created_at)}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => confirmDeclaredPayment(p)}
                    className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700">
                    {t('invoices.confirm')}
                  </button>
                  <button onClick={() => rejectDeclaredPayment(p)}
                    className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200">
                    {t('invoices.reject')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      )}

      {/* Invoice Document */}
      <Reveal className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-8 print:border-0 print:shadow-none print:p-0">
        {/* Header */}
        <div className="flex justify-between items-start border-b-2 border-blue-700 pb-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-blue-800">{COMPANY.name.toUpperCase()}</h1>
            <p className="text-sm text-gray-500 mt-1">{COMPANY.tagline}</p>
            {/* Where to send the paperwork and where to bring the truck. Both,
                because they are on opposite sides of Dar. */}
            {documentAddressLines.map(line => (
              <p key={line} className="text-xs text-gray-400 mt-1">{line}</p>
            ))}
          </div>
          <div className="text-right">
            <h2 className="text-xl font-bold text-gray-900 uppercase">{typeLabels[invoice.invoice_type]}</h2>
            <p className="text-lg font-mono text-blue-700 mt-1">{invoice.invoice_number}</p>
            <p className="text-sm text-gray-500 mt-1">{formatDate(invoice.created_at)}</p>
            <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium mt-2 ${statusColors[invoice.status]}`}>
              {t(`invoices.statuses.${invoice.status}`)}
            </span>
            {invoice.source_proforma_id && (
              <p className="text-xs text-gray-400 mt-2 no-print">
                <Link to={`/admin/invoices/${invoice.source_proforma_id}`} className="hover:text-blue-600">
                  {t('invoices.fromProforma')}
                </Link>
              </p>
            )}
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

        {/* A proforma's lines are the JOB CARD's lines — the table above reads
            job_card_items directly. Editing them from here worked but split the
            job in two places, so the customer's quote could disagree with the
            work order. Antony, 28 Jul 2026: "the details of proforma cannot be
            editable. We can edit those things only in job cards." */}
        {isProforma && (
          <div className="no-print flex justify-end mb-2">
            <Link
              to={`/admin/job-cards/${invoice.job_card_id}`}
              className="tap flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium"
            >
              <Pencil className="w-3.5 h-3.5" /> {t('invoices.editOnJobCard')}
            </Link>
          </div>
        )}

        {/* Items edit toolbar (no-print) */}
        {docEditable && !isProforma && (
          <div className="no-print flex justify-end mb-2">
            {!editItems ? (
              <button onClick={startEditItems}
                className="tap flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium">
                <Pencil className="w-3.5 h-3.5" /> {t('invoices.editItems')}
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={saveItems} disabled={savingItems}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-40">
                  <Save className="w-3.5 h-3.5" /> {t('common.save')}
                </button>
                <button onClick={cancelEditItems}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium">
                  {t('common.cancel')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Items Table */}
        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="bg-blue-50 border-b-2 border-blue-200">
              <th className="text-left p-2.5 font-semibold text-blue-900">#</th>
              <th className="text-left p-2.5 font-semibold text-blue-900">{t('invoices.description')}</th>
              <th className="text-right p-2.5 font-semibold text-blue-900">{t('invoices.qty')}</th>
              <th className="text-right p-2.5 font-semibold text-blue-900">{t('invoices.unitPrice')}</th>
              <th className="text-right p-2.5 font-semibold text-blue-900">{t('invoices.amount')}</th>
              {editItems && <th className="w-8"></th>}
            </tr>
          </thead>
          <tbody>
            {editItems ? (
              [
                { type: 'part', label: t('invoices.partsMaterials') },
                { type: 'labour', label: t('invoices.labourServices') },
                { type: 'additional', label: t('invoices.additionalCosts') },
              ].map(section => (
                <Fragment key={section.type}>
                  <tr>
                    <td colSpan="6" className="p-2 bg-gray-50 border-b">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-700">{section.label}</span>
                        <button onClick={() => addDraftLine(section.type)}
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium">
                          <Plus className="w-3.5 h-3.5" /> {t('invoices.addLine')}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {draftItems.map((it, idx) => ({ it, idx })).filter(r => r.it.item_type === section.type).map(({ it, idx }, i) => (
                    <tr key={it.id || it._tmp} className="border-b border-gray-100">
                      <td className="p-1.5 text-gray-500">{i + 1}</td>
                      <td className="p-1.5">
                        <input type="text" value={it.description}
                          onChange={e => updateDraft(idx, 'description', e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                      </td>
                      <td className="p-1.5">
                        <input type="number" min="0" step="any" value={it.quantity}
                          onChange={e => updateDraft(idx, 'quantity', e.target.value)}
                          className="w-16 px-2 py-1 border border-gray-300 rounded text-right text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                      </td>
                      <td className="p-1.5">
                        <input type="number" min="0" step="any" value={it.selling_price}
                          onChange={e => updateDraft(idx, 'selling_price', e.target.value)}
                          className="w-28 px-2 py-1 border border-gray-300 rounded text-right text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                      </td>
                      <td className="p-1.5 text-right font-medium whitespace-nowrap">
                        {formatTZS(Number(it.quantity || 0) * Number(it.selling_price || 0))}
                      </td>
                      <td className="p-1.5 text-center">
                        <button onClick={() => removeDraftLine(idx)} className="text-red-500 hover:text-red-700" title={t('common.delete')}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))
            ) : (
              <>
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
              </>
            )}
          </tbody>
        </table>

        {/* The closing block of the document — totals, payment status, and
            the footer — kept on one sheet. `.print-keep` already held the
            subtotals to their grand total, but that stopped one line short:
            at 49 and 50 rows the totals filled the bottom of page 3 and the
            footer went over alone, so the invoice ended on a sheet carrying
            nothing but "Thank you for choosing Malibora Truck Clinic".

            It has to be one wrapper rather than a rule on the footer itself:
            Chrome implements `break-inside: avoid` but not `break-before:
            avoid`, so the only way to say "these travel together" is to make
            them one unbreakable box. Taller than a page and Chrome breaks it
            anyway, which is the right way to fail. Verified 36-60 rows with
            `node scripts/print-sweep.mjs`. */}
        <div className="print-tail">
          {/* Totals */}
          {/* print-keep: the subtotals and the grand TOTAL must stay on one sheet.
              Without it a 50-line invoice broke between VAT and TOTAL. */}
          <div className="flex justify-end">
            <div className="w-72 print-keep">
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
              <div className="flex justify-between items-center py-2 border-b border-gray-200">
                <span className="text-gray-600 flex items-center gap-1.5">
                  {t('invoices.vat')} ({vatRate}%)
                  {docEditable && !editingVat && (
                    <button onClick={() => { setVatInput(String(vatRate)); setEditingVat(true) }}
                      className="no-print text-blue-600 hover:text-blue-800" title={t('invoices.editVat')}>
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </span>
                {editingVat ? (
                  <span className="no-print flex items-center gap-1.5">
                    <input type="number" min="0" max="100" step="any" value={vatInput}
                      onChange={e => setVatInput(e.target.value)}
                      className="w-16 px-2 py-1 border border-gray-300 rounded text-right text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                    <span className="text-gray-400 text-sm">%</span>
                    <button onClick={saveVatRate} disabled={savingVat}
                      className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-40">{t('common.save')}</button>
                    <button onClick={() => setEditingVat(false)}
                      className="px-2 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">{t('common.cancel')}</button>
                  </span>
                ) : (
                  <span className="font-medium">{formatTZS(invoice.vat_amount)}</span>
                )}
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
          {/* More was collected than the job now costs — only reachable since
              paid proformas became re-priceable (Antony, 4 Aug 2026). There is no
              refund ledger, so the document says it plainly rather than showing
              "paid, balance 0" and letting the customer's money vanish. */}
          {overpaid > 0 && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
              <p className="font-semibold text-red-800">{t('invoices.overpaid')}</p>
              <div className="flex justify-between mt-1 text-red-700">
                <span>{t('invoices.amountPaid')}</span><span className="font-medium">{formatTZS(amountPaid)}</span>
              </div>
              <div className="flex justify-between text-red-700">
                <span>{t('invoices.total')}</span><span className="font-medium">{formatTZS(invoiceTotal)}</span>
              </div>
              <div className="flex justify-between text-red-900 font-semibold">
                <span>{t('invoices.refundDue')}</span><span>{formatTZS(overpaid)}</span>
              </div>
            </div>
          )}
          {invoice.status === 'paid' && overpaid === 0 && (
            <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm">
              <p className="font-semibold text-emerald-800">{t('invoices.paidOn')} {formatDate(invoice.paid_at)}</p>
              {invoice.payment_method && <p className="text-emerald-700 capitalize">{t('invoices.method')}: {invoice.payment_method.replace('_', ' ')}</p>}
              {invoice.payment_reference && <p className="text-emerald-700">{t('invoices.ref')}: {invoice.payment_reference}</p>}
            </div>
          )}
          {invoice.status === 'partial' && (
            <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm">
              <p className="font-semibold text-orange-800">{t('invoices.partiallyPaid')}</p>
              <div className="flex justify-between mt-1 text-orange-700">
                <span>{t('invoices.amountPaid')}</span><span className="font-medium">{formatTZS(amountPaid)}</span>
              </div>
              <div className="flex justify-between text-orange-900 font-semibold">
                <span>{t('invoices.balanceOwed')}</span><span>{formatTZS(balanceOwed)}</span>
              </div>
              {invoice.payment_method && <p className="text-orange-700 capitalize mt-1">{t('invoices.method')}: {invoice.payment_method.replace('_', ' ')}</p>}
              {invoice.payment_reference && <p className="text-orange-700">{t('invoices.ref')}: {invoice.payment_reference}</p>}
            </div>
          )}

          {/* Refunds actually handed back — part of the document, so it prints. */}
          {refunds.length > 0 && (
            <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm">
              <p className="font-semibold text-gray-800 mb-1.5">{t('invoices.refundsMade')}</p>
              <div className="space-y-1">
                {refunds.map(r => (
                  <div key={r.id} className="flex justify-between text-gray-600">
                    <span>
                      {formatDate(r.created_at)}
                      {r.method && <span className="capitalize"> · {r.method.replace('_', ' ')}</span>}
                      {r.reference && <span> · {r.reference}</span>}
                      {r.reason && <span className="text-gray-400"> — {r.reason}</span>}
                    </span>
                    <span className="font-medium text-gray-900 whitespace-nowrap ml-3">−{formatTZS(r.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between border-t border-gray-200 mt-1.5 pt-1.5 font-semibold text-gray-900">
                <span>{t('invoices.totalRefunded')}</span>
                <span>{formatTZS(refunds.reduce((s, r) => s + Number(r.amount || 0), 0))}</span>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="mt-8 pt-4 border-t border-gray-200 text-center text-xs text-gray-400">
            <p>Thank you for choosing Malibora Truck Clinic</p>
            <p className="mt-1">Asante kwa kuchagua Malibora Truck Clinic</p>
          </div>
        </div>
      </Reveal>

      {/* Deposit Controls (no-print) */}
      {invoice.invoice_type === 'proforma' && invoice.status !== 'paid' && (
        <Reveal className="bg-amber-50 border border-amber-200 rounded-xl p-4 no-print">
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
        </Reveal>
      )}

      {/* Negotiation Thread (no-print) */}
      {invoice.invoice_type === 'proforma' && (
        <Reveal className="bg-white rounded-2xl border border-gray-200 overflow-hidden no-print">
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
              className="tap px-3 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </Reveal>
      )}

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 glass-overlay z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 modal-card">
            <h2 className="text-lg font-bold mb-4">{t('invoices.markPaid')}</h2>
            <div className="space-y-4">
              {/* Amount summary */}
              <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between text-gray-600">
                  <span>{t('invoices.total')}</span>
                  <span className="font-medium text-gray-900">{formatTZS(invoiceTotal)}</span>
                </div>
                {amountPaid > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>{t('invoices.amountPaid')}</span>
                    <span className="font-medium text-emerald-700">{formatTZS(amountPaid)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-gray-200 pt-1 mt-1">
                  <span className="text-gray-700 font-medium">{t('invoices.balanceOwed')}</span>
                  <span className="font-bold text-gray-900">{formatTZS(balanceOwed)}</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('invoices.paymentAmount')}</label>
                <input type="number" min="0" step="any" value={paymentForm.amount}
                  onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="0" />
                {Number(paymentForm.amount) > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {(amountPaid + Number(paymentForm.amount)) >= invoiceTotal - 0.005
                      ? t('invoices.willBeFullyPaid')
                      : `${t('invoices.balanceAfter')}: ${formatTZS(Math.max(0, invoiceTotal - amountPaid - Number(paymentForm.amount)))}`}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('invoices.paymentMethod')}</label>
                <select value={paymentForm.method} onChange={e => setPaymentForm({...paymentForm, method: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="cash">{t('paymentMethods.cash')}</option>
                  <option value="bank_transfer">{t('paymentMethods.bank_transfer')}</option>
                  <option value="mobile_money">{t('paymentMethods.mobile_money')}</option>
                  {/* Must mirror the customer's options, or a declared Lipa
                      Namba payment cannot be confirmed with the method used. */}
                  <option value="lipa_namba">{t('paymentMethods.lipa_namba')}</option>
                  <option value="cheque">{t('paymentMethods.cheque')}</option>
                  <option value="credit">{t('paymentMethods.credit')}</option>
                  <option value="other">{t('paymentMethods.other')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('invoices.paymentRef')}</label>
                <input type="text" value={paymentForm.reference} onChange={e => setPaymentForm({...paymentForm, reference: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder={t('invoices.refPlaceholder')} />
              </div>
              <div className="flex gap-3">
                <button onClick={recordPayment} className="flex-1 py-2.5 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700">
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

      {/* Refund Modal */}
      {showRefund && (
        <div className="fixed inset-0 glass-overlay z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 modal-card">
            <h2 className="text-lg font-bold mb-4">{t('invoices.recordRefund')}</h2>
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between text-gray-600">
                  <span>{t('invoices.total')}</span>
                  <span className="font-medium text-gray-900">{formatTZS(invoiceTotal)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>{t('invoices.amountPaid')}</span>
                  <span className="font-medium text-emerald-700">{formatTZS(amountPaid)}</span>
                </div>
                {overpaid > 0 && (
                  <div className="flex justify-between border-t border-gray-200 pt-1 mt-1">
                    <span className="text-red-700 font-medium">{t('invoices.refundDue')}</span>
                    <span className="font-bold text-red-800">{formatTZS(overpaid)}</span>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('invoices.refundAmount')}</label>
                <input type="number" min="0" step="any" value={refundForm.amount}
                  onChange={e => setRefundForm({ ...refundForm, amount: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="0" />
                <p className="text-xs text-gray-500 mt-1">
                  {t('invoices.refundMax').replace('{max}', formatTZS(refundLimitFor(invoice)))}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('invoices.refundMethod')}</label>
                <select value={refundForm.method} onChange={e => setRefundForm({ ...refundForm, method: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="cash">{t('paymentMethods.cash')}</option>
                  <option value="bank_transfer">{t('paymentMethods.bank_transfer')}</option>
                  <option value="mobile_money">{t('paymentMethods.mobile_money')}</option>
                  <option value="lipa_namba">{t('paymentMethods.lipa_namba')}</option>
                  <option value="other">{t('paymentMethods.other')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('invoices.paymentRef')}</label>
                <input type="text" value={refundForm.reference} onChange={e => setRefundForm({ ...refundForm, reference: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder={t('invoices.refPlaceholder')} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('invoices.refundReason')}</label>
                <input type="text" value={refundForm.reason} onChange={e => setRefundForm({ ...refundForm, reason: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder={t('invoices.refundReasonPlaceholder')} />
              </div>
              <div className="flex gap-3">
                <button onClick={recordRefund} disabled={savingRefund}
                  className="flex-1 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:opacity-40">
                  {t('common.confirm')}
                </button>
                <button onClick={() => setShowRefund(false)} className="px-6 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50">
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
