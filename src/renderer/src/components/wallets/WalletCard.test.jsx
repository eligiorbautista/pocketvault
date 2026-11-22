import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WalletCard, WalletFace } from './WalletCard.jsx'

const wallet = {
  id: 1,
  name: 'BDO',
  type: 'bank',
  style: 'bdo',
  balance: 1500,
  last4: '1234'
}

function setup(overrides = {}, props = {}) {
  const callbacks = {
    onOpen: vi.fn(),
    onEdit: vi.fn(),
    onTransfer: vi.fn(),
    onMove: vi.fn(),
    onArchive: vi.fn()
  }
  const view = render(
    <WalletCard
      wallet={{ ...wallet, ...overrides }}
      hidden={false}
      canMoveUp
      canMoveDown
      {...callbacks}
      {...props}
    />
  )
  return { ...view, callbacks }
}

describe('WalletCard', () => {
  it('renders name, balance, masked last4 and opens activity', () => {
    const { callbacks } = setup()
    expect(screen.getByText('BDO', { selector: '.wallet-name' })).toBeInTheDocument()
    expect(screen.getByText('₱1,500.00')).toBeInTheDocument()
    expect(screen.getByText('Debit · 1234')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'BDO, balance ₱1,500.00' }))
    expect(callbacks.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  })

  it('falls back to the type and hides amounts when requested', () => {
    setup({ last4: null }, { hidden: true })
    expect(screen.getByText('Bank debit card')).toBeInTheDocument()
    expect(screen.getByText('••••')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'BDO, balance hidden' })).toBeInTheDocument()
  })

  it('marks negative balances and custom colour ink', () => {
    const { container } = setup({ balance: -25 })
    expect(screen.getByText('-₱25.00').closest('.wallet-balance')).toHaveClass('wallet-negative')

    const { container: custom } = render(
      <WalletFace wallet={{ name: 'Mine', style: 'custom', color: '#ffffff' }}>
        <span>face</span>
      </WalletFace>
    )
    expect(custom.querySelector('.wallet-face')).toHaveStyle({ color: '#1b1b1b' })
    expect(container).toBeTruthy()

    const { container: fallback } = render(<WalletFace wallet={{ name: 'Mine', style: 'custom' }} />)
    expect(fallback.querySelector('.wallet-face')).toHaveStyle({ background: '#3b3b40' })
  })

  it('falls back to the generic face and a generic label', () => {
    const { container } = setup({ style: undefined, type: 'mystery', last4: null })
    expect(container.querySelector('.wallet-face--generic')).toBeInTheDocument()
    expect(screen.getByText('Wallet')).toBeInTheDocument()
  })

  it('falls back to the generic face for an unknown style', () => {
    const { container } = setup({ style: 'mystery' })
    expect(container.querySelector('.wallet-face--generic')).toBeInTheDocument()
  })

  it('renders the cash monogram without a chip or old leather art', () => {
    const { container } = setup({ style: 'cash', type: 'cash', last4: null })
    expect(container.querySelector('.wallet-monogram')).toHaveTextContent('₱')
    expect(container.querySelector('.wallet-lines')).not.toBeInTheDocument()
    expect(container.querySelector('.wallet-chip')).not.toBeInTheDocument()
  })

  it('does not render decorative contactless marks', () => {
    const { container } = setup()
    expect(container.querySelector('.wallet-contactless')).not.toBeInTheDocument()
    expect(container.querySelector('.wallet-chip')).not.toBeInTheDocument()
  })

  it('uses initials for a generic provider monogram', () => {
    const { container } = setup({ name: 'GrabPay', type: 'ewallet', style: 'generic' })
    expect(container.querySelector('.wallet-monogram')).toHaveTextContent('GP')
  })

  it('runs every menu action', () => {
    const { callbacks } = setup()
    const openMenu = () => {
      fireEvent.click(screen.getByRole('button', { name: 'BDO actions' }))
    }

    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(callbacks.onEdit).toHaveBeenCalled()

    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Transfer' }))
    expect(callbacks.onTransfer).toHaveBeenCalled()

    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Activity' }))
    expect(callbacks.onOpen).toHaveBeenCalled()

    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move up' }))
    expect(callbacks.onMove).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'up')

    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move down' }))
    expect(callbacks.onMove).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'down')

    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }))
    expect(callbacks.onArchive).toHaveBeenCalled()
  })

  it('hides move actions at the ends of the grid', () => {
    setup({}, { canMoveUp: false, canMoveDown: false })
    fireEvent.click(screen.getByRole('button', { name: 'BDO actions' }))
    expect(screen.queryByRole('menuitem', { name: 'Move up' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Move down' })).not.toBeInTheDocument()
  })

  it('omits Transfer when there is no second wallet to move to', () => {
    setup({}, { onTransfer: undefined })
    fireEvent.click(screen.getByRole('button', { name: 'BDO actions' }))
    expect(screen.queryByRole('menuitem', { name: 'Transfer' })).not.toBeInTheDocument()
  })

  it('omits Archive for the required Cash wallet', () => {
    setup({}, { canArchive: false })
    fireEvent.click(screen.getByRole('button', { name: 'BDO actions' }))
    expect(screen.queryByRole('menuitem', { name: 'Archive' })).not.toBeInTheDocument()
  })

  it('renders the monogram watermark', () => {
    const { container } = setup()
    expect(container.querySelector('.wallet-monogram')).toHaveTextContent('BDO')
  })

  it('shows card debt and utilization for credit cards', () => {
    setup({
      type: 'credit',
      style: 'generic',
      name: 'Visa',
      balance: -2500,
      credit_limit: 10000,
      last4: null
    })
    expect(screen.getByText(/Credit card/)).toBeInTheDocument()
    expect(screen.getByText('Owed')).toBeInTheDocument()
    expect(screen.getByText('₱2,500.00')).toBeInTheDocument()
    expect(screen.getByText(/25% used/)).toBeInTheDocument()
  })

  it('hides monetary values for track-only accounts', () => {
    setup({
      type: 'bank',
      style: 'bdo',
      name: 'Old account',
      balance: 0,
      track_only: 1,
      last4: null
    })
    expect(screen.getByText('Track only')).toBeInTheDocument()
    expect(screen.queryByText('Owed')).not.toBeInTheDocument()
  })
})
