import jsPDF from 'jspdf'
import { COMPANY, documentAddressLines } from './company'
import autoTable from 'jspdf-autotable'

const formatTZS = (amount) => {
  if (!amount && amount !== 0) return 'TZS 0'
  return `TZS ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0 })}`
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Load the real Malibora logo from /malibora-logo.png and crop to just the
// orange MARK (the asset is a "Malibora INTERTRADE" lockup on a padded white
// disc; the wordmark is drawn as text, see drawPdfHeader). Cached, and
// resolves to null if the file is missing so the header falls back to text
// only. Runs in the browser (canvas). Crop box measured on the 447x400 asset.
const LOGO_CROP = { x: 46, y: 136, w: 116, h: 108 }
let _logoPromise
function loadLogo() {
  if (_logoPromise) return _logoPromise
  _logoPromise = new Promise((resolve) => {
    try {
      const img = new Image()
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = LOGO_CROP.w
          canvas.height = LOGO_CROP.h
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, LOGO_CROP.x, LOGO_CROP.y, LOGO_CROP.w, LOGO_CROP.h, 0, 0, LOGO_CROP.w, LOGO_CROP.h)
          resolve({ dataUrl: canvas.toDataURL('image/png'), w: LOGO_CROP.w, h: LOGO_CROP.h })
        } catch { resolve(null) }
      }
      img.onerror = () => resolve(null)
      img.src = '/malibora-logo.png'
    } catch { resolve(null) }
  })
  return _logoPromise
}

// Shared PDF header. The brand mark, then "Malibora / TRUCK CLINIC" as text —
// the logo asset's own wordmark reads "INTERTRADE" (the parent company) and
// Antony wants the paper to say Truck Clinic (26 Sep 2026). Under it the
// tagline and every location, so a customer in Iringa or Mafinga sees his own
// branch on the document. Returns the y of the rule under the header, so the
// callers lay the rest out below it.
async function drawPdfHeader(doc, pageWidth) {
  const brand = [201, 92, 12]
  const gray = [107, 114, 128]
  const dark = [55, 65, 81]
  const top = 10
  let x = 14
  const mark = await loadLogo()
  if (mark) {
    const hMM = 15
    const wMM = hMM * mark.w / mark.h
    doc.addImage(mark.dataUrl, 'PNG', x, top, wMM, hMM)
    x += wMM + 4
  }
  doc.setTextColor(...dark)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text('Malibora', x, top + 8.5)
  doc.setTextColor(...brand)
  doc.setFontSize(8.5)
  doc.text('TRUCK CLINIC', x + 0.5, top + 14, { charSpace: 1.6 })

  doc.setTextColor(...gray)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(COMPANY.tagline, 14, top + 21)
  // Four locations, two per line, so the header stays a header.
  doc.setFontSize(7)
  const rows = [
    documentAddressLines.slice(0, 2).join('   ·   '),
    documentAddressLines.slice(2).join('   ·   '),
  ].filter(Boolean)
  rows.forEach((row, i) => doc.text(row, 14, top + 25.5 + i * 4))

  const ruleY = top + 26 + rows.length * 4
  doc.setDrawColor(...brand)
  doc.setLineWidth(1)
  doc.line(14, ruleY, pageWidth - 14, ruleY)
  return ruleY
}

