import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import AuthModal from './AuthModal'
import GenerateModal from './GenerateModal'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [catalogEpoch, setCatalogEpoch] = useState(0)
  const location = useLocation()
  const navigate = useNavigate()

  const openAuth = () => setAuthOpen(true)

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (location.pathname !== '/auth' && !location.state?.openAuth) return
    setAuthOpen(true)
    navigate('/', { replace: true, state: {} })
  }, [location.pathname, location.state, navigate])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = menuOpen || generateOpen || authOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = previous
    }
  }, [menuOpen, generateOpen, authOpen])

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
        onOpenAuth={openAuth}
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
          <Outlet context={{ generateAction, catalogEpoch, openAuth }} />
        </section>
      </div>
      <GenerateModal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onCompleted={() => setCatalogEpoch((value) => value + 1)}
        onOpenAuth={openAuth}
      />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  )
}
