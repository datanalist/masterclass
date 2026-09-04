import { Link, NavLink } from 'react-router-dom'
import { sessionStub } from '../data/sessionStub'

export default function Topbar({ menuOpen, onMenuToggle }) {
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
        {sessionStub.isAuthed ? (
          <>
            <Link to="/profile" className="balance-chip">
              {sessionStub.balance} баллов
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
