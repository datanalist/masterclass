import { NavLink } from 'react-router-dom'

const LINKS = [
  { to: '/catalog', label: 'Каталог' },
  { to: '/add', label: 'Добавить товар' },
  { to: '/profile', label: 'Профиль' },
  { to: '/auth', label: 'Войти' },
]

export default function PageLayout({ title, children }) {
  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" className="logo">
          mapEstate
        </NavLink>
        <nav className="nav" aria-label="Разделы">
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to}>
              {link.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <section className="card page-card">
        {title ? <h1 className="page-title">{title}</h1> : null}
        {children}
      </section>
    </div>
  )
}
