import { api } from '@renderer/lib/api.js'
import { formatCurrency, formatDate } from './format.js'

function escapeCsv(value) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function buildCsv(rows, columns) {
  const header = columns.map((column) => escapeCsv(column.header)).join(',')
  const body = rows
    .map((row) => columns.map((column) => escapeCsv(column.value(row))).join(','))
    .join('\n')
  return `${header}\n${body}`
}

async function saveBytes(defaultName, bytes, filters) {
  return api.files.saveExport({ defaultName, data: bytes, filters })
}

export async function exportCsv(defaultName, rows, columns) {
  const csv = buildCsv(rows, columns)
  const bytes = new TextEncoder().encode(`\uFEFF${csv}`)
  return saveBytes(defaultName, bytes, [{ name: 'CSV', extensions: ['csv'] }])
}

export async function exportPdf(defaultName, { title, subtitle, sections = [] }) {
  // jsPDF is heavy; load it only when a PDF is actually generated so the
  // Reports screen does not pay for it up front.
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 48
  let y = margin

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(title, margin, y)
  y += 22

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(120)
  doc.text(`Generated ${formatDate(new Date().toISOString().slice(0, 10), 'PPpp')}`, margin, y)
  if (subtitle) {
    y += 14
    doc.text(subtitle, margin, y)
  }
  doc.setTextColor(30)
  y += 24

  for (const section of sections) {
    if (y > 760) {
      doc.addPage()
      y = margin
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text(section.heading, margin, y)
    y += 18

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    for (const item of section.items) {
      if (y > 770) {
        doc.addPage()
        y = margin
      }
      const label = String(item.label)
      const value = item.value ?? ''
      doc.text(label, margin, y)
      if (value !== '') {
        const valueText = typeof value === 'number' ? formatCurrency(value) : String(value)
        doc.text(valueText, 595 - margin, y, { align: 'right' })
      }
      y += 16
    }
    y += 12
  }

  const buffer = doc.output('arraybuffer')
  return saveBytes(defaultName, new Uint8Array(buffer), [{ name: 'PDF', extensions: ['pdf'] }])
}
