import jsPDF from 'jspdf'
import 'jspdf-autotable'

const formatTZS = (amount) => {
  if (!amount && amount !== 0) return 'TZS 0'
  return `TZS ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0 })}`
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function generateInvoicePDF(invoice, items, showInternal = false) {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()

  // Colors
  const blue = [30, 64, 175]
  const darkGray = [55, 65, 81]
  const lightGray = [156, 163, 175]

  // Header
  doc.setFillColor(...blue)
  doc.rect(0, 0, pageWidth, 35, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('MALIBORA TRUCK CLINIC', 14, 18)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Professional Vehicle Service & Repair | Arusha, Tanzania', 14, 26)

  // Invoice type & number
  const typeLabel = invoice.invoice_type === 'proforma' ? 'PROFORMA INVOICE' :
    invoice.invoice_type === 'internal' ? 'INTERNAL INVOICE' : 'INVOICE'

  doc.setTextColor(...darkGray)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(typeLabel, pageWidth - 14, 48, { align: 'right' })
  doc.setFontSize(11)
  doc.setTextColor(...blue)
  doc.text(invoice.invoice_number, pageWidth - 14, 56, { align: 'right' })
  doc.setTextColor(...lightGray)
  doc.setFontSize(9)
  doc.text(`Date: ${formatDate(invoice.created_at)}`, pageWidth - 14, 63, { align: 'right' })

  // Bill To
  let y = 48
  doc.setTextColor(...darkGray)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('BILL TO:', 14, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  y += 7
  doc.text(invoice.customers?.full_name || '', 14, y)
  y += 5
  if (invoice.customers?.company_name) { doc.setFontSize(9); doc.text(invoice.customers.company_name, 14, y); y += 5 }
  doc.setFontSize(9)
  doc.text(invoice.customers?.phone || '', 14, y); y += 5
  if (invoice.customers?.email) { doc.text(invoice.customers.email, 14, y); y += 5 }
  if (invoice.customers?.tin_number) { doc.text(`TIN: ${invoice.customers.tin_number}`, 14, y); y += 5 }

  // Vehicle info
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('VEHICLE:', 14, y + 3)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  y += 10
  const veh = invoice.job_cards?.vehicles
  doc.text(`${veh?.registration_number || ''} - ${veh?.make || ''} ${veh?.model || ''} ${veh?.year || ''}`, 14, y)
  doc.text(`Job: ${invoice.job_cards?.job_number || ''}`, 14, y + 5)

  // Items table
  const partItems = items.filter(i => i.item_type === 'part')
  const labourItems = items.filter(i => i.item_type === 'labour')
  const additionalItems = items.filter(i => i.item_type === 'additional')

  const tableData = []

  if (partItems.length > 0) {
    tableData.push([{ content: 'PARTS & MATERIALS', colSpan: 5, styles: { fillColor: [240, 245, 255], fontStyle: 'bold', textColor: blue } }])
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

  doc.autoTable({
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
  const finalY = doc.lastAutoTable.finalY + 8
  const totalsX = pageWidth - 80

  const drawTotalLine = (label, value, yPos, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(bold ? 11 : 9)
    doc.setTextColor(...(bold ? blue : darkGray))
    doc.text(label, totalsX, yPos)
    doc.text(value, pageWidth - 14, yPos, { align: 'right' })
  }

  let ty = finalY
  drawTotalLine('Parts Subtotal:', formatTZS(invoice.subtotal_parts), ty)
  ty += 6
  drawTotalLine('Labour Subtotal:', formatTZS(invoice.subtotal_labour), ty)
  if (Number(invoice.subtotal_additional) > 0) { ty += 6; drawTotalLine('Additional:', formatTZS(invoice.subtotal_additional), ty) }
  if (Number(invoice.discount_amount) > 0) { ty += 6; drawTotalLine('Discount:', `-${formatTZS(invoice.discount_amount)}`, ty) }
  ty += 6
  drawTotalLine('VAT (18%):', formatTZS(invoice.vat_amount), ty)
  ty += 8

  // Total box
  doc.setFillColor(...blue)
  doc.roundedRect(totalsX - 4, ty - 5, pageWidth - totalsX - 10 + 4, 12, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('TOTAL:', totalsX, ty + 3)
  doc.text(formatTZS(invoice.total_amount), pageWidth - 14, ty + 3, { align: 'right' })

  // Internal breakdown (if manager)
  if (showInternal && invoice.invoice_type !== 'proforma') {
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

export function generateHandoverPDF(handover) {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const blue = [30, 64, 175]

  // Header
  doc.setFillColor(...blue)
  doc.rect(0, 0, pageWidth, 35, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('MALIBORA TRUCK CLINIC', 14, 18)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('VEHICLE HANDOVER CARD', 14, 27)

  // Handover number
  doc.setTextColor(55, 65, 81)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(handover.handover_number, pageWidth - 14, 48, { align: 'right' })
  doc.setFontSize(9)
  doc.setTextColor(156, 163, 175)
  doc.text(`Date: ${formatDate(handover.handover_date)}`, pageWidth - 14, 56, { align: 'right' })

  // Customer & Vehicle
  let y = 48
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
