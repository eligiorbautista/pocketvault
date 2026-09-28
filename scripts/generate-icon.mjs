// Generates build/icon.png (1024x1024) and build/icon.ico (256x256, PNG-embedded)
// with zero external dependencies. Run with: node scripts/generate-icon.mjs
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const BG = [5, 150, 105] // emerald-600, flat (no gradient)

function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function draw(size) {
  const rgba = Buffer.alloc(size * size * 4)
  const c = (size - 1) / 2
  const ringOuter = size * 0.335
  const ringThick = size * 0.052
  const ringInner = size * 0.185
  const ringInnerThick = size * 0.028
  const disc = size * 0.072
  const spokeHalf = size * 0.017
  const aa = Math.max(1, (size / 1024) * 1.7)

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = BG[0]
      let g = BG[1]
      let b = BG[2]

      const dx = x - c
      const dy = y - c
      const d = Math.sqrt(dx * dx + dy * dy)

      const covOuter = clamp01((ringThick / 2 - Math.abs(d - ringOuter)) / aa + 0.5)
      const covInner = clamp01((ringInnerThick / 2 - Math.abs(d - ringInner)) / aa + 0.5)
      const covDisc = clamp01((disc - d) / aa + 0.5)
      const inSpokeRadius = d > ringInner && d < ringOuter
      const covSpoke = inSpokeRadius
        ? clamp01((spokeHalf - Math.min(Math.abs(dx), Math.abs(dy))) / aa + 0.5)
        : 0

      const cov = Math.max(covOuter, covInner, covDisc, covSpoke)
      r = lerp(r, 255, cov)
      g = lerp(g, 255, cov)
      b = lerp(b, 255, cov)

      const i = (y * size + x) * 4
      rgba[i] = Math.round(r)
      rgba[i + 1] = Math.round(g)
      rgba[i + 2] = Math.round(b)
      rgba[i + 3] = 255
    }
  }
  return rgba
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([length, typeBuf, data, crcBuf])
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function encodeIco(pngBuffer, size) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)

  const entry = Buffer.alloc(16)
  entry[0] = size >= 256 ? 0 : size
  entry[1] = size >= 256 ? 0 : size
  entry[2] = 0
  entry[3] = 0
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(pngBuffer.length, 8)
  entry.writeUInt32LE(6 + 16, 12)

  return Buffer.concat([header, entry, pngBuffer])
}

mkdirSync('build', { recursive: true })

const big = encodePng(1024, draw(1024))
writeFileSync('build/icon.png', big)

const small = encodePng(256, draw(256))
writeFileSync('build/icon.ico', encodeIco(small, 256))

// UI/favicon copy (served from the renderer's public dir).
mkdirSync('src/renderer/public', { recursive: true })
writeFileSync('src/renderer/public/icon.png', small)

console.log(`build/icon.png                 ${big.length} bytes`)
console.log(`build/icon.ico                 ${encodeIco(small, 256).length} bytes`)
console.log(`src/renderer/public/icon.png   ${small.length} bytes`)
