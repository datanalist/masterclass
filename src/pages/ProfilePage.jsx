import { useOutletContext } from 'react-router-dom'
import PageLayout from '../components/PageLayout'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

const PACKAGES = [
  { id: 's', title: '100 баллов' },
  { id: 'm', title: '500 баллов' },
  { id: 'l', title: '1000 баллов' },
]

export default function ProfilePage() {
  const { openAuth } = useOutletContext()
  const { session, profile, signOut } = useAuth()

  return (
    <PageLayout title="Профиль">
      <p className="muted">
        Баланс списывается при запуске генерации. Пополнение пакетами — без эквайринга.
      </p>
      <div className="balance">
        <strong>{profile?.points_balance ?? 0}</strong>
        <span className="muted">баллов</span>
      </div>
      <div className="packages">
        {PACKAGES.map((item) => (
          <button key={item.id} type="button" className="package" disabled>
            {item.title}
          </button>
        ))}
      </div>
      <div className="actions">
        {session ? (
          <button type="button" className="btn btn-ghost" onClick={() => signOut()}>
            Выйти
          </button>
        ) : (
          <button type="button" className="btn" onClick={openAuth}>
            Войти
          </button>
        )}
      </div>
      {!supabase ? <p className="muted">Supabase не настроен.</p> : null}
    </PageLayout>
  )
}
