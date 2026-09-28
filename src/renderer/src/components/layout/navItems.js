import {
  BarChart3,
  HandCoins,
  LayoutDashboard,
  Settings,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet
} from 'lucide-react'

export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/income', label: 'Income', icon: TrendingUp },
  { to: '/expenses', label: 'Expenses', icon: TrendingDown },
  { to: '/debts', label: 'Debts', icon: HandCoins },
  { to: '/budgets', label: 'Budgets', icon: Wallet },
  { to: '/savings', label: 'Savings', icon: Target },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings }
]
