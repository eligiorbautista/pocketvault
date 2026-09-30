import { Suspense, lazy, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { useAuthStore } from '@renderer/store/authStore.js'
import { useSettingsStore } from '@renderer/store/settingsStore.js'
import { useTheme } from '@renderer/hooks/useTheme.js'
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
import Archive from '@renderer/pages/Archive.jsx'
import { LoadingBlock } from '@renderer/components/ui/Spinner.jsx'

// Reports pulls in Recharts + jsPDF, so load it on demand.
const Reports = lazy(() => import('@renderer/pages/Reports.jsx'))
import Settings from '@renderer/pages/Settings.jsx'
import NotFound from '@renderer/pages/NotFound.jsx'

export default function App() {
  const status = useAuthStore((state) => state.status)
  const bootstrap = useAuthStore((state) => state.bootstrap)
  // Subscribe so the whole tree re-renders when the currency changes.
  useSettingsStore((state) => state.currency)
  // Keep the `dark` class on <html> in sync with the theme preference + OS.
  const { resolved: theme } = useTheme()

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  useEffect(() => {
    if (status !== 'authenticated') {
      useSettingsStore.getState().reset()
      return undefined
    }
    let active = true
    useSettingsStore
      .getState()
      .load()
      .then((settings) => {
        if (!active) return
        if (settings.requirePasswordOnStart && useAuthStore.getState().viaRestore) {
          useAuthStore.getState().logout()
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [status])

  return (
    <>
      {status === 'loading' ? (
        <SplashScreen />
      ) : (
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
              <Route
                path="/reports"
                element={
                  <Suspense fallback={<LoadingBlock />}>
                    <Reports />
                  </Suspense>
                }
              />
              <Route path="/archive" element={<Archive />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/login" element={<Navigate to="/" replace />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      )}
      <Toaster richColors position="bottom-right" closeButton theme={theme} />
    </>
  )
}