export async function generateInvoicePDF(invoice, items, showInternal = false) {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()

  // Colors — Malibora brand orange
  const blue = [201, 92, 12]
  const darkGray = [55, 65, 81]
  const lightGray = [156, 163, 175]

  // Header (brand mark + wordmark + every address)
  const headerBottom = await drawPdfHeader(doc, pageWidth)
  const top = headerBottom + 12

  // Invoice type & number. A proforma with no job card is a QUOTATION —
  // the paper someone gets before there is any job (041; Antony, 26 Sep 2026).
  const typeLabel = invoice.invoice_type === 'proforma'
    ? (invoice.job_card_id ? 'PROFORMA INVOICE' : 'QUOTATION')
    : invoice.invoice_type === 'internal' ? 'INTERNAL INVOICE' : 'INVOICE'

  doc.setTextColor(...darkGray)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(typeLabel, pageWidth - 14, top, { align: 'right' })
  doc.setFontSize(11)
  doc.setTextColor(...blue)
  doc.text(invoice.invoice_number, pageWidth - 14, top + 8, { align: 'right' })
  doc.setTextColor(...lightGray)
  doc.setFontSize(9)
  doc.text(`Date: ${formatDate(invoice.created_at)}`, pageWidth - 14, top + 15, { align: 'right' })

  // Bill To
  let y = top
  doc.setTextColor(...darkGray)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('BILL TO:', 14, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  y += 7
  doc.text(invoice.customers?.full_name || '', 14, y)
  y += 5
  // A company registered under its own name as the contact ("RE TRUCK / RE
  // TRUCK") printed twice; once is enough.
  const company = invoice.customers?.company_name
  const sameAsName = company && company.trim().toLowerCase() === String(invoice.customers?.full_name || '').trim().toLowerCase()
  if (company && !sameAsName) { doc.setFontSize(9); doc.text(company, 14, y); y += 5 }
  doc.setFontSize(9)
  doc.text(invoice.customers?.phone || '', 14, y); y += 5
  if (invoice.customers?.email) { doc.text(invoice.customers.email, 14, y); y += 5 }
  // Structured address, falling back to the legacy single-line field.
  const custAddress = [
    invoice.customers?.street, invoice.customers?.district, invoice.customers?.region,
  ].filter(Boolean).join(', ') || invoice.customers?.address
  if (custAddress) { doc.text(custAddress, 14, y); y += 5 }
  if (invoice.customers?.po_box) { doc.text(`P.O. Box: ${invoice.customers.po_box}`, 14, y); y += 5 }
  if (invoice.customers?.tin_number) { doc.text(`TIN: ${invoice.customers.tin_number}`, 14, y); y += 5 }
  if (invoice.customers?.vrn_number) { doc.text(`VRN: ${invoice.customers.vrn_number}`, 14, y); y += 5 }

  // Vehicle info
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  // No vehicle on a quotation: the line under it is what the quote is FOR, and
  // the label says so (Antony, 26 Sep 2026: "hii isome summary").
  doc.text((invoice.job_cards?.vehicles || invoice.vehicles) ? 'VEHICLE:' : 'SUMMARY:', 14, y + 3)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  y += 10
  // A quotation with no job card carries its vehicle directly, or only a
  // subject when the customer has no vehicle on file (041).
  const veh = invoice.job_cards?.vehicles || invoice.vehicles
  doc.text(veh
    ? `${veh.registration_number || ''} - ${veh.make || ''} ${veh.model || ''} ${veh.year || ''}`
    : (invoice.subject || '-'), 14, y)
  doc.text(invoice.job_cards?.job_number ? `Job: ${invoice.job_cards.job_number}` : (veh && invoice.subject ? invoice.subject : ''), 14, y + 5)

  // Items table
  const partItems = items.filter(i => i.item_type === 'part')
  const labourItems = items.filter(i => i.item_type === 'labour')
  const additionalItems = items.filter(i => i.item_type === 'additional')

  const tableData = []

  if (partItems.length > 0) {
    tableData.push([{ content: 'PARTS & MATERIALS', colSpan: 5, styles: { fillColor: [255, 243, 235], fontStyle: 'bold', textColor: blue } }])
    partItems.forEach((item, i) => {
      tableData.push([
        i + 1,
        item.description,
        item.quantity,
        formatTZS(item.selling_price),
        formatTZS(item.total_selling),
      ])
    })
  }

  if (labourItems.length > 0) {
    tableData.push([{ content: 'LABOUR & SERVICES', colSpan: 5, styles: { fillColor: [240, 255, 245], fontStyle: 'bold', textColor: [5, 150, 105] } }])
    labourItems.forEach((item, i) => {
      tableData.push([
        i + 1,
        item.description,
        `${item.quantity} hrs`,
        formatTZS(item.selling_price),
        formatTZS(item.total_selling),
      ])
    })
  }

  if (additionalItems.length > 0) {
    tableData.push([{ content: 'ADDITIONAL COSTS', colSpan: 5, styles: { fillColor: [255, 247, 237], fontStyle: 'bold', textColor: [217, 119, 6] } }])
    additionalItems.forEach((item, i) => {
      tableData.push([
        i + 1,
        item.description,
        item.quantity,
        formatTZS(item.selling_price),
        formatTZS(item.total_selling),
      ])
    })
  }

  autoTable(doc, {
    startY: y + 12,
    head: [['#', 'Description', 'Qty', 'Unit Price', 'Amount']],
    body: tableData,
    headStyles: { fillColor: blue, textColor: [255, 255, 255], fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 12 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 22, halign: 'right' },
      3: { cellWidth: 35, halign: 'right' },
      4: { cellWidth: 35, halign: 'right' },
    },
    theme: 'striped',
    margin: { left: 14, right: 14 },
  })

  // Totals
  const totalsX = pageWidth - 80
  const pageHeight = doc.internal.pageSize.getHeight()

  const drawTotalLine = (label, value, yPos, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(bold ? 11 : 9)
    doc.setTextColor(...(bold ? blue : darkGray))
    doc.text(label, totalsX, yPos)
    doc.text(value, pageWidth - 14, yPos, { align: 'right' })
  }

  // Money already received, and what a proforma asks for up front.
  const amountPaid = Number(invoice.amount_paid) || 0
  const totalAmount = Number(invoice.total_amount) || 0
  const balance = Math.max(0, totalAmount - amountPaid)
  const depositPct = Number(invoice.deposit_percentage) || 0
  const showDeposit = invoice.invoice_type === 'proforma' && depositPct > 0 && amountPaid <= 0 && balance > 0
  const showPayment = amountPaid > 0 || showDeposit

  // The closing block (subtotals, TOTAL, payment, internal figures, footer)
  // stays on one sheet. It used to start wherever the table ended and run
  // straight into the fixed-position footer — a 20-line proforma printed
  // "Thank you for choosing…" across its subtotals (Antony, 26 Sep 2026).
  let needed = 3 * 6 + 8 + 12
  if (Number(invoice.subtotal_additional) > 0) needed += 6
  if (Number(invoice.discount_amount) > 0) needed += 6
  if (showPayment) needed += 22
  if (showInternal) needed += 36
  let ty = doc.lastAutoTable.finalY + 8
  if (ty + needed > pageHeight - 24) {
    doc.addPage()
    ty = 20
  }
  drawTotalLine('Parts Subtotal:', formatTZS(invoice.subtotal_parts), ty)
  ty += 6
  drawTotalLine('Labour Subtotal:', formatTZS(invoice.subtotal_labour), ty)
  if (Number(invoice.subtotal_additional) > 0) { ty += 6; drawTotalLine('Additional:', formatTZS(invoice.subtotal_additional), ty) }
  if (Number(invoice.discount_amount) > 0) { ty += 6; drawTotalLine('Discount:', `-${formatTZS(invoice.discount_amount)}`, ty) }
  ty += 6
  drawTotalLine(`VAT (${invoice.vat_rate != null ? Number(invoice.vat_rate) : 18}%):`, formatTZS(invoice.vat_amount), ty)
  ty += 8

  // Total box
  doc.setFillColor(...blue)
  doc.roundedRect(totalsX - 4, ty - 5, pageWidth - totalsX - 10 + 4, 12, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('TOTAL:', totalsX, ty + 3)
  doc.text(formatTZS(invoice.total_amount), pageWidth - 14, ty + 3, { align: 'right' })

  // Payment status: what has been received and what is still owed, or the
  // deposit a proforma asks for. Antony recorded a payment and the PDF said
  // nothing about it.
  if (showPayment) {
    ty += 16
    if (amountPaid > 0) {
      drawTotalLine('Amount Paid:', formatTZS(amountPaid), ty)
      ty += 6
      drawTotalLine(balance > 0 ? 'Balance Due:' : 'Balance:', formatTZS(balance), ty, true)
      if (balance <= 0 && invoice.paid_at) {
        ty += 5
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...lightGray)
        doc.text(`Paid in full on ${formatDate(invoice.paid_at)}`, pageWidth - 14, ty, { align: 'right' })
      }
    } else {
      drawTotalLine(`Deposit required (${depositPct}%):`,
        formatTZS(invoice.deposit_amount || totalAmount * depositPct / 100), ty, true)
    }
  }

  // Internal breakdown (if manager) — on proformas too, like the screen.
  if (showInternal) {
    ty += 20
    doc.setFillColor(255, 251, 235)
    doc.rect(14, ty - 4, pageWidth - 28, 30, 'F')
    doc.setTextColor(161, 98, 7)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('INTERNAL COST BREAKDOWN (MANAGEMENT ONLY)', 18, ty + 2)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...darkGray)
    doc.text(`Parts Cost: ${formatTZS(invoice.internal_cost_parts)} | Parts Profit: ${formatTZS(invoice.profit_parts)}`, 18, ty + 10)
    doc.text(`Labour Cost: ${formatTZS(invoice.internal_cost_labour)} | Labour Profit: ${formatTZS(invoice.profit_labour)}`, 18, ty + 16)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(5, 150, 105)
    doc.text(`Total Profit: ${formatTZS(invoice.profit_total)} (${Number(invoice.profit_margin).toFixed(1)}%)`, 18, ty + 22)
  }

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 15
  doc.setTextColor(...lightGray)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('Thank you for choosing Malibora Truck Clinic', pageWidth / 2, footerY, { align: 'center' })
  doc.text('Asante kwa kuchagua Malibora Truck Clinic', pageWidth / 2, footerY + 5, { align: 'center' })

  // Save
  doc.save(`${invoice.invoice_number}.pdf`)
  return doc
}

