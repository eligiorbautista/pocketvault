import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeftRight,
  BarChart3,
  HandCoins,
  Home,
  MoreHorizontal,
  Plus,
  TrendingDown,
  TrendingUp,
  Wallet,
  WalletCards,
  X
} from 'lucide-react'
import { cn } from '@renderer/lib/cn.js'

const TABS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/wallet', label: 'Wallet', icon: WalletCards },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/more', label: 'More', icon: MoreHorizontal, more: true }
]

const MORE_PATHS = ['/income', '/expenses', '/debts', '/budgets', '/savings', '/archive', '/settings']

const QUICK_ACTIONS = [
  { to: '/income?new=1', label: 'Add income', icon: TrendingUp },
  { to: '/expenses?new=1', label: 'Add expense', icon: TrendingDown },
  { to: '/debts?new=1', label: 'Add debt', icon: HandCoins },
  { to: '/wallet?new=transfer', label: 'Transfer', icon: ArrowLeftRight },
  { to: '/wallet?new=wallet', label: 'Add wallet', icon: Wallet }
]

function tabClass(active) {
  return cn(
    'flex min-h-11 flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
    active ? 'text-accent-700 dark:text-accent-300' : 'text-slate-500 dark:text-dark-faint'
  )
}

export function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const [quickOpen, setQuickOpen] = useState(false)
  const quickButtonRef = useRef(null)
  const sheetRef = useRef(null)
  const isMorePage = MORE_PATHS.some(
    (path) => location.pathname === path || location.pathname.startsWith(`${path}/`)
  )

  useEffect(() => {
    if (!quickOpen) return undefined
    const previouslyFocused = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setQuickOpen(false)
        return
      }
      if (event.key !== 'Tab') return
      const panel = sheetRef.current
      if (!panel) return
      const focusable = panel.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    sheetRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus?.()
    }
  }, [quickOpen])

  const go = (to) => {
    setQuickOpen(false)
    navigate(to)
  }

  return (
    <>
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-dark-border dark:bg-dark-surface/95 lg:hidden"
      >
        <div className="mx-auto flex h-16 max-w-lg items-stretch px-2">
          {TABS.slice(0, 2).map((tab) => {
            const Icon = tab.icon
            const active = tab.end ? location.pathname === tab.to : location.pathname.startsWith(tab.to)
            return (
              <NavLink key={tab.to} to={tab.to} className={tabClass(active)}>
                <Icon size={20} aria-hidden="true" />
                {tab.label}
              </NavLink>
            )
          })}

          <div className="flex w-16 items-center justify-center">
            <button
              ref={quickButtonRef}
              type="button"
              onClick={() => setQuickOpen(true)}
              aria-label="Quick add"
              aria-haspopup="dialog"
              aria-expanded={quickOpen}
              aria-controls="quick-add-sheet"
              className="flex h-12 w-12 -translate-y-2 cursor-pointer items-center justify-center rounded-full bg-accent-600 text-white shadow-lg shadow-accent-900/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 dark:bg-accent-500 dark:text-accent-950 dark:focus-visible:outline-accent-300"
            >
              <Plus size={24} aria-hidden="true" />
            </button>
          </div>

          {TABS.slice(2).map((tab) => {
            const Icon = tab.icon
            const active = tab.more ? isMorePage || location.pathname === tab.to : location.pathname.startsWith(tab.to)
            return (
              <NavLink key={tab.to} to={tab.to} className={tabClass(active)}>
                <Icon size={20} aria-hidden="true" />
                {tab.label}
              </NavLink>
            )
          })}
        </div>
      </nav>

      {quickOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close quick add"
            onClick={() => setQuickOpen(false)}
            className="absolute inset-0 cursor-default bg-slate-900/40 backdrop-blur-sm dark:bg-black/60"
          />
          <div
            ref={sheetRef}
            id="quick-add-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-add-title"
            tabIndex={-1}
            className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-slate-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl outline-none dark:border-dark-border dark:bg-dark-surface"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 id="quick-add-title" className="text-base font-semibold text-slate-900 dark:text-gray-100">Quick add</h2>
              <button
                type="button"
                onClick={() => setQuickOpen(false)}
                aria-label="Close quick add"
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-dark-faint dark:hover:bg-dark-surface-2"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="space-y-1">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon
                return (
                  <button
                    key={action.to}
                    type="button"
                    onClick={() => go(action.to)}
                    className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 dark:text-gray-200 dark:hover:bg-dark-surface-2 dark:focus-visible:outline-accent-400"
                  >
                    <Icon size={18} aria-hidden="true" />
                    {action.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
