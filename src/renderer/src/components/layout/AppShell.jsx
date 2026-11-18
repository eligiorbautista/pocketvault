import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar.jsx'
import { Topbar } from './Topbar.jsx'
import { BottomNav } from './BottomNav.jsx'

export function AppShell() {
  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-dark-bg">
      <Sidebar />
      <div className="lg:pl-64">
        <Topbar />
        <main className="mx-auto w-full max-w-[90rem] px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:pt-8 lg:pb-[calc(2rem+env(safe-area-inset-bottom))]">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
