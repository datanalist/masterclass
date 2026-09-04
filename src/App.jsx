import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import { AuthProvider } from './lib/auth'
import CatalogPage from './pages/CatalogPage'
import ProfilePage from './pages/ProfilePage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<CatalogPage />} />
            <Route path="/catalog" element={<Navigate to="/" replace />} />
            <Route path="/add" element={<Navigate to="/" replace />} />
            <Route path="/auth" element={<Navigate to="/" replace state={{ openAuth: true }} />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
