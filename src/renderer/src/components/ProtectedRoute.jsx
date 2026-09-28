import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@renderer/store/authStore.js'

export function ProtectedRoute() {
  const status = useAuthStore((state) => state.status)
  if (status !== 'authenticated') return <Navigate to="/login" replace />
  return <Outlet />
}

export function PublicOnlyRoute() {
  const status = useAuthStore((state) => state.status)
  if (status === 'authenticated') return <Navigate to="/" replace />
  return <Outlet />
}
