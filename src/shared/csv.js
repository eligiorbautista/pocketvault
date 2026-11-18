const HEADERS = ['date', 'type', 'amount', 'category', 'wallet', 'notes']

function splitRows(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i += 1
      } else if (char === '"') quoted = false
      else field += char
    } else if (char === '"') quoted = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') field += char
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

export function parseCsv(text) {
  const rows = splitRows(String(text ?? '').replace(/^\uFEFF/, ''))
  if (!rows.length) return { rows: [], errors: ['The file is empty.'] }
  const header = rows[0].map((value) => value.trim().toLowerCase())
  const missing = HEADERS.filter((key) => !header.includes(key))
  if (missing.length) {
    return { rows: [], errors: [`Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`] }
  }
  const index = Object.fromEntries(HEADERS.map((key) => [key, header.indexOf(key)]))
  const parsed = []
  const errors = []
  rows.slice(1).forEach((cells, line) => {
    if (cells.every((cell) => !cell.trim())) return
    const value = (key) => (cells[index[key]] ?? '').trim()
    const type = value('type').toLowerCase()
    const amount = Number(value('amount'))
    const date = value('date')
    if (!['income', 'expense'].includes(type)) {
      errors.push(`Line ${line + 2}: type must be income or expense.`)
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push(`Line ${line + 2}: date must be YYYY-MM-DD.`)
      return
    }
    const parsedDate = new Date(`${date}T00:00:00Z`)
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
      errors.push(`Line ${line + 2}: date is not valid.`)
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.push(`Line ${line + 2}: amount must be greater than zero.`)
      return
    }
    parsed.push({
      line: line + 2,
      type,
      date,
      amount: Math.round(amount * 100) / 100,
      category: value('category') || 'other',
      wallet: value('wallet'),
      notes: value('notes')
    })
  })
  return { rows: parsed, errors }
}

export const CSV_HEADERS = HEADERS
