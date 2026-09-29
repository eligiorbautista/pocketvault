export function runPaginated(
  db,
  { select, from, where = [], params = [], orderBy = 'id DESC', page = 1, pageSize = 50 }
) {
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const total = db.prepare(`SELECT COUNT(*) AS c FROM ${from} ${whereSql}`).get(...params).c
  const offset = (page - 1) * pageSize
  const rows = db
    .prepare(`${select} FROM ${from} ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset)
  return {
    rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  }
}

export { monthRange, currentMonth, todayISO } from '../../../shared/dates.js'
