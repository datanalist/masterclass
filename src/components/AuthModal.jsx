import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

function mapAuthError(message, fallback) {
  const text = String(message || '').toLowerCase()
  if (text.includes('invalid login')) {
    return 'Неверный email или пароль. Если аккаунта ещё нет, создайте его.'
  }
  if (text.includes('already_registered') || text.includes('already registered')) {
    return 'Этот email уже зарегистрирован. Войдите в аккаунт.'
  }
  if (text.includes('invalid_email') || text.includes('unable to validate email')) {
    return 'Проверьте формат email'
  }
  if (text.includes('weak_password') || text.includes('password should be at least')) {
    return 'Пароль должен быть не короче 6 символов'
  }
  if (text.includes('rate limit') || text.includes('too many')) {
    return 'Слишком много попыток. Подождите минуту и попробуйте снова.'
  }
  return message || fallback
}

export default function AuthModal({ open, onClose }) {
  const { session, signIn, signUp } = useAuth()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const isSignup = mode === 'signup'

  const resetForm = () => {
    setEmail('')
    setPassword('')
    setConfirm('')
    setError('')
    setBusy(false)
    setMode('signin')
  }

  const closeQuietly = () => {
    resetForm()
    onClose()
  }

  useEffect(() => {
    if (!open) return undefined

    const onKey = (event) => {
      if (event.key === 'Escape' && !busy) closeQuietly()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  useEffect(() => {
    if (open && session) closeQuietly()
  }, [open, session])

  const switchMode = (next) => {
    setMode(next)
    setError('')
    setConfirm('')
  }

  const run = async (action, fallback) => {
    setBusy(true)
    setError('')
    try {
      await action()
      resetForm()
      onClose()
    } catch (err) {
      setError(mapAuthError(err?.message, fallback))
    } finally {
      setBusy(false)
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (isSignup) {
      if (password !== confirm) {
        setError('Пароли не совпадают')
        return
      }
      run(() => signUp(email.trim(), password), 'Не удалось зарегистрироваться')
      return
    }
    run(() => signIn(email.trim(), password), 'Не удалось выполнить вход')
  }

  if (!open) return null

  return (
    <div className="modal-backdrop modal-backdrop-auth" onClick={() => !busy && closeQuietly()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <span className="badge">{isSignup ? 'Регистрация' : 'Вход'}</span>
            <h2 id="auth-title" className="modal-title">
              {isSignup ? 'Создать аккаунт' : 'Войти в аккаунт'}
            </h2>
          </div>
          <button
            type="button"
            className="modal-close"
            aria-label="Закрыть"
            disabled={busy}
            onClick={closeQuietly}
          >
            ×
          </button>
        </header>

        {!supabase ? (
          <p className="muted">
            Supabase не настроен. Заполните VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY.
          </p>
        ) : (
          <form className="modal-form" onSubmit={handleSubmit}>
            <p className="muted">
              {isSignup
                ? 'Укажите почту и пароль. Подтверждение письмом не нужно — баллы начислятся сразу.'
                : 'Введите почту и пароль. Если аккаунта ещё нет, создайте его.'}
            </p>

            <label>
              Email
              <input
                type="email"
                placeholder="you@email.com"
                autoComplete="email"
                value={email}
                disabled={busy}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label>
              Пароль
              <input
                type="password"
                placeholder="Пароль"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                value={password}
                disabled={busy}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
              />
            </label>
            {isSignup ? (
              <label>
                Подтверждение пароля
                <input
                  type="password"
                  placeholder="Повторите пароль"
                  autoComplete="new-password"
                  value={confirm}
                  disabled={busy}
                  onChange={(event) => setConfirm(event.target.value)}
                  required
                  minLength={6}
                />
              </label>
            ) : null}

            {error ? <p className="modal-status is-failed">{error}</p> : null}

            <div className="modal-actions">
              <button type="button" className="btn-cancel" disabled={busy} onClick={closeQuietly}>
                Отмена
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? 'Отправляем…' : isSignup ? 'Создать аккаунт' : 'Войти'}
              </button>
            </div>

            <p className="auth-switch">
              {isSignup ? (
                <>
                  Уже есть аккаунт?{' '}
                  <button type="button" disabled={busy} onClick={() => switchMode('signin')}>
                    Войти
                  </button>
                </>
              ) : (
                <>
                  Нет аккаунта?{' '}
                  <button type="button" disabled={busy} onClick={() => switchMode('signup')}>
                    Создать
                  </button>
                </>
              )}
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
