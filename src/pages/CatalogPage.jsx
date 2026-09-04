import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

const OUTPUT_BUCKET = 'generation-outputs'

export default function CatalogPage() {
  const { generateAction, catalogEpoch } = useOutletContext()
  const { session, ready } = useAuth()
  const [rows, setRows] = useState([])
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (!ready || !session || !supabase) {
      setRows([])
      return undefined
    }

    let cancelled = false
    supabase
      .from('generations')
      .select(
        'id, generation_type, status, object_count, cost_points, created_at, error_message, generation_assets ( storage_path, sort_order )',
      )
      .order('created_at', { ascending: false })
      .then(async ({ data, error }) => {
        if (cancelled) return
        if (error) {
          setLoadError('Не удалось загрузить генерации')
          return
        }
        const list = data ?? []
        const paths = list.flatMap((row) =>
          row.status === 'failed'
            ? []
            : (row.generation_assets ?? []).map((asset) => asset.storage_path),
        )
        let signedByPath = {}
        if (paths.length > 0) {
          const { data: signed } = await supabase.storage
            .from(OUTPUT_BUCKET)
            .createSignedUrls(paths, 3600)
          signedByPath = Object.fromEntries(
            (signed ?? [])
              .map((item) => [item.path, item.signedUrl || item.signedURL])
              .filter((item) => item[0] && item[1]),
          )
        }
        setLoadError('')
        setRows(
          list.map((row) => {
            const assets = [...(row.generation_assets ?? [])].sort(
              (a, b) => a.sort_order - b.sort_order,
            )
            const hidePaidPreview = row.status === 'failed'
            return {
              ...row,
              previewUrl:
                hidePaidPreview || !assets[0]
                  ? null
                  : signedByPath[assets[0].storage_path] ?? null,
              assetCount: hidePaidPreview ? 0 : assets.length,
              hiddenAssetCount: hidePaidPreview ? assets.length : 0,
            }
          }),
        )
      })

    return () => {
      cancelled = true
    }
  }, [catalogEpoch, ready, session])

  const lastLabel = rows[0]?.created_at
    ? new Date(rows[0].created_at).toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

  return (
    <div className="results-page">
      <div className="results">
        <div className="results-copy">
          <h1 className="results-title">Ваши результаты</h1>
          <p className="results-lead">
            Сохранённые генерации, быстрый повторный доступ и управление созданными
            карточками.
          </p>
        </div>
        <div className="results-stats">
          {generateAction}
          <div className="stat-box">
            <p className="stat-label">Всего</p>
            <p className="stat-value">{ready && session ? `${rows.length} генерации` : '—'}</p>
          </div>
          <div className="stat-box">
            <p className="stat-label">Последняя</p>
            <p className="stat-value">{ready && session ? lastLabel : '—'}</p>
          </div>
        </div>
      </div>

      {!ready ? <p className="muted">Загрузка…</p> : null}
      {ready && !session ? (
        <p className="empty">
          Войдите, чтобы видеть сохранённые генерации.{' '}
          <Link to="/auth">Авторизация</Link>
        </p>
      ) : null}
      {loadError ? <p className="modal-status is-failed">{loadError}</p> : null}
      {ready && session && rows.length === 0 && !loadError ? (
        <p className="empty">Пока нет генераций. Запустите первую через кнопку «Генерация».</p>
      ) : null}

      {rows.length > 0 ? (
        <div className="generation-list">
          {rows.map((row) => (
            <article key={row.id} className="generation-card">
              {row.previewUrl ? (
                <img src={row.previewUrl} alt="" className="generation-thumb" />
              ) : (
                <div className="generation-thumb is-empty">Нет превью</div>
              )}
              <div>
                <p className={`generation-status is-${row.status}`}>{statusLabel(row.status)}</p>
                <p className="generation-meta">
                  {row.generation_type === 'card' ? 'Карточка' : 'Фото'} · {row.assetCount}/
                  {row.object_count} · {row.cost_points} баллов
                </p>
                {row.status === 'failed' && row.hiddenAssetCount > 0 ? (
                  <p className="muted">Превью скрыто: генерация не завершена.</p>
                ) : null}
                {row.status === 'failed' && row.error_message ? (
                  <p className="muted">{row.error_message}</p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function statusLabel(status) {
  if (status === 'queued') return 'В очереди'
  if (status === 'running') return 'В работе'
  if (status === 'succeeded') return 'Готово'
  if (status === 'failed') return 'Ошибка'
  return status
}
