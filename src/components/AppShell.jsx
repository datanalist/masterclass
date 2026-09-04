import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = previous
    }
  }, [menuOpen])

  const closeMenu = () => setMenuOpen(false)

  const generateAction = (
    <NavLink to="/add" className="shell-generate">
      Генерация
    </NavLink>
  )

  return (
    <div className="app-shell">
      <Topbar
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen((open) => !open)}
      />
      <div className="app-body">
        {menuOpen ? (
          <button
            type="button"
            className="app-backdrop"
            aria-label="Закрыть меню"
            onClick={closeMenu}
          />
        ) : null}
        <div id="app-sidebar" className={menuOpen ? 'app-nav is-open' : 'app-nav'}>
          <Sidebar onNavigate={closeMenu} />
        </div>
        <section className="card page-card app-content">
          <Outlet context={{ generateAction }} />
        </section>
      </div>
    </div>
  )
}
