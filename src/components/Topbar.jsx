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
        <NavLink to="/" className="logo">
          mapEstate
        </NavLink>
      </div>
      <div className="app-topbar-right">
        {sessionStub.isAuthed ? (
          <>
            <Link to="/profile" className="balance-chip">
              {sessionStub.balance} баллов
            </Link>
            <Link to="/profile" className="avatar" aria-label="Профиль">
              {sessionStub.initial}
            </Link>
          </>
        ) : (
          <Link to="/auth" className="btn">
            Войти
          </Link>
        )}
      </div>
    </header>
  )
}
