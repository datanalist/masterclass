import { Link } from 'react-router-dom'
import PageLayout from '../components/PageLayout'

export default function AuthPage() {
  return (
    <PageLayout title="Авторизация">
      <p className="muted">
        Вход, регистрация и восстановление доступа пока только как макет формы.
      </p>
      <form className="form-grid" onSubmit={(event) => event.preventDefault()}>
        <label>
          Email
          <input type="email" placeholder="you@email.com" autoComplete="email" />
        </label>
        <label>
          Пароль
          <input type="password" placeholder="Пароль" autoComplete="current-password" />
        </label>
        <label>
          Подтверждение пароля
          <input type="password" placeholder="Повторите пароль" autoComplete="new-password" />
        </label>
        <div className="actions">
          <button type="button" className="btn">
            Войти
          </button>
          <button type="button" className="btn btn-ghost">
            Зарегистрироваться
          </button>
        </div>
        <Link className="muted" to="/auth">
          Забыли пароль?
        </Link>
      </form>
    </PageLayout>
  )
}
