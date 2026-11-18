import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  toast: vi.fn(),
  fileToCardImage: vi.fn()
}))

vi.mock('@renderer/lib/api.js', () => ({
  api: { wallets: { create: mocks.create, update: mocks.update } }
}))
vi.mock('@renderer/store/uiStore.js', () => ({ toast: mocks.toast }))
vi.mock('@renderer/lib/cardImage.js', () => ({ fileToCardImage: mocks.fileToCardImage }))

import { WalletForm } from './WalletForm.jsx'

const PNG = 'data:image/png;base64,iVBORw0KGgo='

describe('WalletForm', () => {
  beforeEach(() => {
    mocks.create.mockReset().mockResolvedValue({ id: 1 })
    mocks.update.mockReset().mockResolvedValue({ id: 1 })
    mocks.toast.mockReset()
    mocks.fileToCardImage.mockReset().mockResolvedValue(PNG)
  })

  it('starts on Cash and fills the provider and name from the type', () => {
    render(<WalletForm open onClose={vi.fn()} onSaved={vi.fn()} />)
    expect(screen.getByLabelText('Wallet type')).toHaveValue('cash')
    expect(screen.getByLabelText('Name')).toHaveValue('')

    fireEvent.change(screen.getByLabelText('Wallet type'), { target: { value: 'bank' } })
    expect(screen.getByLabelText('Bank')).toHaveValue('bdo')
    expect(screen.getByLabelText('Name')).toHaveValue('BDO')
  })

  it('reveals the custom face controls for Other and saves colour', async () => {
    const onSaved = vi.fn()
    render(<WalletForm open onClose={vi.fn()} onSaved={onSaved} />)

    fireEvent.change(screen.getByLabelText('Wallet type'), { target: { value: 'other' } })
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
        card_image: null,
        interest_enabled: false,
        interest_rate: 0,
        interest_crediting: 'monthly',
        interest_withholding: true
      })
    )
    expect(onSaved).toHaveBeenCalled()
  })

  it('blocks an empty custom wallet name', async () => {
    render(<WalletForm open onClose={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Wallet type'), { target: { value: 'other' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add wallet' }))
    await waitFor(() => expect(mocks.create).not.toHaveBeenCalled())
    expect(screen.getByText('Wallet name is required')).toBeInTheDocument()
  })

  it('preloads a preset wallet with type first and updates it', async () => {
    const onSaved = vi.fn()
    const onClose = vi.fn()
    render(
      <WalletForm
        open
        initial={{
          id: 9,
          name: 'BDO Savings',
          type: 'bank',
          style: 'bdo',
          opening_balance: 250.5,
          last4: '1234'
        }}
        onClose={onClose}
        onSaved={onSaved}
      />
    )

    expect(screen.getByLabelText('Wallet type')).toHaveValue('bank')
    expect(screen.getByLabelText('Bank')).toHaveValue('bdo')
    expect(screen.getByLabelText('Name')).toHaveValue('BDO Savings')
    expect(screen.getByLabelText('Last 4 (optional)')).toHaveValue('1234')
    expect(screen.getByLabelText('Opening balance')).toHaveValue(250.5)

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith(9, {
        name: 'BDO Savings',
        type: 'bank',
        style: 'bdo',
        opening_balance: 250.5,
        last4: '1234',
        color: null,
        card_image: null,
        interest_enabled: false,
        interest_rate: 0,
        interest_crediting: 'monthly',
        interest_withholding: true
      })
    )
    expect(onSaved).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('preloads a custom image and can remove it', async () => {
    render(
      <WalletForm
        open
        initial={{
          id: 9,
          name: 'Mine',
          type: 'other',
          style: 'custom',
          color: '#ff0000',
          card_image: PNG,
          opening_balance: 0,
          last4: null
        }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    )

    expect(screen.getByLabelText('Wallet type')).toHaveValue('other')
    expect(screen.getByRole('button', { name: 'Replace image' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith(9, {
        name: 'Mine',
        type: 'other',
        style: 'custom',
        opening_balance: 0,
        last4: null,
        color: '#ff0000',
        card_image: null,
        interest_enabled: false,
        interest_rate: 0,
        interest_crediting: 'monthly',
        interest_withholding: true
      })
    )
  })

  it('uploads a card image and saves the data URL', async () => {
    render(<WalletForm open onClose={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Wallet type'), { target: { value: 'other' } })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Mine' } })
    fireEvent.click(screen.getByRole('button', { name: 'Upload image' }))

    const fileInput = document.querySelector('input[type=file]')
    fireEvent.change(fileInput, {
      target: { files: [new File(['x'], 'card.png', { type: 'image/png' })] }
    })

    await waitFor(() => expect(mocks.fileToCardImage).toHaveBeenCalled())
    expect(await screen.findByRole('button', { name: 'Replace image' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add wallet' }))
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Mine',
          type: 'other',
          style: 'custom',
          card_image: PNG
        })
      )
    )
  })

  it('reports an image that cannot be decoded', async () => {
    mocks.fileToCardImage.mockRejectedValueOnce(new Error('bad image'))
    render(<WalletForm open onClose={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Wallet type'), { target: { value: 'other' } })
    fireEvent.click(screen.getByRole('button', { name: 'Upload image' }))
    fireEvent.change(document.querySelector('input[type=file]'), {
      target: { files: [new File(['x'], 'card.png', { type: 'image/png' })] }
    })

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith('bad image', 'error'))
    expect(screen.getByRole('button', { name: 'Choose image' })).toBeInTheDocument()
  })

  it('validates last 4 and opening balance', async () => {
    render(<WalletForm open onClose={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pocket cash' } })
    fireEvent.change(screen.getByLabelText('Last 4 (optional)'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add wallet' }))
    await screen.findByText('Last 4 must be four digits')
    expect(mocks.create).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Last 4 (optional)'), { target: { value: '1234' } })
    fireEvent.change(screen.getByLabelText('Opening balance'), { target: { value: '-5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add wallet' }))
    await screen.findByText('Opening balance must be zero or more')
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('keeps the form open and shows the duplicate name error inline', async () => {
    mocks.create.mockRejectedValueOnce(new Error('A wallet with this name and type already exists'))
    const onClose = vi.fn()
    render(<WalletForm open onClose={onClose} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Cash' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add wallet' }))
    expect(
      await screen.findByText('A wallet with this name and type already exists')
    ).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps the form open and toasts when the API fails', async () => {
    mocks.create.mockRejectedValueOnce(new Error('nope'))
    const onClose = vi.fn()
    render(<WalletForm open onClose={onClose} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pocket cash' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add wallet' }))
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith('nope', 'error'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('switches the type and saves the filtered provider', async () => {
    render(<WalletForm open onClose={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Wallet type'), { target: { value: 'ewallet' } })
    expect(screen.getByLabelText('E-wallet')).toHaveValue('gcash')
    fireEvent.click(screen.getByRole('button', { name: 'Add wallet' }))
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'GCash', type: 'ewallet', style: 'gcash' })
      )
    )
  })

  it('clears the custom controls when switching back to a preset', () => {
    render(<WalletForm open onClose={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Wallet type'), { target: { value: 'other' } })
    expect(screen.getByText('Card design')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Wallet type'), { target: { value: 'ewallet' } })
    expect(screen.queryByText('Card design')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('GCash')
  })

  it('toggles between colour and image modes', () => {
    render(<WalletForm open onClose={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Wallet type'), { target: { value: 'other' } })
    expect(screen.getByLabelText('Card colour')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Upload image' }))
    expect(screen.getByRole('button', { name: 'Choose image' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Choose image' }))
    fireEvent.click(screen.getByRole('button', { name: 'Default colour' }))
    expect(screen.getByLabelText('Card colour')).toBeInTheDocument()
  })

  it('treats an unknown saved style as Other and a custom colour as colour mode', () => {
    render(
      <WalletForm
        open
        initial={{ id: 3, name: 'Legacy', type: 'other', style: 'generic', opening_balance: 0 }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    )
    expect(screen.getByLabelText('Wallet type')).toHaveValue('other')
    expect(screen.getByText('Card design')).toBeInTheDocument()
    expect(screen.getByLabelText('Card colour')).toBeInTheDocument()
  })

  it('does nothing while closed, then resets a new form when opened', () => {
    const { rerender } = render(<WalletForm open={false} onClose={vi.fn()} onSaved={vi.fn()} />)
    rerender(<WalletForm open onClose={vi.fn()} onSaved={vi.fn()} />)
    expect(screen.getByLabelText('Wallet type')).toHaveValue('cash')
    expect(screen.getByLabelText('Name')).toHaveValue('')
    expect(screen.getByLabelText('Opening balance')).toHaveValue(0)
  })

  it('preloads a sparse custom wallet with defaults', async () => {
    render(
      <WalletForm
        open
        initial={{ id: 9, name: 'Legacy', type: 'other', style: 'custom' }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    )
    expect(screen.getByLabelText('Last 4 (optional)')).toHaveValue('')
    expect(screen.getByLabelText('Opening balance')).toHaveValue(0)
    expect(screen.getByLabelText('Card colour')).toHaveValue('#3b3b40')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith(
        9,
        expect.objectContaining({ color: '#3b3b40', card_image: null, opening_balance: 0 })
      )
    )
  })

  it('locks the type of the default Cash wallet while allowing a rename', () => {
    render(
      <WalletForm
        open
        lockType
        initial={{
          id: 1,
          name: 'Cash',
          type: 'cash',
          style: 'cash',
          opening_balance: 0,
          last4: null
        }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    )
    expect(screen.getByLabelText('Wallet type')).toBeDisabled()
    expect(screen.getByText('Cash is required; its type cannot change.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pocket cash' } })
    expect(screen.getByLabelText('Name')).toHaveValue('Pocket cash')
  })

  it('ignores a dismissed file picker', () => {
    render(<WalletForm open onClose={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Wallet type'), { target: { value: 'other' } })
    fireEvent.click(screen.getByRole('button', { name: 'Upload image' }))
    const input = document.querySelector('input[type=file]')
    fireEvent.change(input, { target: { files: [] } })
    expect(mocks.fileToCardImage).not.toHaveBeenCalled()
  })

  it('saves optional interest settings and estimates after tax', async () => {
    render(<WalletForm open onClose={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Wallet type'), { target: { value: 'bank' } })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'BDO Savings' } })
    fireEvent.change(screen.getByLabelText('Opening balance'), { target: { value: '12000' } })

    fireEvent.click(screen.getByRole('switch', { name: 'Earns interest' }))
    fireEvent.change(screen.getByLabelText('Interest rate (% p.a.)'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Crediting'), { target: { value: 'quarterly' } })
    expect(screen.getByText(/Estimated ₱32.00\/month/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add wallet' }))
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          interest_enabled: true,
          interest_rate: 4,
          interest_crediting: 'quarterly',
          interest_withholding: true
        })
      )
    )
  })
})
