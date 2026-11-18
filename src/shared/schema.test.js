import { describe, expect, it } from 'vitest'
import { MIGRATIONS, SCHEMA_VERSION } from './schema.js'

describe('schema', () => {
  it('exposes seven migrations in order', () => {
    expect(SCHEMA_VERSION).toBe(7)
    expect(MIGRATIONS).toHaveLength(7)
  })

  it('puts wallets and wallet ids in V6', () => {
    const v6 = MIGRATIONS[5]
    expect(v6).toContain('CREATE TABLE IF NOT EXISTS wallets')
    expect(v6).toContain('CREATE TABLE IF NOT EXISTS wallet_transfers')
    expect(v6).toContain('ALTER TABLE income ADD COLUMN wallet_id')
    expect(v6).toContain("SELECT id, 'Cash', 'cash', 'cash'")
  })

  it('keeps every migration non-empty', () => {
    expect(MIGRATIONS.every((migration) => typeof migration === 'string' && migration.length > 0)).toBe(
      true
    )
  })
})
