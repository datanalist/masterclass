import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import GenerateModal from './GenerateModal'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = menuOpen || generateOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = previous
    }
  }, [menuOpen, generateOpen])

  const closeMenu = () => setMenuOpen(false)

  const generateAction = (
    <button
      type="button"
      className="shell-generate"
      onClick={() => setGenerateOpen(true)}
    >
      Генерация
    </button>
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
      <GenerateModal open={generateOpen} onClose={() => setGenerateOpen(false)} />
    </div>
  )
}
