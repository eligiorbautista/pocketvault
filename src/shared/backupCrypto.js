const FORMAT = 'pocketvault-backup'
const VERSION = 1
const KDF = 'PBKDF2-SHA256'
const ITERATIONS = 310_000
const SALT_BYTES = 16
const IV_BYTES = 12
const MIN_ITERATIONS = 10_000
const MAX_ITERATIONS = 1_000_000

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function bytesToBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64')
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64ToBytes(value) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(value, 'base64'))
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesOf(value) {
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (typeof value === 'string') return encoder.encode(value)
  throw new Error('Invalid backup data')
}

function textOf(value) {
  if (typeof value === 'string') return value
  if (ArrayBuffer.isView(value)) return decoder.decode(value)
  if (value instanceof ArrayBuffer) return decoder.decode(new Uint8Array(value))
  throw new Error('Invalid backup file')
}

function assertPassphrase(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length === 0) {
    throw new Error('A backup password is required')
  }
}

async function deriveKey(passphrase, salt, iterations) {
  const base = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

function parseEnvelope(input) {
  let envelope
  try {
    envelope = JSON.parse(textOf(input))
  } catch {
    return null
  }
  if (
    !envelope ||
    envelope.format !== FORMAT ||
    envelope.version !== VERSION ||
    envelope.kdf !== KDF
  ) {
    return null
  }
  return envelope
}

export function isEncryptedBackup(input) {
  return Boolean(parseEnvelope(input))
}

export async function encryptBackup(data, passphrase) {
  assertPassphrase(passphrase)
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(passphrase, salt, ITERATIONS)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    bytesOf(data)
  )
  return JSON.stringify({
    format: FORMAT,
    version: VERSION,
    kdf: KDF,
    iterations: ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    createdAt: new Date().toISOString()
  })
}

export async function decryptBackup(input, passphrase) {
  assertPassphrase(passphrase)
  const envelope = parseEnvelope(input)
  if (!envelope) throw new Error('Not a PocketVault encrypted backup')
  const iterations = Number(envelope.iterations)
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
    throw new Error('Unsupported backup encryption settings')
  }
  let salt
  let iv
  let ciphertext
  try {
    salt = base64ToBytes(envelope.salt)
    iv = base64ToBytes(envelope.iv)
    ciphertext = base64ToBytes(envelope.ciphertext)
  } catch {
    throw new Error('The backup file is corrupted')
  }
  if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES || ciphertext.length === 0) {
    throw new Error('The backup file is corrupted')
  }
  try {
    const key = await deriveKey(passphrase, salt, iterations)
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    )
    return new Uint8Array(plaintext)
  } catch {
    throw new Error('Incorrect backup password or corrupted backup')
  }
}
