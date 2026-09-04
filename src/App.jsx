import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import AddProductPage from './pages/AddProductPage'
import AuthPage from './pages/AuthPage'
import CatalogPage from './pages/CatalogPage'
import ProfilePage from './pages/ProfilePage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<CatalogPage />} />
          <Route path="/catalog" element={<Navigate to="/" replace />} />
          <Route path="/add" element={<AddProductPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
