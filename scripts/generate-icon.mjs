// Generates the PocketVault "PV" logo (Roboto Bold) into all the icon/splash
// sources. The glyph outlines below were extracted once from
// assets/fonts/Roboto-Bold.ttf (Roboto, Apache-2.0), so no font is needed at
// build time - just sharp (already used by @capacitor/assets).
//
// Outputs:
//   build/icon.png, build/icon.ico, src/renderer/public/icon.png   (desktop + in-app)
//   assets/icon.png, assets/icon-only.png, assets/icon-background.png,
//   assets/icon-foreground.png, assets/splash.png, assets/splash-dark.png
//     -> consumed by @capacitor/assets (npm run assets) to build Android icons/splash
//   android/app/src/main/res/drawable/ic_notification.png (white status-bar icon)
//   android/app/src/main/res/drawable/ic_notification_large.png (colored big icon)
//
// Run with: node scripts/generate-icon.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const EMERALD = '#059669' // accent-600
const DARK_BG = '#022c22' // accent-950
const WHITE = '#ffffff'

// Roboto Bold "PV" outlines in a 1000-unit em, baseline at y = 0.
const PV_PATH =
  'M338.38-250.49L209.96-250.49L209.96 0L63.48 0L63.48-710.94L340.82-710.94Q420.90-710.94 481.69-681.64Q542.48-652.34 575.20-598.39Q607.91-544.43 607.91-475.59Q607.91-371.09 536.38-310.79Q464.84-250.49 338.38-250.49M209.96-592.29L209.96-369.14L340.82-369.14Q398.93-369.14 429.44-396.48Q459.96-423.83 459.96-474.61Q459.96-526.86 429.20-559.08Q398.44-591.31 344.24-592.29L209.96-592.29M811.04-710.94L971.19-176.27L1132.32-710.94L1295.41-710.94L1047.85 0L895.02 0L648.44-710.94'
const PV_BBOX = { x1: 63.4765625, y1: -710.9375, x2: 1295.41015625, y2: 0 }

const svg = (size, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`

// The monogram scaled to `fraction` of the canvas and centered.
function mark(size, fraction, color) {
  const width = PV_BBOX.x2 - PV_BBOX.x1
  const scale = (fraction * size) / width
  const cx = (PV_BBOX.x1 + PV_BBOX.x2) / 2
  const cy = (PV_BBOX.y1 + PV_BBOX.y2) / 2
  return `<g transform="translate(${size / 2} ${size / 2}) scale(${scale.toFixed(6)}) translate(${-cx} ${-cy})"><path d="${PV_PATH}" fill="${color}"/></g>`
}

function roundedTile(size, fraction = 0.62) {
  const radius = Math.round(size * 0.21875)
  return svg(size, `<rect width="${size}" height="${size}" rx="${radius}" fill="${EMERALD}"/>${mark(size, fraction, WHITE)}`)
}

function markOnly(size, fraction, color, background = null) {
  const bg = background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : ''
  return svg(size, `${bg}${mark(size, fraction, color)}`)
}

const solid = (size, color) => svg(size, `<rect width="${size}" height="${size}" fill="${color}"/>`)
const toPng = (markup, size) => sharp(Buffer.from(markup), { density: 384 }).resize(size, size).png().toBuffer()

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
mkdirSync('src/renderer/public', { recursive: true })
mkdirSync('assets', { recursive: true })
mkdirSync('android/app/src/main/res/drawable', { recursive: true })

const tile1024 = await toPng(roundedTile(1024), 1024)
writeFileSync('build/icon.png', tile1024)

const tile256 = await toPng(roundedTile(256), 256)
writeFileSync('build/icon.ico', encodeIco(tile256, 256))
writeFileSync('src/renderer/public/icon.png', tile256)

writeFileSync('assets/icon.png', tile1024)
writeFileSync('assets/icon-only.png', tile1024)
writeFileSync('assets/icon-background.png', await toPng(solid(1024, EMERALD), 1024))
writeFileSync('assets/icon-foreground.png', await toPng(markOnly(1024, 0.6, WHITE), 1024))
writeFileSync('assets/splash.png', await toPng(markOnly(2732, 0.26, WHITE, EMERALD), 2732))
writeFileSync('assets/splash-dark.png', await toPng(markOnly(2732, 0.26, WHITE, DARK_BG), 2732))

// Android notification icons (consumed by @capacitor/local-notifications via
// capacitor.config.json `smallIcon` and the per-notification `largeIcon`).
// The status-bar icon must be a white silhouette on transparency; the large
// icon is the colored brand tile shown in the expanded notification.
writeFileSync(
  'android/app/src/main/res/drawable/ic_notification.png',
  await toPng(markOnly(96, 0.72, WHITE), 96)
)
writeFileSync(
  'android/app/src/main/res/drawable/ic_notification_large.png',
  await toPng(roundedTile(192), 192)
)

console.log('build/icon.png              1024')
console.log('build/icon.ico               256')
console.log('src/renderer/public/icon.png 256')
console.log('assets/icon.png              1024')
console.log('assets/icon-only.png         1024')
console.log('assets/icon-background.png   1024')
console.log('assets/icon-foreground.png   1024')
console.log('assets/splash.png            2732')
console.log('assets/splash-dark.png       2732')
console.log('android/.../ic_notification.png        96')
console.log('android/.../ic_notification_large.png 192')
