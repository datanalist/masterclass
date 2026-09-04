import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function Topbar({ menuOpen, onMenuToggle }) {
  const { session, profile, ready } = useAuth()
  const balance = profile?.points_balance ?? 0

  return (
    <header className="app-topbar">
      <div className="app-topbar-left">
        <button
          type="button"
          className="menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="app-sidebar"
          onClick={onMenuToggle}
        >
          Меню
        </button>
        <NavLink to="/" end className="brand">
          <span className="brand-mark">MK</span>
          <span className="brand-copy">
            <span className="brand-name">MK</span>
            <span className="brand-sub">React · Supabase · Vercel</span>
          </span>
        </NavLink>
      </div>
      <div className="app-topbar-right">
        {ready && session ? (
          <>
            <Link to="/profile" className="balance-chip">
              {balance} баллов
            </Link>
            <Link to="/profile" className="top-btn top-btn-dark">
              Профиль
            </Link>
          </>
        ) : (
          <Link to="/auth" className="top-btn top-btn-dark">
            Войти
          </Link>
        )}
      </div>
    </header>
  )
}
