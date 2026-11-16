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
})
