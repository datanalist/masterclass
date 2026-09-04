import { useEffect } from 'react'

const TYPES = ['Фото', 'Карточка']
const PRESENTATIONS = ['Студийный свет', 'На модели', 'На белом фоне', 'Lifestyle']

export default function GenerateModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return undefined

    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="generate-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <span className="badge">Генерация</span>
            <h2 id="generate-title" className="modal-title">
              Новая генерация
            </h2>
          </div>
          <button type="button" className="modal-close" aria-label="Закрыть" onClick={onClose}>
            ×
          </button>
        </header>

        <form
          className="modal-form"
          onSubmit={(event) => {
            event.preventDefault()
            onClose()
          }}
        >
          <label>
            Загрузить фото товара
            <input type="file" accept="image/*" className="file-input" />
          </label>

          <label>
            Тип генерации
            <select defaultValue="Фото">
              {TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label>
            Как показать товар
            <select defaultValue="Студийный свет">
              {PRESENTATIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label>
            Пожелания / описание
            <textarea placeholder="Например: светлый фон, акцент на фактуре ткани" />
          </label>

          <div className="modal-row">
            <label>
              Количество объектов
              <input type="number" min="1" defaultValue="3" />
            </label>
            <label>
              Цена
              <input type="text" defaultValue="120 баллов" readOnly />
            </label>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="btn-primary">
              Запустить генерацию
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
