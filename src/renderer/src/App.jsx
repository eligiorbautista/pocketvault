import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuthStore } from '@renderer/store/authStore.js'
import { ProtectedRoute, PublicOnlyRoute } from '@renderer/components/ProtectedRoute.jsx'
import { AppShell } from '@renderer/components/layout/AppShell.jsx'
import { SplashScreen } from '@renderer/components/layout/SplashScreen.jsx'
import Login from '@renderer/pages/Login.jsx'
import Register from '@renderer/pages/Register.jsx'
import Dashboard from '@renderer/pages/Dashboard.jsx'
import Income from '@renderer/pages/Income.jsx'
import Expenses from '@renderer/pages/Expenses.jsx'
import Debts from '@renderer/pages/Debts.jsx'
import Budgets from '@renderer/pages/Budgets.jsx'
import Savings from '@renderer/pages/Savings.jsx'
import Reports from '@renderer/pages/Reports.jsx'
import Settings from '@renderer/pages/Settings.jsx'
import NotFound from '@renderer/pages/NotFound.jsx'

export default function App() {
  const status = useAuthStore((state) => state.status)
  const bootstrap = useAuthStore((state) => state.bootstrap)

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  if (status === 'loading') return <SplashScreen />

  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="/income" element={<Income />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/debts" element={<Debts />} />
          <Route path="/budgets" element={<Budgets />} />
          <Route path="/savings" element={<Savings />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
