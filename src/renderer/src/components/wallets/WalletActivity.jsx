import { ArrowLeftRight, Banknote, HandCoins, TrendingDown, TrendingUp } from 'lucide-react'
import { api } from '@renderer/lib/api.js'
import { Modal } from '@renderer/components/ui/Modal.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'
import { LoadingBlock } from '@renderer/components/ui/Spinner.jsx'
import { ErrorState } from '@renderer/components/ui/ErrorState.jsx'
import { EmptyState } from '@renderer/components/ui/EmptyState.jsx'
import { categoryLabel, formatCurrency, formatDate } from '@renderer/lib/format.js'
import { useApiData } from '@renderer/hooks/useApiData.js'

const ICONS = {
  income: TrendingUp,
  expense: TrendingDown,
  loan: HandCoins,
  payment: Banknote,
  transfer: ArrowLeftRight
}

export function WalletActivity({ wallet, open, hidden, onClose, onTransfer }) {
  const { data, loading, error, reload } = useApiData(
    () => (open && wallet ? api.wallets.activity(wallet.id) : Promise.resolve([])),
    [open, wallet?.id]
  )

  const rows = data ?? []

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={wallet?.name ?? 'Wallet activity'}
      description={
        wallet
          ? `Balance ${hidden ? '••••' : formatCurrency(wallet.balance)}`
          : 'Every movement in this wallet.'
      }
      footer={
        <div className="flex justify-end">
          <Button
            variant="secondary"
            onClick={() => {
              onClose()
              onTransfer(wallet)
            }}
          >
            <ArrowLeftRight size={16} aria-hidden="true" />
            Transfer
          </Button>
        </div>
      }
    >
      {loading ? <LoadingBlock label="Loading activity..." /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {!loading && !error && rows.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="No movements yet"
          description="Income, expenses, transfers and debt payments will appear here."
        />
      ) : null}
      {rows.length ? (
        <ul className="divide-y divide-slate-100 dark:divide-dark-rule">
          {rows.map((row) => {
            const Icon = ICONS[row.kind] ?? ArrowLeftRight
            const incoming = Number(row.amount) > 0
            const transferNote =
              row.kind === 'transfer' && row.from_name && row.to_name
                ? ` · ${row.from_name} → ${row.to_name}`
                : ''
            return (
              <li key={`${row.kind}-${row.id}`} className="flex items-center gap-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-dark-surface-2 dark:text-dark-faint">
                  <Icon size={16} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-gray-100">
                    {row.kind === 'expense' ? categoryLabel(row.label) : row.label}
                    {transferNote}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-dark-faint">
                    {formatDate(row.date)}
                    {row.notes ? ` · ${row.notes}` : ''}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm font-medium tabular-nums ${
                    incoming
                      ? 'text-accent-700 dark:text-accent-400'
                      : 'text-slate-700 dark:text-gray-200'
                  }`}
                >
                  {hidden
                    ? '••••'
                    : `${incoming ? '+' : '−'}${formatCurrency(Math.abs(Number(row.amount)))}`}
                </span>
              </li>
            )
          })}
        </ul>
      ) : null}
    </Modal>
  )
}
