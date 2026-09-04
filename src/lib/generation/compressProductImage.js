const MAX_DIMENSION = 1280
const JPEG_QUALITY = 0.82

/**
 * Resize/compress a product photo before uploading it to Storage.
 * Keeps later OpenRouter calls on a signed HTTPS URL instead of a huge base64 body.
 *
 * @param {File} file
 * @returns {Promise<Blob>}
 */
export async function compressProductImage(file) {
  if (!(file instanceof Blob)) {
    throw new Error('Выберите изображение товара')
  }

  const type = file.type || ''
  if (type && !type.startsWith('image/')) {
    throw new Error('Нужен файл изображения')
  }

  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('Не удалось прочитать изображение. Используйте JPEG, PNG или WebP.')
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('Не удалось обработать изображение')
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result)
        else reject(new Error('Не удалось сжать изображение'))
      },
      'image/jpeg',
      JPEG_QUALITY,
    )
  })

  return blob
}

/** @param {Blob} blob */
export function extensionForBlob(blob) {
  if (blob.type === 'image/png') return 'png'
  if (blob.type === 'image/webp') return 'webp'
  return 'jpg'
}
