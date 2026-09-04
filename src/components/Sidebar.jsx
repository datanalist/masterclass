import { NavLink } from 'react-router-dom'

const ITEMS = [
  { to: '/', label: 'Мои генерации', end: true },
  { to: '/profile', label: 'Профиль' },
]

export default function Sidebar({ onNavigate }) {
  return (
    <aside className="app-sidebar">
      <p className="sidebar-label">Страницы</p>
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end === true}
          className="sidebar-link"
          onClick={onNavigate}
        >
          {item.label}
        </NavLink>
      ))}
    </aside>
  )
}
