import { describe, expect, it } from 'vitest'
import { decryptBackup, encryptBackup, isEncryptedBackup } from './backupCrypto.js'

const payload = new TextEncoder().encode('PK\u0003\u0004 pocketvault zip bytes')

describe('encrypted backups', () => {
  it('round-trips a backup with AES-256-GCM', async () => {
    const encrypted = await encryptBackup(payload, 'correct horse battery staple')
    expect(isEncryptedBackup(encrypted)).toBe(true)
    expect(encrypted).not.toContain('pocketvault zip bytes')
    const decrypted = await decryptBackup(encrypted, 'correct horse battery staple')
    expect(Array.from(decrypted)).toEqual(Array.from(payload))
  })

  it('uses a fresh salt and IV every time', async () => {
    const first = await encryptBackup(payload, 'passphrase')
    const second = await encryptBackup(payload, 'passphrase')
    expect(JSON.parse(first).salt).not.toBe(JSON.parse(second).salt)
    expect(JSON.parse(first).iv).not.toBe(JSON.parse(second).iv)
  })

  it('rejects the wrong password and tampered ciphertext', async () => {
    const encrypted = await encryptBackup(payload, 'passphrase')
    await expect(decryptBackup(encrypted, 'wrong')).rejects.toThrow('Incorrect backup password')
    const envelope = JSON.parse(encrypted)
    envelope.ciphertext = Buffer.from('tampered').toString('base64')
    await expect(decryptBackup(JSON.stringify(envelope), 'passphrase')).rejects.toThrow(
      'Incorrect backup password'
    )
  })

  it('does not mistake a legacy zip for an encrypted backup', () => {
    expect(isEncryptedBackup('PK\u0003\u0004')).toBe(false)
    expect(isEncryptedBackup('{}')).toBe(false)
  })

  it('requires a password', async () => {
    await expect(encryptBackup(payload, '')).rejects.toThrow('password is required')
    await expect(decryptBackup('{}', '')).rejects.toThrow('password is required')
  })
})
