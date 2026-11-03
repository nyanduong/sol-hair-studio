import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import AuthModal from './features/auth/components/AuthModal.jsx'
import { AuthProvider } from './features/auth/context/AuthContext.jsx'
import AppRoutes from './routes/AppRoutes.jsx'
import OwnerRedirect from './features/auth/components/OwnerRedirect.jsx'

function AppContent() {
  return (
    <AuthProvider>
      <OwnerRedirect>
        <AppRoutes />
        <AuthModal />
      </OwnerRedirect>
    </AuthProvider>
  )
}

const router = createBrowserRouter([{ path: '*', element: <AppContent /> }])

export default function App() {
  return <RouterProvider router={router} />
}
