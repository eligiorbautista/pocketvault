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
  cimb: 'CIMB',
  generic: 'PV'
}

function monogramFor(wallet, style) {
  if (style === 'custom') {
    if (wallet.card_image) return ''
    return String(wallet.name || 'PV')
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 3)
      .toUpperCase() || 'PV'
  }
  return MONOGRAMS[style] ?? 'PV'
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
  const interestLabel = wallet.interest_enabled
    ? `${Number(wallet.interest_rate || 0).toFixed(2)}%`
    : null
  const meta = [
    wallet.last4
      ? `${wallet.type === 'bank' ? 'Debit' : typeLabel} · ${wallet.last4}`
      : typeLabel,
    interestLabel
  ]
    .filter(Boolean)
    .join(' · ')
  const amount = hidden ? '••••' : formatCurrency(wallet.balance)
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
        aria-label={`${wallet.name}, balance ${hidden ? 'hidden' : formatCurrency(wallet.balance)}`}
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

      <div className="relative z-10 wallet-mid pointer-events-none">
        {styleHasChip(wallet) ? <span className="wallet-chip" aria-hidden="true" /> : null}
        {wallet.style !== 'cash' ? (
          <svg className="wallet-contactless" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M8.5 8.5a5 5 0 0 0 0 7" />
            <path d="M11.5 6a8.5 8.5 0 0 0 0 12" />
            <path d="M14.5 3.5a12 12 0 0 0 0 17" />
          </svg>
        ) : null}
      </div>

      <div className="relative z-10 wallet-bottom pointer-events-none">
        <div className="min-w-0">
          <div className="wallet-label">Balance</div>
          <div className={cn('wallet-balance num', wallet.balance < 0 && 'wallet-negative')}>
            {amount}
          </div>
        </div>
        <span className="wallet-meta">{meta}</span>
      </div>
    </WalletFace>
  )
}

function styleHasChip(wallet) {
  return wallet.style !== 'cash'
}
