import { useEffect, useRef, useState } from 'react'
import { api } from '@renderer/lib/api.js'
import { Modal } from '@renderer/components/ui/Modal.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'
import { Field } from '@renderer/components/ui/Field.jsx'
import { Input, Select } from '@renderer/components/ui/Input.jsx'
import { WalletFace } from './WalletCard.jsx'
import { WALLET_PROVIDERS, WALLET_TYPES, WALLET_TYPE_LABELS } from '@shared/wallets.js'
import { fileToCardImage } from '@renderer/lib/cardImage.js'
import { toast } from '@renderer/store/uiStore.js'

function providerFor(wallet) {
  if (wallet.style === 'custom') return 'other'
  return Object.values(WALLET_PROVIDERS).find((provider) => provider.style === wallet.style)?.id ?? 'other'
}

function typeForProvider(provider) {
  return provider === 'other' ? 'other' : (WALLET_PROVIDERS[provider]?.type ?? 'cash')
}

export function WalletForm({ open, initial, lockType = false, onClose, onSaved }) {
  const [walletType, setWalletType] = useState('cash')
  const [provider, setProvider] = useState('cash')
  const [name, setName] = useState('')
  const [style, setStyle] = useState('cash')
  const [color, setColor] = useState('#3b3b40')
  const [image, setImage] = useState(null)
  const [mode, setMode] = useState('color')
  const [last4, setLast4] = useState('')
  const [opening, setOpening] = useState('0')
  const [fieldErrors, setFieldErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [imageBusy, setImageBusy] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    if (!open) return
    if (initial) {
      const initialProvider = providerFor(initial)
      const initialType = typeForProvider(initialProvider)
      setWalletType(initialType)
      setProvider(initialProvider)
      setName(initial.name)
      setStyle(initialProvider === 'other' ? 'custom' : initial.style)
      setColor(initial.color || '#3b3b40')
      setImage(initial.card_image || null)
      setMode(initialProvider === 'other' && initial.card_image ? 'image' : 'color')
      setLast4(initial.last4 || '')
      setOpening(String(initial.opening_balance ?? 0))
    } else {
      // Cash is the required default. The name is intentionally blank because
      // the account already has a Cash wallet; the name+type guard prevents a
      // duplicate.
      setWalletType('cash')
      setProvider('cash')
      setName('')
      setStyle('cash')
      setColor('#3b3b40')
      setImage(null)
      setMode('color')
      setLast4('')
      setOpening('0')
    }
    setFieldErrors({})
  }, [open, initial])

  const providerOptions = Object.values(WALLET_PROVIDERS).filter(
    (option) => option.type === walletType && option.id !== 'other'
  )

  const chooseType = (value) => {
    setWalletType(value)
    setImage(null)
    setMode('color')
    if (value === 'cash') {
      setProvider('cash')
      setName('')
      setStyle('cash')
      return
    }
    if (value === 'other') {
      setProvider('other')
      setName('')
      setStyle('custom')
      return
    }
    const first = Object.values(WALLET_PROVIDERS).find((option) => option.type === value)
    if (first) {
      setProvider(first.id)
      setName(first.label)
      setStyle(first.style)
    }
  }

  const chooseProvider = (value) => {
    const option = WALLET_PROVIDERS[value]
    if (!option) return
    setProvider(value)
    setName(option.label)
    setStyle(option.style)
    setImage(null)
    setMode('color')
  }

  const chooseImage = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setImageBusy(true)
    try {
      const dataUrl = await fileToCardImage(file, color)
      setImage(dataUrl)
      setMode('image')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setImageBusy(false)
    }
  }

  const save = async (event) => {
    event.preventDefault()
    setFieldErrors({})
    const trimmed = name.trim()
    const nextErrors = {}
    if (!trimmed) nextErrors.name = 'Wallet name is required'
    if (last4 && !/^\d{4}$/.test(last4.trim())) nextErrors.last4 = 'Last 4 must be four digits'
    const openingValue = Number(opening)
    if (!Number.isFinite(openingValue) || openingValue < 0) {
      nextErrors.opening = 'Opening balance must be zero or more'
    }
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const payload = {
      name: trimmed,
      type: walletType,
      style,
      opening_balance: openingValue,
      last4: last4.trim() || null,
      color: style === 'custom' ? color : null,
      card_image: style === 'custom' && mode === 'image' ? image : null
    }

    setSaving(true)
    try {
      if (initial) await api.wallets.update(initial.id, payload)
      else await api.wallets.create(payload)
      toast(initial ? 'Wallet updated' : 'Wallet added', 'success')
      onSaved()
      onClose()
    } catch (err) {
      if (/name and type/i.test(err.message)) setFieldErrors({ name: err.message })
      else toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const custom = style === 'custom'
  const preview = {
    name: name.trim() || 'New wallet',
    style,
    color,
    card_image: custom && mode === 'image' ? image : null
  }
  const providerLabel =
    walletType === 'bank' ? 'Bank' : walletType === 'ewallet' ? 'E-wallet' : null
  const providerHint =
    walletType === 'bank'
      ? 'Only debit-card banks are listed.'
      : walletType === 'ewallet'
        ? 'Only e-wallets are listed.'
        : null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Edit wallet' : 'Add wallet'}
      description="Cash, a bank card, an e-wallet or your own design."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="wallet-form" loading={saving}>
            {initial ? 'Save changes' : 'Add wallet'}
          </Button>
        </div>
      }
    >
      <form id="wallet-form" onSubmit={save} className="space-y-4" noValidate>
        <Field
          label="Wallet type"
          htmlFor="wallet-type"
          hint={lockType ? 'Cash is required; its type cannot change.' : undefined}
        >
          <Select
            id="wallet-type"
            value={walletType}
            onChange={(event) => chooseType(event.target.value)}
            disabled={lockType}
          >
            {WALLET_TYPES.map((value) => (
              <option key={value} value={value}>
                {WALLET_TYPE_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        {providerLabel ? (
          <Field label={providerLabel} htmlFor="wallet-provider" hint={providerHint}>
            <Select
              id="wallet-provider"
              value={provider}
              onChange={(event) => chooseProvider(event.target.value)}
            >
              {providerOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field
          label="Name"
          htmlFor="wallet-name"
          error={fieldErrors.name}
          hint={
            !initial && walletType === 'cash'
              ? 'The default Cash wallet is required. Give this cash wallet a different name.'
              : undefined
          }
        >
          <Input
            id="wallet-name"
            value={name}
            placeholder={walletType === 'cash' ? 'e.g. Pocket cash' : 'Wallet name'}
            onChange={(event) => setName(event.target.value)}
            hasError={Boolean(fieldErrors.name)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Last 4 (optional)"
            htmlFor="wallet-last4"
            error={fieldErrors.last4}
            hint="Digits shown on the card."
          >
            <Input
              id="wallet-last4"
              value={last4}
              inputMode="numeric"
              maxLength={4}
              placeholder="0192"
              onChange={(event) => setLast4(event.target.value.replace(/\D/g, '').slice(0, 4))}
              hasError={Boolean(fieldErrors.last4)}
            />
          </Field>
          <Field
            label="Opening balance"
            htmlFor="wallet-opening"
            error={fieldErrors.opening}
            hint="What it holds today."
          >
            <Input
              id="wallet-opening"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={opening}
              onChange={(event) => setOpening(event.target.value)}
              hasError={Boolean(fieldErrors.opening)}
            />
          </Field>
        </div>

        <div className="flex items-center gap-3">
          <WalletFace wallet={preview} className="w-32 shrink-0">
            <span className="wallet-name">{preview.name}</span>
          </WalletFace>
          <p className="text-xs text-slate-500 dark:text-dark-faint">
            {custom
              ? 'Choose a colour or upload a card image.'
              : walletType === 'cash'
                ? 'Cash is the required catch-all wallet; its face stays Cash.'
                : 'The card face follows the chosen bank or e-wallet. Renaming it will not change the face.'}
          </p>
        </div>

        {custom ? (
          <div className="space-y-3 border-t border-slate-100 pt-4 dark:border-dark-border">
            <span className="block text-sm font-medium text-slate-900 dark:text-gray-100">
              Card design
            </span>
            <div className="inline-flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-dark-surface-2">
              <button
                type="button"
                aria-pressed={mode === 'color'}
                onClick={() => {
                  setMode('color')
                  setImage(null)
                }}
                className={`h-11 cursor-pointer rounded-md px-3 text-sm font-medium ${
                  mode === 'color'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-dark-surface-2 dark:text-gray-100'
                    : 'text-slate-500 dark:text-dark-faint'
                }`}
              >
                Default colour
              </button>
              <button
                type="button"
                aria-pressed={mode === 'image'}
                onClick={() => setMode('image')}
                className={`h-11 cursor-pointer rounded-md px-3 text-sm font-medium ${
                  mode === 'image'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-dark-surface-2 dark:text-gray-100'
                    : 'text-slate-500 dark:text-dark-faint'
                }`}
              >
                Upload image
              </button>
            </div>

            {mode === 'color' ? (
              <div key="color" className="flex items-center gap-3">
                <input
                  type="color"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  aria-label="Card colour"
                  className="h-11 w-12 cursor-pointer rounded-lg border border-slate-300 bg-white p-1 dark:border-dark-border dark:bg-dark-surface-2"
                />
                <span className="font-mono text-sm text-slate-500 dark:text-dark-faint">{color}</span>
              </div>
            ) : (
              <div key="image" className="space-y-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={chooseImage}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => fileRef.current?.click()}
                    loading={imageBusy}
                  >
                    {image ? 'Replace image' : 'Choose image'}
                  </Button>
                  {image ? (
                    <Button type="button" variant="ghost" onClick={() => setImage(null)}>
                      Remove image
                    </Button>
                  ) : null}
                </div>
                <p className="text-xs text-slate-500 dark:text-dark-faint">
                  PNG or JPEG, resized to card shape. Stored with the wallet.
                </p>
              </div>
            )}
          </div>
        ) : null}
      </form>
    </Modal>
  )
}
