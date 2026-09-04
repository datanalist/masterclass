import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PageLayout from '../components/PageLayout'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

export default function AuthPage() {
  const { session, signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const run = async (action) => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await action()
      navigate('/')
    } catch (err) {
      setError(err?.message || 'Не удалось выполнить вход')
    } finally {
      setBusy(false)
    }
  }

  const handleSignIn = (event) => {
    event.preventDefault()
    run(() => signIn(email.trim(), password))
  }

  const handleSignUp = async () => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (password !== confirm) {
        throw new Error('Пароли не совпадают')
      }
      const data = await signUp(email.trim(), password)
      if (!data?.session) {
        setMessage('Проверьте почту, чтобы подтвердить регистрацию.')
        return
      }
      navigate('/')
    } catch (err) {
      setError(err?.message || 'Не удалось зарегистрироваться')
    } finally {
      setBusy(false)
    }
  }

  if (!supabase) {
    return (
      <PageLayout title="Авторизация">
        <p className="muted">Supabase не настроен. Заполните VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY.</p>
      </PageLayout>
    )
  }

  if (session) {
    return (
      <PageLayout title="Авторизация">
        <p className="muted">Вы уже вошли в аккаунт.</p>
        <div className="actions">
          <Link className="btn" to="/">
            К генерациям
          </Link>
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout title="Авторизация">
      <p className="muted">Войдите или зарегистрируйтесь, чтобы запускать генерации.</p>
      <form className="form-grid" onSubmit={handleSignIn}>
        <label>
          Email
          <input
            type="email"
            placeholder="you@email.com"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Пароль
          <input
            type="password"
            placeholder="Пароль"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={6}
          />
        </label>
        <label>
          Подтверждение пароля
          <input
            type="password"
            placeholder="Повторите пароль"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            minLength={6}
          />
        </label>
        {error ? <p className="modal-status is-failed">{error}</p> : null}
        {message ? <p className="modal-status is-succeeded">{message}</p> : null}
        <div className="actions">
          <button type="submit" className="btn" disabled={busy}>
            Войти
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={handleSignUp}>
            Зарегистрироваться
          </button>
        </div>
      </form>
    </PageLayout>
  )
}
