import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff, Plus, WalletCards } from 'lucide-react'
import { api } from '@renderer/lib/api.js'
import { PageHeader } from '@renderer/components/ui/PageHeader.jsx'
import { Card } from '@renderer/components/ui/Card.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'
import { EmptyState } from '@renderer/components/ui/EmptyState.jsx'
import { ErrorState } from '@renderer/components/ui/ErrorState.jsx'
import { LoadingBlock } from '@renderer/components/ui/Spinner.jsx'
import { ConfirmDialog } from '@renderer/components/ui/ConfirmDialog.jsx'
import { WalletCard } from '@renderer/components/wallets/WalletCard.jsx'
import { WalletForm } from '@renderer/components/wallets/WalletForm.jsx'
import { TransferForm } from '@renderer/components/wallets/TransferForm.jsx'
import { WalletActivity } from '@renderer/components/wallets/WalletActivity.jsx'
import { formatCurrency } from '@renderer/lib/format.js'
import { useApiData } from '@renderer/hooks/useApiData.js'
import { toast } from '@renderer/store/uiStore.js'

const HIDDEN_KEY = 'pocketvault.walletBalancesHidden'

export default function Wallet() {
  const [hidden, setHidden] = useState(() => localStorage.getItem(HIDDEN_KEY) === '1')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferFrom, setTransferFrom] = useState(null)
  const [activityWallet, setActivityWallet] = useState(null)
  const [pendingArchive, setPendingArchive] = useState(null)
  const [archiving, setArchiving] = useState(false)

  const { data, loading, error, reload } = useApiData(() => api.wallets.summary(), [])

  useEffect(() => {
    localStorage.setItem(HIDDEN_KEY, hidden ? '1' : '0')
  }, [hidden])

  const wallets = data?.wallets ?? []
  const canTransfer = wallets.length > 1
  const netWorth = data?.netWorth ?? 0
  const netBalance = data?.netBalance ?? 0
  const liabilities = data?.liabilities ?? 0
  const assets = netBalance

  const largest = wallets.reduce(
    (best, wallet) => (best == null || wallet.balance > best.balance ? wallet : best),
    null
  )
  const finding =
    largest && wallets.length && data?.total > 0 && wallets.every((wallet) => wallet.balance >= 0)
      ? `${largest.name} holds ${Math.round((largest.balance / data.total) * 100)}% of it.`
      : null

  const openAdd = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (wallet) => {
    setEditing(wallet)
    setFormOpen(true)
  }

  const openTransfer = (wallet) => {
    setTransferFrom(wallet ?? null)
    setTransferOpen(true)
  }

  const move = async (wallet, direction) => {
    try {
      await api.wallets.move(wallet.id, direction)
      reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const archive = async () => {
    if (!pendingArchive) return
    setArchiving(true)
    try {
      const removed = await api.wallets.remove(pendingArchive.id)
      if (removed === false) throw new Error('Wallet not found')
      toast('Wallet archived', 'success')
      setPendingArchive(null)
      reload()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setArchiving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wallet"
        description="Every peso you hold, and where it sits."
        actions={
          <>
            <Link
              to="/archive"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-200 dark:hover:bg-dark-surface-2"
            >
              Archived
            </Link>
            <Button onClick={openAdd}>
              <Plus size={16} aria-hidden="true" />
              Add wallet
            </Button>
          </>
        }
      />

      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-dark-faint">
              Net worth
            </p>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
              {hidden ? '••••' : formatCurrency(netWorth)}
            </p>
            {finding ? (
              <p className="mt-1 text-sm text-slate-500 dark:text-dark-faint">{finding}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setHidden((value) => !value)}
            aria-label={hidden ? 'Show amounts' : 'Hide amounts'}
            aria-pressed={hidden}
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-dark-faint dark:hover:bg-dark-surface-2"
          >
            {hidden ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        </div>

        <div className="mt-5 grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100 pt-4 dark:divide-dark-rule dark:border-dark-rule">
          {[
            ['Net balance', netBalance],
            ['Assets', assets],
            ['Liabilities', liabilities]
          ].map(([label, value]) => (
            <div key={label} className="px-3 first:pl-0 last:pr-0">
              <p className="text-xs text-slate-500 dark:text-dark-faint">{label}</p>
              <p className="mt-0.5 truncate text-sm font-medium text-slate-900 dark:text-gray-100">
                {hidden ? '••••' : formatCurrency(value)}
              </p>
            </div>
          ))}
        </div>
      </Card>

      {loading ? <LoadingBlock /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}

      {!loading && !error ? (
        wallets.length ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-gray-100">
                Cards <span className="text-slate-400 dark:text-dark-faint">{wallets.length}</span>
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2 md:grid-cols-3 2xl:grid-cols-4">
              {wallets.map((wallet, index) => (
                <WalletCard
                  key={wallet.id}
                  wallet={wallet}
                  hidden={hidden}
                  canMoveUp={index > 0}
                  canMoveDown={index < wallets.length - 1}
                  onOpen={setActivityWallet}
                  onEdit={openEdit}
                  onTransfer={canTransfer ? openTransfer : undefined}
                  onMove={move}
                  onArchive={setPendingArchive}
                />
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            icon={WalletCards}
            title="Add your first wallet"
            description="Cash, a bank card or an e-wallet. Cash is created automatically for you."
            action={
              <Button onClick={openAdd}>
                <Plus size={16} aria-hidden="true" />
                Add wallet
              </Button>
            }
          />
        )
      ) : null}

      <WalletForm
        open={formOpen}
        initial={editing}
        onClose={() => setFormOpen(false)}
        onSaved={reload}
      />

      <TransferForm
        open={transferOpen}
        initialFrom={transferFrom}
        wallets={wallets}
        hidden={hidden}
        onClose={() => setTransferOpen(false)}
        onSaved={reload}
      />

      <WalletActivity
        wallet={activityWallet}
        open={Boolean(activityWallet)}
        hidden={hidden}
        onClose={() => setActivityWallet(null)}
        onTransfer={canTransfer ? openTransfer : undefined}
        onChanged={reload}
      />

      <ConfirmDialog
        open={Boolean(pendingArchive)}
        title="Archive wallet?"
        message={
          pendingArchive && pendingArchive.balance !== 0
            ? hidden
              ? 'This wallet still holds money. Archiving it stops that balance counting toward net worth. You can restore it from the Archive.'
              : `This wallet still holds ${formatCurrency(pendingArchive.balance)}. Archiving it stops that balance counting toward net worth. You can restore it from the Archive.`
            : 'This moves the wallet to the Archive. Its history stays intact and you can restore it anytime.'
        }
        confirmLabel="Archive"
        loading={archiving}
        onConfirm={archive}
        onCancel={() => setPendingArchive(null)}
      />
    </div>
  )
}
