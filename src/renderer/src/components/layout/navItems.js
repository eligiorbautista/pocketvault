import {
  Archive,
  BarChart3,
  HandCoins,
  LayoutDashboard,
  PiggyBank,
  Settings,
  Target,
  TrendingDown,
  TrendingUp,
  WalletCards
} from 'lucide-react'

export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/wallet', label: 'Wallet', icon: WalletCards },
  { to: '/income', label: 'Income', icon: TrendingUp },
  { to: '/expenses', label: 'Expenses', icon: TrendingDown },
  { to: '/debts', label: 'Debts', icon: HandCoins },
  { to: '/budgets', label: 'Budgets', icon: PiggyBank },
  { to: '/savings', label: 'Savings', icon: Target },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/archive', label: 'Archive', icon: Archive },
  { to: '/settings', label: 'Settings', icon: Settings }
]
