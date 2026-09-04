# App Shell Sidebar and Topbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the horizontal page header with a persistent app chrome: soft-card sidebar plus a top bar with logo, balance, and profile on every route.

**Architecture:** A React Router layout route renders `AppShell` around all pages. `AppShell` owns mobile menu state and an `Outlet`. `Sidebar` and `Topbar` are presentational. Guest vs signed-in chrome reads `src/data/sessionStub.js` (same object as the profile page). No new libraries.

**Tech Stack:** React 19, React Router 7, existing `src/index.css` tokens, Vite.

## Global Constraints

- No new npm dependencies.
- No automated tests and no new test runner (spec: ручной проход only).
- Visual language is option A: `--page-bg` canvas, white rounded panels, active nav as `--chip-bg` / `--chip-text`.
- Shell is full viewport, not `max-width: 1180px` for the chrome.
- Desktop sidebar width is `240px`; hamburger overlay applies below `960px` (`max-width: 959px`).
- Logo lives only in the top bar.
- Sidebar groups: Обзор → Главная `/`; Генерации → Каталог `/catalog`, Добавить товар `/add`. No profile, auth, or extra items.
- Balance chip text is `N баллов` on one line (`white-space: nowrap`). Avatar is a 28px circle, `flex-shrink: 0`, `aspect-ratio: 1`.
- Default stub: `isAuthed: true`, `balance: 0`, `initial: "А"`.
- Guest and signed-in top-bar states are mutually exclusive.
- Do not change page business logic (catalog/add/auth/profile stubs stay stubs).

## File structure

| File | Responsibility |
|------|----------------|
| `src/data/sessionStub.js` | Shared mock session: `isAuthed`, `balance`, `initial` |
| `src/components/Sidebar.jsx` | Grouped `NavLink` list and mobile open class |
| `src/components/Topbar.jsx` | Logo, menu button, guest or balance+avatar |
| `src/components/AppShell.jsx` | Grid, overlay, scroll lock, `Outlet` |
| `src/components/PageLayout.jsx` | Title + children only (no header) |
| `src/App.jsx` | Layout route wrapping all pages |
| `src/pages/HomePage.jsx` | Home sections without outer `.shell` |
| `src/pages/ProfilePage.jsx` | Reads `sessionStub.balance` |
| `src/index.css` | Shell, sidebar, topbar, overlay styles |

---

### Task 1: Shared session stub

**Files:**
- Create: `src/data/sessionStub.js`
- Modify: `src/pages/ProfilePage.jsx`

**Interfaces:**
- Consumes: nothing
- Produces: `export const sessionStub = { isAuthed: true, balance: 0, initial: "А" }`

- [ ] **Step 1: Create the stub module**

Create `src/data/sessionStub.js` with this exact content:

```javascript
export const sessionStub = {
  isAuthed: true,
  balance: 0,
  initial: 'А',
}
```

- [ ] **Step 2: Point the profile balance at the stub**

In `src/pages/ProfilePage.jsx` add the import and replace the hardcoded `0`:

```javascript
import { Link } from 'react-router-dom'
import PageLayout from '../components/PageLayout'
import { sessionStub } from '../data/sessionStub'

const PACKAGES = [
  { id: 's', title: '100 баллов' },
  { id: 'm', title: '500 баллов' },
  { id: 'l', title: '1000 баллов' },
]

export default function ProfilePage() {
  return (
    <PageLayout title="Профиль">
      <p className="muted">
        Баланс, пакеты пополнения и выход из аккаунта — визуальные заглушки без эквайринга.
      </p>
      <div className="balance">
        <strong>{sessionStub.balance}</strong>
        <span className="muted">баллов</span>
      </div>
      <div className="packages">
        {PACKAGES.map((item) => (
          <button key={item.id} type="button" className="package">
            {item.title}
          </button>
        ))}
      </div>
      <div className="actions">
        <button type="button" className="btn btn-ghost">
          Выйти
        </button>
        <Link className="btn" to="/auth">
          Войти
        </Link>
      </div>
    </PageLayout>
  )
}
```

Leave the Войти / Выйти buttons as they are. Wiring real logout is out of scope.

- [ ] **Step 3: Lint the touched files**

Run: `npm run lint`

