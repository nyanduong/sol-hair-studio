import { BrowserRouter } from 'react-router-dom'
import AuthModal from './features/auth/components/AuthModal.jsx'
import { AuthProvider } from './features/auth/context/AuthContext.jsx'
import AppRoutes from './routes/AppRoutes.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <AuthModal />
      </AuthProvider>
    </BrowserRouter>
  )
}
