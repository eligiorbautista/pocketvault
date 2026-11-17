import { RowActionsMenu } from '@renderer/components/ui/RowActionsMenu.jsx'
import { WALLET_STYLE_IDS, WALLET_TYPE_LABELS, contrastInk } from '@shared/wallets.js'
import { cn } from '@renderer/lib/cn.js'
import { formatCurrency } from '@renderer/lib/format.js'

function CashArt() {
  return (
    <svg className="wallet-lines" viewBox="0 0 356 224" preserveAspectRatio="none" aria-hidden="true">
      <rect x="0" y="0" width="356" height="46" fill="#050505" opacity=".55" />
      <g transform="rotate(-7 96 22)" opacity=".8">
        <rect x="40" y="2" width="112" height="40" rx="4" fill="#8f9573" />
        <rect x="40" y="2" width="112" height="40" rx="4" fill="none" stroke="#4e5238" strokeOpacity=".6" />
        <rect x="40" y="2" width="112" height="7" fill="#d9d3b8" opacity=".85" />
        <text x="144" y="15" textAnchor="end" fontFamily="Inter, sans-serif" fontSize="11" fontWeight="600" fill="#3f422c" opacity=".7">100</text>
      </g>
      <g transform="rotate(7 286 22)" opacity=".8">
        <rect x="240" y="3" width="92" height="44" rx="6" fill="#c9c4b9" />
        <rect x="240" y="9" width="92" height="8" fill="#26262a" opacity=".82" />
        <rect x="252" y="4" width="16" height="11" rx="2" fill="#b9922c" opacity=".9" />
      </g>
      <path d="M0 24 C 60 22 120 30 178 30 C 236 30 296 22 356 24 L 356 224 L 0 224 Z" fill="#181614" />
      <path d="M0 24 C 60 22 120 30 178 30 C 236 30 296 22 356 24" fill="none" stroke="#3c362e" strokeOpacity=".6" strokeWidth="1.2" />
      <path d="M0 30 C 60 28 120 36 178 36 C 236 36 296 28 356 30 L 356 42 C 296 38 236 44 178 44 C 120 44 60 38 0 42 Z" fill="#000" opacity=".32" />
      <path d="M5 40 C 62 38 120 46 178 46 C 236 46 294 38 352 40" fill="none" stroke="#e9dfd0" strokeOpacity=".22" strokeWidth="1.3" strokeDasharray="4 6" />
      <path d="M176 46 V224" stroke="#000" strokeOpacity=".45" strokeWidth="2" />
      <path d="M180 46 V224" stroke="#fff" strokeOpacity=".04" strokeWidth="1" />
      <rect x="16" y="56" width="324" height="156" rx="12" fill="none" stroke="#e9dfd0" strokeOpacity=".15" strokeWidth="1.2" strokeDasharray="4 6" />
      <path d="M0 104 C 92 96 264 96 356 104" stroke="#000" strokeOpacity=".28" strokeWidth="7" />
      <path d="M10 107 C 98 99 258 99 346 107" fill="none" stroke="#e9dfd0" strokeOpacity=".14" strokeWidth="1.2" strokeDasharray="4 6" />
      <text x="330" y="156" textAnchor="end" fontFamily="Inter, sans-serif" fontSize="44" fontWeight="800" letterSpacing="-2" fill="#e9dfd0" fillOpacity=".05">PV</text>
    </svg>
  )
}

export function WalletFace({ wallet, className, children }) {
  const rawStyle = wallet.style || 'generic'
  const style = rawStyle === 'custom' || WALLET_STYLE_IDS.includes(rawStyle) ? rawStyle : 'generic'
  const custom = style === 'custom'
  const image = custom && wallet.card_image
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
      {style === 'cash' ? <CashArt /> : null}
      {image ? <span className="wallet-scrim" /> : null}
      {children}
    </div>
  )
}

export function WalletCard({
  wallet,
  hidden,
  canMoveUp,
  canMoveDown,
  onOpen,
  onEdit,
  onTransfer,
  onMove,
  onArchive
}) {
  const typeLabel = WALLET_TYPE_LABELS[wallet.type] ?? 'Wallet'
  const meta = wallet.last4 ? `Debit · ${wallet.last4}` : typeLabel
  const amount = hidden ? '••••' : formatCurrency(wallet.balance)
  const actions = [
    { key: 'edit', label: 'Edit', onSelect: () => onEdit(wallet) },
    { key: 'transfer', label: 'Transfer', onSelect: () => onTransfer(wallet) },
    { key: 'activity', label: 'Activity', onSelect: () => onOpen(wallet) },
    canMoveUp ? { key: 'up', label: 'Move up', onSelect: () => onMove(wallet, 'up') } : null,
    canMoveDown ? { key: 'down', label: 'Move down', onSelect: () => onMove(wallet, 'down') } : null,
    { key: 'archive', label: 'Archive', tone: 'danger', onSelect: () => onArchive(wallet) }
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
        <svg className="wallet-contactless" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M8.5 8.5a5 5 0 0 0 0 7" />
          <path d="M11.5 6a8.5 8.5 0 0 0 0 12" />
          <path d="M14.5 3.5a12 12 0 0 0 0 17" />
        </svg>
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
