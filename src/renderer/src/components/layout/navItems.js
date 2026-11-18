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

export const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/wallet', label: 'Wallet', icon: WalletCards }
    ]
  },
  {
    label: 'Money',
    items: [
      { to: '/income', label: 'Income', icon: TrendingUp },
      { to: '/expenses', label: 'Expenses', icon: TrendingDown },
      { to: '/debts', label: 'Bills & Debts', icon: HandCoins },
      { to: '/budgets', label: 'Budgets', icon: PiggyBank },
      { to: '/savings', label: 'Savings & Buckets', icon: Target }
    ]
  },
  {
    label: 'Review',
    items: [
      { to: '/reports', label: 'Reports', icon: BarChart3 },
      { to: '/archive', label: 'Archive', icon: Archive }
    ]
  },
  {
    label: 'System',
    bottom: true,
    items: [{ to: '/settings', label: 'Settings', icon: Settings }]
  }
]

export const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items)
