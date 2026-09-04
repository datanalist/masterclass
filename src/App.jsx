import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AddProductPage from './pages/AddProductPage'
import AuthPage from './pages/AuthPage'
import CatalogPage from './pages/CatalogPage'
import HomePage from './pages/HomePage'
import ProfilePage from './pages/ProfilePage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/add" element={<AddProductPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
