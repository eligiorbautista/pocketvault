import { Suspense, lazy, useEffect } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { useAuthStore } from '@renderer/store/authStore.js'
import { useSettingsStore } from '@renderer/store/settingsStore.js'
import { useTheme } from '@renderer/hooks/useTheme.js'
import { syncDebtReminders } from '@renderer/lib/notifications.js'
import { ProtectedRoute, PublicOnlyRoute } from '@renderer/components/ProtectedRoute.jsx'
import { ErrorBoundary } from '@renderer/components/ErrorBoundary.jsx'
import { AppShell } from '@renderer/components/layout/AppShell.jsx'
import { SplashScreen } from '@renderer/components/layout/SplashScreen.jsx'
import Login from '@renderer/pages/Login.jsx'
import LockScreen from '@renderer/pages/LockScreen.jsx'
import Register from '@renderer/pages/Register.jsx'
import Dashboard from '@renderer/pages/Dashboard.jsx'
import Wallet from '@renderer/pages/Wallet.jsx'
import Income from '@renderer/pages/Income.jsx'
import Expenses from '@renderer/pages/Expenses.jsx'
import Debts from '@renderer/pages/BillsDebts.jsx'
import Budgets from '@renderer/pages/Budgets.jsx'
import Savings from '@renderer/pages/Savings.jsx'
import ImportCsv from '@renderer/pages/ImportCsv.jsx'
import Archive from '@renderer/pages/Archive.jsx'
import More from '@renderer/pages/More.jsx'
import { LoadingBlock } from '@renderer/components/ui/Spinner.jsx'

// Reports pulls in Recharts + jsPDF, so load it on demand.
const Reports = lazy(() => import('@renderer/pages/Reports.jsx'))
import Settings from '@renderer/pages/Settings.jsx'
import NotFound from '@renderer/pages/NotFound.jsx'

const SHORTCUT_KEY = 'pocketvault.shortcut'

// Native Android shortcuts can arrive while the app is locked. Keep the route
// in localStorage until auth is ready, then navigate once; this survives the
// WebView reload that the device credential prompt can cause.
function ShortcutBridge() {
  const navigate = useNavigate()
  const authenticated = useAuthStore((state) => state.status === 'authenticated')

  useEffect(() => {
    const apply = (route) => {
      if (typeof route !== 'string' || !route.startsWith('/')) return
      localStorage.removeItem(SHORTCUT_KEY)
      navigate(route, { replace: true })
    }
    if (authenticated) apply(localStorage.getItem(SHORTCUT_KEY))
    const onShortcut = (event) => {
      if (typeof event.detail !== 'string') return
      localStorage.setItem(SHORTCUT_KEY, event.detail)
      if (authenticated) apply(event.detail)
    }
    window.addEventListener('pocketvault:shortcut', onShortcut)
    return () => window.removeEventListener('pocketvault:shortcut', onShortcut)
  }, [authenticated, navigate])

  return null
}

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
          return
        }
        // (Re)register debt payment reminders for this account.
        syncDebtReminders()
      })
      .catch((error) => {
        console.error('Failed to load settings', error)
      })
    return () => {
      active = false
    }
  }, [status])

  return (
    <>
      <ShortcutBridge />
      {status === 'loading' ? (
        <SplashScreen />
      ) : status === 'locked' ? (
        <LockScreen />
      ) : (
        <Routes>
          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route index element={<Dashboard />} />
              <Route path="/wallet" element={<Wallet />} />
              <Route path="/income" element={<Income />} />
              <Route path="/expenses" element={<Expenses />} />
              <Route path="/debts" element={<Debts />} />
              <Route path="/budgets" element={<Budgets />} />
              <Route path="/savings" element={<Savings />} />
              <Route path="/import" element={<ImportCsv />} />              <Route
                path="/reports"
                element={
                  <ErrorBoundary message="The reports screen failed to load.">
                    <Suspense fallback={<LoadingBlock />}>
                      <Reports />
                    </Suspense>
                  </ErrorBoundary>
                }
              />
              <Route path="/archive" element={<Archive />} />
              <Route path="/more" element={<More />} />
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
