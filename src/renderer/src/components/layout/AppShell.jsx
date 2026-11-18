import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar.jsx'
import { Topbar } from './Topbar.jsx'
import { BottomNav } from './BottomNav.jsx'
import { cn } from '@renderer/lib/cn.js'

const SIDEBAR_KEY = 'pocketvault.sidebarCollapsed'

export function AppShell() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_KEY) === '1'
  )

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'b') return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return
      }
      event.preventDefault()
      setCollapsed((current) => !current)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="min-h-dvh bg-[#f2f2f7] dark:bg-black">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((current) => !current)} />
      <div
        className={cn(
          'transition-[padding] duration-200',
          collapsed ? 'lg:pl-[76px]' : 'lg:pl-64'
        )}
      >
        <Topbar />
        <main className="mx-auto w-full max-w-[90rem] px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:pt-8 lg:pb-[calc(2rem+env(safe-area-inset-bottom))]">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
