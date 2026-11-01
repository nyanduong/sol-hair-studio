import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import AuthModal from './features/auth/components/AuthModal.jsx'
import { AuthProvider } from './features/auth/context/AuthContext.jsx'
import AppRoutes from './routes/AppRoutes.jsx'

function AppContent() {
  return (
    <AuthProvider>
      <AppRoutes />
      <AuthModal />
    </AuthProvider>
  )
}

const router = createBrowserRouter([{ path: '*', element: <AppContent /> }])

export default function App() {
  return <RouterProvider router={router} />
}
