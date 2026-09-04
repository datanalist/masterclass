import { useOutletContext } from 'react-router-dom'

export default function CatalogPage() {
  const { generateAction } = useOutletContext()

  return (
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
          <p className="stat-value">24 генерации</p>
        </div>
        <div className="stat-box">
          <p className="stat-label">Последняя</p>
          <p className="stat-value">Сегодня в 14:20</p>
        </div>
      </div>
    </div>
  )
}
