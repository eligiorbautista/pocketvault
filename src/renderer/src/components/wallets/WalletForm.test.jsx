import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  toast: vi.fn()
}))

vi.mock('@renderer/lib/api.js', () => ({
  api: { wallets: { create: mocks.create, update: mocks.update } }
}))
vi.mock('@renderer/store/uiStore.js', () => ({ toast: mocks.toast }))

import { WalletForm } from './WalletForm.jsx'

describe('WalletForm', () => {
  beforeEach(() => {
    mocks.create.mockReset().mockResolvedValue({ id: 1 })
    mocks.update.mockReset().mockResolvedValue({ id: 1 })
    mocks.toast.mockReset()
  })

  it('fills name and type from the provider select', () => {
    render(<WalletForm open onClose={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Wallet'), { target: { value: 'bdo' } })
    expect(screen.getByLabelText('Name')).toHaveValue('BDO')
    expect(screen.getByLabelText('Type')).toHaveValue('bank')
  })

  it('reveals the custom face controls for Other and saves colour', async () => {
    const onSaved = vi.fn()
    render(<WalletForm open onClose={vi.fn()} onSaved={onSaved} />)

    fireEvent.change(screen.getByLabelText('Wallet'), { target: { value: 'other' } })
    expect(screen.getByLabelText('Name')).toHaveValue('')
    expect(screen.getByText('Card design')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Card colour'), { target: { value: '#ff0000' } })
    expect(screen.getByText('#ff0000')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'My wallet' } })
    fireEvent.change(screen.getByLabelText('Opening balance'), { target: { value: '125.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add wallet' }))

    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith({
        name: 'My wallet',
        type: 'other',
        style: 'custom',
        opening_balance: 125.5,
        last4: null,
        color: '#ff0000',
        card_image: null
      })
    )
    expect(onSaved).toHaveBeenCalled()
  })

  it('blocks an empty custom wallet name', async () => {
    render(<WalletForm open onClose={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Wallet'), { target: { value: 'other' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add wallet' }))
    await waitFor(() => expect(mocks.create).not.toHaveBeenCalled())
    expect(screen.getByText('Wallet name is required')).toBeInTheDocument()
  })
})
