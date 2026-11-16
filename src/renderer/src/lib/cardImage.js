export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_IMAGE_CHARS = 400_000
const CARD_WIDTH = 512
const CARD_HEIGHT = 323

// Downscales a picked image to a 512x323 card face. The canvas is painted with
// the wallet colour first so JPEG (no alpha) does not turn transparent pixels
// black. `createImageBitmap` applies EXIF orientation when available.
export async function fileToCardImage(file, color = '#3b3b40') {
  if (!file) return null
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a PNG, JPEG or WebP image')
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Image is too large (max 10 MB)')
  }

  let bitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    bitmap = await createImageBitmap(file)
  }

  const canvas = document.createElement('canvas')
  canvas.width = CARD_WIDTH
  canvas.height = CARD_HEIGHT
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = color
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)

  const scale = Math.max(CARD_WIDTH / bitmap.width, CARD_HEIGHT / bitmap.height)
  const width = bitmap.width * scale
  const height = bitmap.height * scale
  ctx.drawImage(bitmap, (CARD_WIDTH - width) / 2, (CARD_HEIGHT - height) / 2, width, height)
  bitmap.close?.()

  let dataUrl = canvas.toDataURL('image/jpeg', 0.82)
  if (dataUrl.length > MAX_IMAGE_CHARS) dataUrl = canvas.toDataURL('image/jpeg', 0.6)
  if (dataUrl.length > MAX_IMAGE_CHARS) {
    throw new Error('Image is too detailed. Try a smaller picture.')
  }
  return dataUrl
}
