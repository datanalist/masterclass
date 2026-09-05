/**
 * @param {string} url
 * @param {string} [filename]
 */
export async function downloadImage(url, filename = 'image.png') {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Не удалось скачать изображение')
  }
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
}
