import { useEffect, useState } from 'react'
import { downloadImage } from '../lib/downloadImage'

export default function ImagePreviewModal({ open, src, filename, onClose }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return undefined

    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) {
      setBusy(false)
      setError('')
    }
  }, [open])

  if (!open || !src) return null

  const handleDownload = () => {
    if (busy) return
    setBusy(true)
    setError('')
    downloadImage(src, filename)
      .catch((err) => {
        setError(err?.message || 'Не удалось скачать изображение')
      })
      .finally(() => {
        setBusy(false)
      })
  }

  return (
    <div className="modal-backdrop image-preview-backdrop" onClick={onClose}>
      <div
        className="modal image-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-preview-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <h2 id="image-preview-title" className="modal-title">
            Изображение
          </h2>
          <button type="button" className="modal-close" aria-label="Закрыть" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="image-preview-frame">
          <img src={src} alt="" className="image-preview-full" />
        </div>
        {error ? <p className="modal-status is-failed">{error}</p> : null}
        <div className="modal-actions">
          <button type="button" className="btn-cancel" onClick={onClose}>
            Закрыть
          </button>
          <button type="button" className="btn-primary" onClick={handleDownload} disabled={busy}>
            {busy ? 'Скачивание…' : 'Скачать'}
          </button>
        </div>
      </div>
    </div>
  )
}