Expected: exit code 0, no errors in `sessionStub.js` or `ProfilePage.jsx`.

- [ ] **Step 4: Commit**

```bash
git add src/data/sessionStub.js src/pages/ProfilePage.jsx
git commit -m "Share a session stub so profile balance has one source of truth."
```

---

### Task 2: Sidebar and Topbar

**Files:**
- Create: `src/components/Sidebar.jsx`
- Create: `src/components/Topbar.jsx`

**Interfaces:**
- Consumes: `sessionStub` from Task 1 (`isAuthed`, `balance`, `initial`)
- Produces:
  - `Sidebar({ open, onNavigate })` — `open` is boolean; `onNavigate` is `() => void`
  - `Topbar({ menuOpen, onMenuToggle })` — `menuOpen` is boolean; `onMenuToggle` is `() => void`

- [ ] **Step 1: Create Sidebar**

Create `src/components/Sidebar.jsx` with this exact content:

```javascript
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
```

Home uses `end` so `/catalog` does not mark Главная active. `/profile` and `/auth` have no items, so nothing is active there.

- [ ] **Step 2: Create Topbar**

Create `src/components/Topbar.jsx` with this exact content. Use class `balance-chip`, not `chip` — `.chip` is already the homepage category pill.

```javascript
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
```

- [ ] **Step 3: Lint the new components**

Run: `npm run lint`

Expected: exit code 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/Sidebar.jsx src/components/Topbar.jsx
git commit -m "Add sidebar and topbar components for the app chrome."
```

---

### Task 3: AppShell, styles, and routing

**Files:**
- Create: `src/components/AppShell.jsx`
- Modify: `src/App.jsx`
- Modify: `src/components/PageLayout.jsx`
- Modify: `src/pages/HomePage.jsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `Sidebar({ open, onNavigate })`, `Topbar({ menuOpen, onMenuToggle })`
- Produces: `AppShell` as a layout route element with `<Outlet />`

- [ ] **Step 1: Create AppShell**

Create `src/components/AppShell.jsx` with this exact content:

```javascript
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
```

Route changes always close the menu. Body scroll is locked only while `menuOpen` is true.

- [ ] **Step 2: Wrap all routes in AppShell**

Replace `src/App.jsx` with this exact content. The `*` redirect stays a child of the layout so unknown URLs still sit inside the shell.

```javascript
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import AddProductPage from './pages/AddProductPage'
import AuthPage from './pages/AuthPage'
import CatalogPage from './pages/CatalogPage'
import HomePage from './pages/HomePage'
import ProfilePage from './pages/ProfilePage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/add" element={<AddProductPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 3: Strip PageLayout down to title + children**

Replace `src/components/PageLayout.jsx` with this exact content. The content card now comes from `AppShell`, so this file must not render `.shell` or `.topbar`.

```javascript
export default function PageLayout({ title, children }) {
  return (
    <>
      {title ? <h1 className="page-title">{title}</h1> : null}
      {children}
    </>
  )
}
```

- [ ] **Step 4: Remove the home page outer shell**

In `src/pages/HomePage.jsx` change only the outer wrapper. Keep hero, features, and catalog sections as they are.

Replace:

```javascript
    <div className="shell stack">
```

with:

```javascript
    <div className="stack">
```

Do not wrap HomePage in `PageLayout`. It has no page title; it renders directly in the `Outlet`.

- [ ] **Step 5: Add shell CSS**

Append this block at the **end** of `src/index.css` (after the existing `@media (max-width: 640px)` block). Do not restyle `.chip` — homepage categories keep that class.

```css
.app-shell {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 12px;
  min-height: 100svh;
  padding: 12px;
}

.app-main {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.app-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 16px;
  background: var(--card-bg);
  border-radius: 18px;
  box-shadow: var(--shadow);
}

.app-topbar-left,
.app-topbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.logo {
  flex-shrink: 0;
}

.menu-toggle {
  display: none;
  padding: 8px 12px;
  border: 0;
  border-radius: 12px;
  background: var(--gray-pill);
  color: var(--text);
  font-weight: 600;
}

.balance-chip {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  white-space: nowrap;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--chip-bg);
  color: var(--chip-text);
  font-size: 13px;
  font-weight: 600;
}

