import { RowActionsMenu } from '@renderer/components/ui/RowActionsMenu.jsx'
import { WALLET_STYLE_IDS, WALLET_TYPE_LABELS, contrastInk } from '@shared/wallets.js'
import { cn } from '@renderer/lib/cn.js'
import { formatCurrency } from '@renderer/lib/format.js'

const MONOGRAMS = {
  cash: '₱',
  bdo: 'BDO',
  bpi: 'BPI',
  metrobank: 'MB',
  unionbank: 'UB',
  securitybank: 'SB',
  rcbc: 'RCBC',
  landbank: 'L',
  pnb: 'PNB',
  psbank: 'PS',
  gcash: 'GC',
  maya: 'M',
  gotyme: 'GT',
  maribank: 'MB',
  cimb: 'CIMB'
}

function initialsFor(name) {
  const words = String(name || '').match(/[A-Z]+(?![a-z])|[A-Z][a-z]+|[a-z]+/g) ?? []
  return words
    .map((part) => part[0])
    .join('')
    .slice(0, 3)
    .toUpperCase() || 'PV'
}

function monogramFor(wallet, style) {
  if (style === 'custom') return wallet.card_image ? '' : initialsFor(wallet.name)
  return MONOGRAMS[style] ?? initialsFor(wallet.name)
}

export function WalletFace({ wallet, className, children }) {
  const rawStyle = wallet.style || 'generic'
  const style = rawStyle === 'custom' || WALLET_STYLE_IDS.includes(rawStyle) ? rawStyle : 'generic'
  const custom = style === 'custom'
  const image = custom && wallet.card_image
  const monogram = monogramFor(wallet, style)
  const inline = custom
    ? image
      ? {
          backgroundImage: `url(${wallet.card_image})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          color: '#ffffff'
        }
      : { background: wallet.color || '#3b3b40', color: contrastInk(wallet.color || '#3b3b40') }
    : undefined

  return (
    <div
      className={cn('wallet-face', !custom && `wallet-face--${style}`, className)}
      style={inline}
    >
      {image ? <span className="wallet-scrim" /> : null}
      {monogram ? <span className="wallet-monogram" aria-hidden="true">{monogram}</span> : null}
      {children}
    </div>
  )
}

export function WalletCard({
  wallet,
  hidden,
  canMoveUp,
  canMoveDown,
  canArchive = true,
  onOpen,
  onEdit,
  onTransfer,
  onMove,
  onArchive
}) {
  const typeLabel = WALLET_TYPE_LABELS[wallet.type] ?? 'Wallet'
  const isCredit = wallet.type === 'credit'
  const isTrackOnly = Boolean(wallet.track_only)
  const owed = Math.max(0, -Number(wallet.balance || 0))
  const utilization = isCredit && Number(wallet.credit_limit) > 0
    ? `${Math.round((owed / Number(wallet.credit_limit)) * 100)}% used`
    : null
  const interestLabel = wallet.interest_enabled
    ? `${Number(wallet.interest_rate || 0).toFixed(2)}%`
    : null
  const meta = [
    wallet.type === 'cash'
      ? null
      : wallet.last4
        ? `${wallet.type === 'bank' ? 'Debit' : typeLabel} · ${wallet.last4}`
        : typeLabel,
    interestLabel,
    utilization
  ]
    .filter(Boolean)
    .join(' · ')
  const amount = hidden
    ? '••••'
    : isTrackOnly
      ? '—'
      : formatCurrency(isCredit ? owed : wallet.balance)
  const valueLabel = isTrackOnly ? 'Track only' : isCredit ? 'Owed' : 'Balance'
  const actions = [
    { key: 'edit', label: 'Edit', onSelect: () => onEdit(wallet) },
    onTransfer ? { key: 'transfer', label: 'Transfer', onSelect: () => onTransfer(wallet) } : null,
    { key: 'activity', label: 'Activity', onSelect: () => onOpen(wallet) },
    canMoveUp ? { key: 'up', label: 'Move up', onSelect: () => onMove(wallet, 'up') } : null,
    canMoveDown ? { key: 'down', label: 'Move down', onSelect: () => onMove(wallet, 'down') } : null,
    canArchive ? { key: 'archive', label: 'Archive', tone: 'danger', onSelect: () => onArchive(wallet) } : null
  ].filter(Boolean)

  return (
    <WalletFace wallet={wallet} className="transition-transform duration-200 active:scale-[0.99]">
      <button
        type="button"
        onClick={() => onOpen(wallet)}
        className="absolute inset-0 z-0 cursor-pointer rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
        aria-label={`${wallet.name}, ${isTrackOnly ? 'track only' : isCredit ? 'owed' : 'balance'} ${hidden ? 'hidden' : formatCurrency(isCredit ? owed : wallet.balance)}`}
      />

      <div className="relative z-10 flex items-start justify-between gap-2 pointer-events-none">
        <span className="wallet-name">{wallet.name}</span>
        <span className="pointer-events-auto -mr-2 -mt-2">
          <RowActionsMenu
            actions={actions}
            label={`${wallet.name} actions`}
            triggerClassName="!text-current opacity-80 hover:!bg-white/10"
          />
        </span>
      </div>

      <div className="relative z-10 wallet-bottom pointer-events-none">
        <div className="min-w-0">
          <div className="wallet-label">{valueLabel}</div>
          <div className={cn('wallet-balance num', wallet.balance < 0 && !isCredit && !isTrackOnly && 'wallet-negative')}>
            {amount}
          </div>
        </div>
        <span className="wallet-meta">{meta}</span>
      </div>
    </WalletFace>
  )
}
