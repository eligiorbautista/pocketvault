import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  transfer: vi.fn(),
  toast: vi.fn()
}))

vi.mock('@renderer/lib/api.js', () => ({
  api: { wallets: { transfer: mocks.transfer } }
}))
vi.mock('@renderer/store/uiStore.js', () => ({ toast: mocks.toast }))

import { TransferForm } from './TransferForm.jsx'

const wallets = [
  { id: 1, name: 'Cash', balance: 100 },
  { id: 2, name: 'BDO', balance: 200 }
]

describe('TransferForm', () => {
  beforeEach(() => {
    mocks.transfer.mockReset().mockResolvedValue({ id: 1 })
    mocks.toast.mockReset()
  })

  it('previews both balances and saves a transfer', async () => {
    const onSaved = vi.fn()
    render(
      <TransferForm
        open
        initialFrom={wallets[1]}
        wallets={wallets}
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    )

    expect(screen.getByLabelText('From')).toHaveValue('2')
    expect(screen.getByLabelText('To')).toHaveValue('1')

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '50' } })
    expect(screen.getByText('BDO: ₱150.00')).toBeInTheDocument()
    expect(screen.getByText('Cash: ₱150.00')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Transfer' }))
    await waitFor(() =>
      expect(mocks.transfer).toHaveBeenCalledWith({
        from_wallet_id: 2,
        to_wallet_id: 1,
        amount: 50,
        date: expect.any(String),
        notes: ''
      })
    )
    expect(onSaved).toHaveBeenCalled()
  })

  it('rejects a transfer to the same wallet', async () => {
    render(<TransferForm open wallets={wallets} onClose={vi.fn()} onSaved={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('To'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Transfer' }))

    expect(await screen.findByText('Choose two different wallets')).toBeInTheDocument()
    expect(mocks.transfer).not.toHaveBeenCalled()
  })

  it('rejects a zero amount', async () => {
    render(<TransferForm open wallets={wallets} onClose={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Transfer' }))
    expect(await screen.findByText('Enter an amount greater than zero')).toBeInTheDocument()
    expect(mocks.transfer).not.toHaveBeenCalled()
  })

  it('sends the date and notes with the transfer', async () => {
    render(<TransferForm open wallets={wallets} onClose={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '25' } })
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-02-01' } })
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: ' rent ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Transfer' }))

    await waitFor(() =>
      expect(mocks.transfer).toHaveBeenCalledWith({
        from_wallet_id: 1,
        to_wallet_id: 2,
        amount: 25,
        date: '2026-02-01',
        notes: ' rent '
      })
    )
  })

  it('keeps the form open and toasts when the API fails', async () => {
    mocks.transfer.mockRejectedValueOnce(new Error('nope'))
    const onClose = vi.fn()
    render(<TransferForm open wallets={wallets} onClose={onClose} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Transfer' }))
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith('nope', 'error'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does nothing while closed and handles an empty wallet list', () => {
    const { rerender } = render(<TransferForm open={false} wallets={wallets} onClose={vi.fn()} onSaved={vi.fn()} />)
    rerender(<TransferForm open wallets={[]} onClose={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Transfer' }))
    expect(screen.getByText('Choose two different wallets')).toBeInTheDocument()
    expect(mocks.transfer).not.toHaveBeenCalled()
  })

  it('hides balances in the pickers and preview when requested', () => {
    render(
      <TransferForm open hidden wallets={wallets} onClose={vi.fn()} onSaved={vi.fn()} />
    )
    const from = screen.getByLabelText('From')
    expect(from.options[0].textContent).toBe('Cash')
    expect(from.options[1].textContent).toBe('BDO')

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '50' } })
    expect(screen.getByText('Balances hidden')).toBeInTheDocument()
    expect(screen.queryByText('BDO: ₱150.00')).not.toBeInTheDocument()
  })

  it('switches the source wallet and previews the new balances', () => {
    render(<TransferForm open initialFrom={wallets[1]} wallets={wallets} onClose={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '25' } })
    expect(screen.getByText('Cash: ₱75.00')).toBeInTheDocument()
    expect(screen.getByText('BDO: ₱225.00')).toBeInTheDocument()
  })
})
