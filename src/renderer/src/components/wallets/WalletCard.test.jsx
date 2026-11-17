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

  it('renders the cash art without a chip and a custom image scrim', () => {
    const { container } = setup({ style: 'cash', type: 'cash', last4: null })
    expect(container.querySelector('.wallet-lines')).toBeInTheDocument()
    expect(container.querySelector('.wallet-chip')).not.toBeInTheDocument()

    const { container: image } = render(
      <WalletFace
        wallet={{
          name: 'Mine',
          style: 'custom',
          card_image: 'data:image/png;base64,iVBORw0KGgo='
        }}
      />
    )
    expect(image.querySelector('.wallet-scrim')).toBeInTheDocument()
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
})
