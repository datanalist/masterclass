import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
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

  return (
    <div className="app-shell">
      {menuOpen ? (
        <button
          type="button"
          className="app-backdrop"
          aria-label="Закрыть меню"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}
      <Sidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} />
      <div className="app-main">
        <Topbar
          menuOpen={menuOpen}
          onMenuToggle={() => setMenuOpen((open) => !open)}
        />
        <section className="card page-card app-content">
          <Outlet />
        </section>
      </div>
    </div>
  )
}
