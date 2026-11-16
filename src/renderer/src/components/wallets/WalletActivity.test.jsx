import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ activity: vi.fn() }))
vi.mock('@renderer/lib/api.js', () => ({ api: { wallets: { activity: mocks.activity } } }))

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
})
