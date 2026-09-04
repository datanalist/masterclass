import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import { useRunGeneration } from '../lib/generation'
import { supabase } from '../lib/supabase'

const TYPE_OPTIONS = [
  { id: 'photo', label: 'Фото' },
  { id: 'card', label: 'Карточка' },
]

export default function GenerateModal({ open, onClose, onCompleted, onOpenAuth }) {
  const { session, user, profile, refreshProfile } = useAuth()
  const { status, progress, error, result, run, reset, isBusy } = useRunGeneration()
  const [categories, setCategories] = useState([])
  const [presets, setPresets] = useState([])
  const [tariffs, setTariffs] = useState([])
  const [file, setFile] = useState(null)
  const [generationType, setGenerationType] = useState('photo')
  const [categoryId, setCategoryId] = useState('')
  const [presetId, setPresetId] = useState('')
  const [wishes, setWishes] = useState('')
  const [objectCount, setObjectCount] = useState(1)
  const [catalogError, setCatalogError] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)

  const resetForm = () => {
    reset()
    setFile(null)
    setWishes('')
    setObjectCount(1)
    setGenerationType('photo')
    setConfirmClose(false)
  }

  const closeQuietly = () => {
    resetForm()
    onClose()
  }

  const requestClose = () => {
    if (isBusy) {
      setConfirmClose(true)
      return
    }
    closeQuietly()
  }

  const confirmCancelAndClose = () => {
    const shouldRefresh = isBusy || status === 'failed' || status === 'succeeded'
    resetForm()
    onClose()
    if (shouldRefresh) onCompleted?.()
  }

  useEffect(() => {
    if (!open) return undefined

    const onKey = (event) => {
      if (event.key !== 'Escape') return
      if (isBusy) {
        setConfirmClose(true)
        return
      }
      reset()
      setFile(null)
      setWishes('')
      setObjectCount(1)
      setGenerationType('photo')
      setConfirmClose(false)
      onClose()
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose, isBusy, reset])

  useEffect(() => {
    if (!open || !supabase) return undefined

    let cancelled = false
    Promise.all([
      supabase.from('categories').select('id, title, has_presets, sort_order').order('sort_order'),
      supabase
        .from('presentation_presets')
        .select('id, category_id, title, prompt, sort_order')
        .order('sort_order'),
      supabase.from('generation_tariffs').select('generation_type, points_per_object'),
    ]).then(([categoryRes, presetRes, tariffRes]) => {
      if (cancelled) return
      if (categoryRes.error || presetRes.error || tariffRes.error) {
        setCatalogError('Не удалось загрузить справочники')
        return
      }
      setCategories(categoryRes.data ?? [])
      setPresets(presetRes.data ?? [])
      setTariffs(tariffRes.data ?? [])
      setCategoryId((current) => current || categoryRes.data?.[0]?.id || '')
    })

    return () => {
      cancelled = true
    }
  }, [open])

  const category = categories.find((item) => item.id === categoryId)
  const categoryPresets = useMemo(
    () => presets.filter((item) => item.category_id === categoryId),
    [categoryId, presets],
  )

  useEffect(() => {
    if (!category?.has_presets) {
      setPresetId('')
      return
    }
    setPresetId((current) =>
      categoryPresets.some((item) => item.id === current) ? current : categoryPresets[0]?.id || '',
    )
  }, [category?.has_presets, categoryPresets])

  const pointsEach =
    tariffs.find((item) => item.generation_type === generationType)?.points_per_object ?? 0
  const cost = pointsEach * objectCount
  const balance = profile?.points_balance ?? 0
  const canAfford = pointsEach > 0 && balance >= cost
  const statusLabel = statusText(status, progress)

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!supabase || !user || !session?.access_token || isBusy) return
    if (!file) return
    if (!canAfford) return

    run({
      client: supabase,
      userId: user.id,
      accessToken: session.access_token,
      file,
      generationType,
      categoryId,
      presentationPresetId: category?.has_presets ? presetId || null : null,
      wishes,
      objectCount,
    })
      .then(() => {
        refreshProfile()
        onCompleted?.()
      })
      .catch((err) => {
        refreshProfile()
        onCompleted?.()
        if (err?.code === 'aborted') return
      })
  }

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={requestClose}>
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
          <button type="button" className="modal-close" aria-label="Закрыть" onClick={requestClose}>
            ×
          </button>
        </header>

        {!session ? (
          <div className="modal-form">
            <p className="muted">Войдите, чтобы запускать генерации и списывать баллы.</p>
            <div className="modal-actions">
              <button type="button" className="btn-primary" onClick={() => onOpenAuth?.()}>
                Войти
              </button>
            </div>
          </div>
        ) : (
          <form className="modal-form" onSubmit={handleSubmit}>
            <label>
              Загрузить фото товара
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/*"
                className="file-input"
                disabled={isBusy}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>

            <label>
              Тип генерации
              <select
                value={generationType}
                disabled={isBusy}
                onChange={(event) => setGenerationType(event.target.value)}
              >
                {TYPE_OPTIONS.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Категория
              <select
                value={categoryId}
                disabled={isBusy || categories.length === 0}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>

            {category?.has_presets ? (
              <label>
                Как показать товар
                <select
                  value={presetId}
                  disabled={isBusy || categoryPresets.length === 0}
                  onChange={(event) => setPresetId(event.target.value)}
                >
                  {categoryPresets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label>
              Пожелания / описание
              <textarea
                placeholder="Например: светлый фон, акцент на фактуре ткани"
                value={wishes}
                disabled={isBusy}
                maxLength={2000}
                onChange={(event) => setWishes(event.target.value)}
              />
            </label>

            <div className="modal-row">
              <label>
                Количество объектов
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={objectCount}
                  disabled={isBusy}
                  onChange={(event) => setObjectCount(clampObjectCount(event.target.value))}
                />
              </label>
              <label>
                Цена
                <input type="text" value={`${cost} баллов`} readOnly />
              </label>
            </div>

            <p className="muted">Баланс: {balance} баллов</p>
            {pointsEach <= 0 ? (
              <p className="modal-status is-failed">Тариф для этого типа не настроен.</p>
            ) : null}
            {pointsEach > 0 && !canAfford ? (
              <p className="modal-status is-failed">Недостаточно баллов для запуска.</p>
            ) : null}
            {status !== 'idle' ? (
              <p className={`modal-status is-${status}`} aria-live="polite">
                {statusLabel}
              </p>
            ) : null}
            {catalogError ? <p className="modal-status is-failed">{catalogError}</p> : null}
            {status === 'failed' && error?.message ? (
              <p className="modal-status is-failed">{error.message}</p>
            ) : null}
            {status === 'succeeded' && result?.generationId ? (
              <>
                <p className="modal-status is-succeeded">Результат сохранён в каталог.</p>
                {generationType === 'card' ? (
                  <p className="muted">
                    {result.detectedLabel
                      ? `Предмет: ${result.detectedLabel}`
                      : 'Не удалось определить, карточка по всему кадру'}
                  </p>
                ) : null}
                {result.images?.[0]?.image?.url ? (
                  <img src={result.images[0].image.url} alt="" className="generation-thumb" />
                ) : null}
              </>
            ) : null}

            {confirmClose && isBusy ? (
              <div className="modal-confirm" role="alertdialog" aria-labelledby="cancel-title">
                <p id="cancel-title">Остановить генерацию? Несохранённые кадры будут отменены.</p>
                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={() => setConfirmClose(false)}>
                    Продолжить
                  </button>
                  <button type="button" className="btn-primary" onClick={confirmCancelAndClose}>
                    Остановить
                  </button>
                </div>
              </div>
            ) : null}

            <div className="modal-actions">
              <button type="button" className="btn-cancel" onClick={isBusy ? () => setConfirmClose(true) : closeQuietly}>
                {status === 'succeeded' ? 'Закрыть' : 'Отмена'}
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={
                  isBusy ||
                  !file ||
                  !categoryId ||
                  (category?.has_presets && !presetId) ||
                  !canAfford
                }
              >
                {isBusy ? 'Генерация…' : 'Запустить генерацию'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function clampObjectCount(value) {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return 1
  return Math.min(20, Math.max(1, parsed))
}

function statusText(status, progress) {
  if (status === 'uploading') return 'Загрузка фото…'
  if (status === 'detecting') return 'Определяем предмет на фото…'
  if (status === 'queued') return 'Списание баллов…'
  if (status === 'running') {
    if (progress?.total) return `Генерация ${progress.current} из ${progress.total}…`
    return 'Генерация…'
  }
  if (status === 'succeeded') return 'Готово'
  if (status === 'failed') return 'Не удалось выполнить генерацию'
  return ''
}
