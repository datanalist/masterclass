import { Link } from 'react-router-dom'
import PageLayout from '../components/PageLayout'
import { sessionStub } from '../data/sessionStub'

const PACKAGES = [
  { id: 's', title: '100 баллов' },
  { id: 'm', title: '500 баллов' },
  { id: 'l', title: '1000 баллов' },
]

export default function ProfilePage() {
  return (
    <PageLayout title="Профиль">
      <p className="muted">
        Баланс, пакеты пополнения и выход из аккаунта — визуальные заглушки без эквайринга.
      </p>
      <div className="balance">
        <strong>{sessionStub.balance}</strong>
        <span className="muted">баллов</span>
      </div>
      <div className="packages">
        {PACKAGES.map((item) => (
          <button key={item.id} type="button" className="package">
            {item.title}
          </button>
        ))}
      </div>
      <div className="actions">
        <button type="button" className="btn btn-ghost">
          Выйти
        </button>
        <Link className="btn" to="/auth">
          Войти
        </Link>
      </div>
    </PageLayout>
  )
}
