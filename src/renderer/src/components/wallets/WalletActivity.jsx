import { useEffect, useState } from 'react'
import { ArrowLeftRight, Banknote, HandCoins, TrendingDown, TrendingUp } from 'lucide-react'
import { api } from '@renderer/lib/api.js'
import { Modal } from '@renderer/components/ui/Modal.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'
import { ConfirmDialog } from '@renderer/components/ui/ConfirmDialog.jsx'
import { LoadingBlock } from '@renderer/components/ui/Spinner.jsx'
import { ErrorState } from '@renderer/components/ui/ErrorState.jsx'
import { EmptyState } from '@renderer/components/ui/EmptyState.jsx'
import { categoryLabel, formatCurrency, formatDate } from '@renderer/lib/format.js'
import { useApiData } from '@renderer/hooks/useApiData.js'
import { toast } from '@renderer/store/uiStore.js'

const ICONS = {
  income: TrendingUp,
  expense: TrendingDown,
  loan: HandCoins,
  payment: Banknote,
  transfer: ArrowLeftRight
}

export function WalletActivity({ wallet, open, hidden, onClose, onTransfer, onChanged }) {
  const [limit, setLimit] = useState(100)
  const [pendingTransfer, setPendingTransfer] = useState(null)
  const [archiving, setArchiving] = useState(false)
  const { data, loading, error, reload } = useApiData(
    () => (open && wallet ? api.wallets.activity(wallet.id, limit) : Promise.resolve([])),
    [open, wallet?.id, limit]
  )

  useEffect(() => {
    setLimit(100)
  }, [wallet?.id])

  const rows = data ?? []

  const close = () => {
    setPendingTransfer(null)
    onClose()
  }

  const archiveTransfer = async () => {
    if (!pendingTransfer) return
    setArchiving(true)
    try {
      const removed = await api.wallets.removeTransfer(pendingTransfer.id)
      if (removed === false) throw new Error('Transfer not found')
      toast('Transfer archived', 'success')
      setPendingTransfer(null)
      reload()
      onChanged?.()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setArchiving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={wallet?.name ?? 'Wallet activity'}
      description={
        wallet
          ? `Balance ${hidden ? '••••' : formatCurrency(wallet.balance)}`
          : 'Every movement in this wallet.'
      }
      footer={
        <div className="flex items-center justify-between gap-3">
          {rows.length >= limit && limit < 500 ? (
            <Button variant="ghost" onClick={() => setLimit((value) => Math.min(500, value + 100))}>
              Show more
            </Button>
          ) : rows.length >= 500 ? (
            <span className="text-xs text-slate-500 dark:text-dark-faint">Showing the latest 500 movements</span>
          ) : (
            <span />
          )}
          {onTransfer ? (
            <Button
              variant="secondary"
              onClick={() => {
                close()
                onTransfer(wallet)
              }}
            >
              <ArrowLeftRight size={16} aria-hidden="true" />
              Transfer
            </Button>
          ) : null}
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
                {row.kind === 'transfer' ? (
                  <button
                    type="button"
                    onClick={() => setPendingTransfer(row)}
                    className="shrink-0 cursor-pointer text-xs font-medium text-slate-500 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 dark:text-dark-faint dark:hover:text-red-400"
                  >
                    Archive
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
      <ConfirmDialog
        open={Boolean(pendingTransfer)}
        title="Archive transfer?"
        message={
          pendingTransfer
            ? hidden
              ? `This removes the transfer between ${pendingTransfer.from_name} and ${pendingTransfer.to_name} from both wallet balances. You can restore it from the Archive.`
              : `${formatCurrency(Math.abs(pendingTransfer.amount))} moved from ${pendingTransfer.from_name} to ${pendingTransfer.to_name}. Archiving removes it from both wallet balances; you can restore it from the Archive.`
            : ''
        }
        confirmLabel="Archive"
        loading={archiving}
        onConfirm={archiveTransfer}
        onCancel={() => setPendingTransfer(null)}
      />
    </Modal>
  )
}
