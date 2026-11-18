import { describe, expect, it } from 'vitest'
import { parseCsv } from './csv.js'

const HEADER = 'date,type,amount,category,wallet,notes\n'

describe('parseCsv', () => {
  it('parses quoted fields, BOM and ignores blank lines', () => {
    const result = parseCsv(
      `\uFEFF${HEADER}2026-03-01,income,2500,Salary,Cash,"March salary"\n\n2026-03-02,expense,12.345,Food & Dining,BDO,"lunch, with team"\n`
    )
    expect(result.errors).toEqual([])
    expect(result.rows).toHaveLength(2)
    expect(result.rows[1]).toMatchObject({
      date: '2026-03-02',
      type: 'expense',
      amount: 12.35,
      category: 'Food & Dining',
      wallet: 'BDO',
      notes: 'lunch, with team'
    })
  })

  it('reports missing headers and invalid rows', () => {
    expect(parseCsv('date,amount\n2026-01-01,5').errors[0]).toMatch(/Missing column/)
    const result = parseCsv(
      `${HEADER}2026-02-31,expense,10,Food,Cash,\n2026-01-01,transfer,10,Food,Cash,\n2026-01-01,income,-1,Salary,Cash,\n`
    )
    expect(result.rows).toHaveLength(0)
    expect(result.errors).toHaveLength(3)
  })
})