export async function generateHandoverPDF(handover) {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()

  // Header (brand mark + wordmark + every address)
  const headerBottom = await drawPdfHeader(doc, pageWidth)
  const top = headerBottom + 12

  // Title, number, date
  doc.setTextColor(55, 65, 81)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('VEHICLE HANDOVER CARD', pageWidth - 14, top, { align: 'right' })
  doc.setFontSize(11)
  doc.setTextColor(201, 92, 12)
  doc.text(handover.handover_number, pageWidth - 14, top + 8, { align: 'right' })
  doc.setFontSize(9)
  doc.setTextColor(156, 163, 175)
  doc.text(`Date: ${formatDate(handover.handover_date)}`, pageWidth - 14, top + 15, { align: 'right' })

  // Customer & Vehicle
  let y = top
  doc.setTextColor(55, 65, 81)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('Customer:', 14, y); doc.setFont('helvetica', 'normal'); doc.text(handover.customers?.full_name || '', 40, y); y += 6
  doc.setFont('helvetica', 'bold'); doc.text('Vehicle:', 14, y); doc.setFont('helvetica', 'normal'); doc.text(handover.vehicles?.registration_number || '', 40, y); y += 6
  doc.setFont('helvetica', 'bold'); doc.text('Job Card:', 14, y); doc.setFont('helvetica', 'normal'); doc.text(handover.job_cards?.job_number || '', 40, y); y += 10

  // Work Summary
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Work Completed:', 14, y); y += 6
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  const workLines = doc.splitTextToSize(handover.work_summary || '', pageWidth - 28)
  doc.text(workLines, 14, y); y += workLines.length * 5 + 5

  if (handover.parts_summary) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Parts Used:', 14, y); y += 6
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    const partLines = doc.splitTextToSize(handover.parts_summary, pageWidth - 28)
    doc.text(partLines, 14, y); y += partLines.length * 5 + 5
  }

  if (handover.recommendations) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Recommendations:', 14, y); y += 6
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    const recLines = doc.splitTextToSize(handover.recommendations, pageWidth - 28)
    doc.text(recLines, 14, y); y += recLines.length * 5 + 5
  }

  // Mileage & Fuel
  y += 5
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.text(`Mileage Out: ${handover.mileage_out?.toLocaleString() || '-'} km`, 14, y)
  doc.text(`Fuel Level: ${handover.fuel_level_out || '-'}`, 100, y); y += 8

  // Warranty
  doc.text(`Parts Warranty: ${handover.warranty_parts_days} days`, 14, y)
  doc.text(`Labour Warranty: ${handover.warranty_labour_days} days`, 100, y); y += 15

  // Signatures
  doc.setDrawColor(200, 200, 200)
  doc.line(14, y, 80, y)
  doc.line(110, y, pageWidth - 14, y)
  doc.setFontSize(8); doc.setFont('helvetica', 'normal')
  doc.text('Customer Signature', 14, y + 5)
  doc.text('Authorized by Malibora', 110, y + 5)

  if (handover.received_by) {
    doc.text(`Received by: ${handover.received_by}`, 14, y + 10)
  }

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 10
  doc.setTextColor(156, 163, 175)
  doc.setFontSize(7)
  doc.text('Malibora Truck Clinic - Professional Vehicle Service & Repair', pageWidth / 2, footerY, { align: 'center' })

  doc.save(`${handover.handover_number}.pdf`)
  return doc
}
