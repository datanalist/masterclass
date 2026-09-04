import { NavLink } from 'react-router-dom'

const GROUPS = [
  {
    label: 'Обзор',
    items: [{ to: '/', label: 'Главная', end: true, icon: 'home' }],
  },
  {
    label: 'Генерации',
    items: [
      { to: '/catalog', label: 'Каталог', icon: 'grid' },
      { to: '/add', label: 'Добавить товар', icon: 'plus' },
    ],
  },
]

function NavIcon({ name }) {
  if (name === 'home') {
    return (
      <svg className="nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
      </svg>
    )
  }
  if (name === 'grid') {
    return (
      <svg className="nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    )
  }
  return (
    <svg className="nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  )
}

export default function Sidebar({ open, onNavigate }) {
  return (
    <aside id="app-sidebar" className={open ? 'app-sidebar is-open' : 'app-sidebar'}>
      {GROUPS.map((group) => (
        <div key={group.label} className="sidebar-group">
          <p className="sidebar-label">{group.label}</p>
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end === true}
              className="sidebar-link"
              onClick={onNavigate}
            >
              <NavIcon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </div>
      ))}
    </aside>
  )
}