.avatar {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  min-width: 28px;
  min-height: 28px;
  flex-shrink: 0;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border-radius: 50%;
  background: var(--navy);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.app-sidebar {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 12px;
  background: var(--card-bg);
  border-radius: 18px;
  box-shadow: var(--shadow);
}

.sidebar-label {
  margin: 0;
  padding: 8px 10px 6px;
  color: #98a2b3;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sidebar-group + .sidebar-group {
  margin-top: 8px;
}

.sidebar-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 999px;
  color: var(--muted);
  font-size: 14px;
  font-weight: 500;
}

.sidebar-link:hover,
.sidebar-link.active {
  background: var(--chip-bg);
  color: var(--chip-text);
}

.nav-ico {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.app-content {
  flex: 1;
  min-height: 0;
}

.app-backdrop {
  display: none;
}

@media (max-width: 959px) {
  .app-shell {
    grid-template-columns: minmax(0, 1fr);
  }

  .menu-toggle {
    display: inline-flex;
  }

  .app-sidebar {
    position: fixed;
    z-index: 21;
    top: 12px;
    left: 12px;
    bottom: 12px;
    width: 240px;
    transform: translateX(calc(-100% - 24px));
    transition: transform 0.2s ease;
  }

  .app-sidebar.is-open {
    transform: none;
  }

  .app-backdrop {
    display: block;
    position: fixed;
    z-index: 20;
    inset: 0;
    border: 0;
    background: rgb(16 24 40 / 32%);
  }
}
```

The existing `.logo` rule stays; this block only adds `flex-shrink: 0`. The old `.topbar` / `.nav` rules can remain unused.

- [ ] **Step 6: Lint and build**

Run: `npm run lint`

Expected: exit code 0.

Run: `npm run build`

Expected: Vite build succeeds (`exit code 0`).

- [ ] **Step 7: Commit**

```bash
git add src/components/AppShell.jsx src/App.jsx src/components/PageLayout.jsx src/pages/HomePage.jsx src/index.css
git commit -m "Put every route inside a soft-card sidebar and topbar shell."
```

---

### Task 4: Manual verification

**Files:**
- None unless a check fails (then fix in the failing file and amend only if the commit has not been pushed and the hook did not reject it — otherwise a new commit)

**Interfaces:**
- Consumes: the mounted shell from Tasks 1–3
- Produces: confirmation that the spec checklist passes

- [ ] **Step 1: Start the app**

Run: `npm run dev`

Expected: Vite prints a local URL (default `http://localhost:5173/`).

- [ ] **Step 2: Desktop signed-in chrome**

At viewport ≥ 960px open `/`, `/catalog`, `/add`, `/auth`, `/profile`.

Expected:

- Same sidebar + topbar on every route
- Topbar right: chip `0 баллов` (one line) and round avatar `А`
- Both chip and avatar go to `/profile`
- Profile page strong number is also `0`
- No «Войти» in the topbar while `isAuthed` is true
- Logo is in the topbar only
- Sidebar has no Профиль and no Войти

- [ ] **Step 3: Active states**

Expected:

- `/` → Главная active
- `/catalog` → Каталог active, Главная not active
- `/add` → Добавить товар active
- `/profile` and `/auth` → no sidebar item active

- [ ] **Step 4: Guest branch**

Temporarily set `isAuthed: false` in `src/data/sessionStub.js`, save, reload.

Expected: topbar right shows only «Войти» linking to `/auth`; chip and avatar are gone.

Set `isAuthed` back to `true` before finishing. Do not commit `false`.

- [ ] **Step 5: Mobile overlay**

At viewport &lt; 960px:

- Sidebar is hidden until «Меню»
- Opens from the left over a dim backdrop
- Backdrop click closes it
- Choosing Каталог closes it and lands on `/catalog`
- After close it stays closed on the next page
- Body does not scroll under the open overlay
- Chip stays one line; avatar stays a circle

- [ ] **Step 6: Unknown URL**

Open `/this-does-not-exist`.

Expected: redirect to `/` with the shell visible (sidebar + topbar + home content).

If anything fails, fix the responsible file, re-run `npm run lint` and `npm run build`, commit the fix, and repeat the failing check.
