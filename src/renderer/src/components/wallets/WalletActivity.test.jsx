import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  activity: vi.fn(),
  removeTransfer: vi.fn(),
  toast: vi.fn()
}))
vi.mock('@renderer/lib/api.js', () => ({
  api: { wallets: { activity: mocks.activity, removeTransfer: mocks.removeTransfer } }
}))
vi.mock('@renderer/store/uiStore.js', () => ({ toast: mocks.toast }))

import { WalletActivity } from './WalletActivity.jsx'

const rows = Array.from({ length: 100 }, (_, index) => ({
  kind: 'income',
  id: index + 1,
  date: '2026-01-15',
  amount: 10,
  label: 'Salary',
  notes: null,
  from_name: null,
  to_name: null
}))

describe('WalletActivity', () => {
  beforeEach(() => {
    mocks.activity.mockReset().mockResolvedValue(rows)
    mocks.removeTransfer.mockReset().mockResolvedValue({ removed: true })
    mocks.toast.mockReset()
  })

  it('loads the first 100 rows and requests 200 on Show more', async () => {
    render(
      <WalletActivity
        wallet={{ id: 7, name: 'BDO', balance: 100 }}
        open
        hidden={false}
        onClose={vi.fn()}
        onTransfer={vi.fn()}
      />
    )

    expect(await screen.findAllByText('Salary')).toHaveLength(100)
    expect(mocks.activity).toHaveBeenLastCalledWith(7, 100)

    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    await waitFor(() => expect(mocks.activity).toHaveBeenLastCalledWith(7, 200))
  })

  it('hides amounts when balances are hidden', async () => {
    render(
      <WalletActivity
        wallet={{ id: 7, name: 'BDO', balance: 100 }}
        open
        hidden
        onClose={vi.fn()}
        onTransfer={vi.fn()}
      />
    )
    expect(await screen.findByText('Balance ••••')).toBeInTheDocument()
    expect(screen.queryByText('+₱10.00')).not.toBeInTheDocument()
  })

  it('shows an empty state when there are no movements', async () => {
    mocks.activity.mockResolvedValueOnce([])
    render(
      <WalletActivity
        wallet={{ id: 7, name: 'BDO', balance: 100 }}
        open
        onClose={vi.fn()}
        onTransfer={vi.fn()}
      />
    )
    expect(await screen.findByText('No movements yet')).toBeInTheDocument()
  })

  it('shows a retryable error', async () => {
    mocks.activity.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(rows)
    render(
      <WalletActivity
        wallet={{ id: 7, name: 'BDO', balance: 100 }}
        open
        onClose={vi.fn()}
        onTransfer={vi.fn()}
      />
    )
    expect(await screen.findByText('boom')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findAllByText('Salary')).toHaveLength(100)
  })

  it('shows a loading state', async () => {
    let resolve
    mocks.activity.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      })
    )
    render(
      <WalletActivity
        wallet={{ id: 7, name: 'BDO', balance: 100 }}
        open
        onClose={vi.fn()}
        onTransfer={vi.fn()}
      />
    )
    expect(screen.getByText('Loading activity...')).toBeInTheDocument()
    resolve(rows)
    expect(await screen.findAllByText('Salary')).toHaveLength(100)
  })

  it('stops at the 500-row cap', async () => {
    const many = Array.from({ length: 500 }, (_, index) => ({ ...rows[0], id: index + 1 }))
    mocks.activity.mockResolvedValue(many)
    render(
      <WalletActivity
        wallet={{ id: 7, name: 'BDO', balance: 100 }}
        open
        onClose={vi.fn()}
        onTransfer={vi.fn()}
      />
    )
    expect(await screen.findByRole('button', { name: 'Show more' })).toBeInTheDocument()
    for (let step = 1; step <= 4; step += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
      await waitFor(() => expect(mocks.activity).toHaveBeenLastCalledWith(7, 100 + step * 100))
    }
    expect(await screen.findByText('Showing the latest 500 movements')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument()
  })

  it('renders categories, transfers, notes and signed amounts', async () => {
    mocks.activity.mockResolvedValueOnce([
      {
        kind: 'expense',
        id: 1,
        date: '2026-01-02',
        amount: -12,
        label: 'food',
        notes: 'lunch',
        from_name: null,
        to_name: null
      },
      {
        kind: 'transfer',
        id: 2,
        date: '2026-01-03',
        amount: -5,
        label: 'Transfer out',
        notes: null,
        from_name: 'BDO',
        to_name: 'Cash'
      },
      {
        kind: 'transfer',
        id: 3,
        date: '2026-01-04',
        amount: 5,
        label: 'Transfer in',
        notes: 'moved back',
        from_name: null,
        to_name: null
      },
      {
        kind: 'mystery',
        id: 4,
        date: '2026-01-05',
        amount: 1,
        label: 'Mystery',
        notes: null,
        from_name: null,
        to_name: null
      }
    ])
    render(
      <WalletActivity
        wallet={{ id: 7, name: 'BDO', balance: 100 }}
        open
        onClose={vi.fn()}
        onTransfer={vi.fn()}
      />
    )

    expect(await screen.findByText(/Food & Dining/)).toBeInTheDocument()
    expect(screen.getByText(/BDO → Cash/)).toBeInTheDocument()
    expect(screen.getByText(/lunch/)).toBeInTheDocument()
    expect(screen.getByText(/moved back/)).toBeInTheDocument()
    expect(screen.getByText('−₱12.00')).toBeInTheDocument()
    expect(screen.getByText('+₱5.00')).toBeInTheDocument()
    expect(screen.getByText('Mystery')).toBeInTheDocument()
  })

  it('archives a transfer after confirming', async () => {
    const transfer = {
      kind: 'transfer',
      id: 2,
      date: '2026-01-03',
      amount: -5,
      label: 'Transfer out',
      notes: null,
      from_name: 'BDO',
      to_name: 'Cash'
    }
    mocks.activity.mockResolvedValueOnce([transfer])
    const onChanged = vi.fn()
    render(
      <WalletActivity
        wallet={{ id: 7, name: 'BDO', balance: 100 }}
        open
        hidden={false}
        onClose={vi.fn()}
        onTransfer={vi.fn()}
        onChanged={onChanged}
      />
    )

    expect(await screen.findByText(/BDO → Cash/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    expect(await screen.findByText('Archive transfer?')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Archive' }).at(-1))

    await waitFor(() => expect(mocks.removeTransfer).toHaveBeenCalledWith(2))
    expect(mocks.toast).toHaveBeenCalledWith('Transfer archived', 'success')
    expect(onChanged).toHaveBeenCalled()
  })

  it('does not reveal the amount in the archive confirmation when hidden', async () => {
    mocks.activity.mockResolvedValueOnce([
      {
        kind: 'transfer',
        id: 2,
        date: '2026-01-03',
        amount: -5,
        label: 'Transfer out',
        notes: null,
        from_name: 'BDO',
        to_name: 'Cash'
      }
    ])
    render(
      <WalletActivity
        wallet={{ id: 7, name: 'BDO', balance: 100 }}
        open
        hidden
        onClose={vi.fn()}
        onTransfer={vi.fn()}
      />
    )
    await screen.findByText(/BDO → Cash/)
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    expect(await screen.findByText(/This removes the transfer between BDO and Cash/)).toBeInTheDocument()
    expect(screen.queryByText(/₱5\.00/)).not.toBeInTheDocument()
  })

  it('closes and opens the transfer form from the footer', async () => {
    const onClose = vi.fn()
    const onTransfer = vi.fn()
    const wallet = { id: 7, name: 'BDO', balance: 100 }
    render(
      <WalletActivity wallet={wallet} open onClose={onClose} onTransfer={onTransfer} />
    )
    await screen.findAllByText('Salary')
    fireEvent.click(screen.getByRole('button', { name: 'Transfer' }))
    expect(onClose).toHaveBeenCalled()
    expect(onTransfer).toHaveBeenCalledWith(wallet)
  })

  it('handles a missing wallet selection', async () => {
    render(
      <WalletActivity wallet={null} open onClose={vi.fn()} onTransfer={vi.fn()} />
    )
    expect(screen.getByRole('heading', { name: 'Wallet activity' })).toBeInTheDocument()
    expect(screen.getByText('Every movement in this wallet.')).toBeInTheDocument()
    expect(await screen.findByText('No movements yet')).toBeInTheDocument()
    expect(mocks.activity).not.toHaveBeenCalled()
  })
})
