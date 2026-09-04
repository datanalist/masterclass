import { Link } from 'react-router-dom'
import PageLayout from '../components/PageLayout'

export default function CatalogPage() {
  return (
    <PageLayout title="Каталог генераций">
      <p className="muted">
        Здесь появится список созданных товаров. Сейчас это заглушка без данных и
        повторной генерации.
      </p>
      <div className="empty">Пока нет сохранённых генераций.</div>
      <div className="actions">
        <Link className="btn" to="/add">
          Добавить товар
        </Link>
      </div>
    </PageLayout>
  )
}
