import { useEffect, useState } from 'react'
import { api } from '@renderer/lib/api.js'
import { Modal } from '@renderer/components/ui/Modal.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'
import { Field } from '@renderer/components/ui/Field.jsx'
import { Input, Select, Textarea } from '@renderer/components/ui/Input.jsx'
import { formatCurrency, todayInput } from '@renderer/lib/format.js'
import { toast } from '@renderer/store/uiStore.js'

export function TransferForm({ open, initialFrom, wallets, hidden = false, onClose, onSaved }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('0.00')
  const [date, setDate] = useState(todayInput())
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState(null)
  const [amountError, setAmountError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    const first = initialFrom?.id ?? wallets[0]?.id ?? ''
    const second = wallets.find((wallet) => wallet.id !== first)?.id ?? ''
    setFrom(String(first))
    setTo(String(second))
    setAmount('0.00')
    setDate(todayInput())
    setNotes('')
    setFormError(null)
    setAmountError(null)
  }, [open, initialFrom, wallets])

  const fromWallet = wallets.find((wallet) => wallet.id === Number(from))
  const toWallet = wallets.find((wallet) => wallet.id === Number(to))
  const value = Number(amount)
  const valid = Number.isFinite(value) && value > 0 && from && to && from !== to

  const save = async (event) => {
    event.preventDefault()
    setFormError(null)
    setAmountError(null)
    if (!from || !to || from === to) return setFormError('Choose two different wallets')
    if (!Number.isFinite(value) || value <= 0) {
      return setAmountError('Enter an amount greater than zero')
    }
    if (!date) return setFormError('Date is required')

    setSaving(true)
    try {
      await api.wallets.transfer({
        from_wallet_id: Number(from),
        to_wallet_id: Number(to),
        amount: value,
        date,
        notes
      })
      toast('Transfer recorded', 'success')
      onSaved()
      onClose()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Transfer"
      description="Move money between your own wallets."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="transfer-form" loading={saving}>
            Transfer
          </Button>
        </div>
      }
    >
      <form id="transfer-form" onSubmit={save} className="space-y-4" noValidate>
        {formError ? (
          <p role="alert" className="text-sm text-red-500 dark:text-red-400">
            {formError}
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From" htmlFor="transfer-from">
            <Select id="transfer-from" value={from} onChange={(event) => setFrom(event.target.value)}>
              {wallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name}
                  {hidden ? '' : ` · ${formatCurrency(wallet.balance)}`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="To" htmlFor="transfer-to">
            <Select id="transfer-to" value={to} onChange={(event) => setTo(event.target.value)}>
              {wallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name}
                  {hidden ? '' : ` · ${formatCurrency(wallet.balance)}`}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount" htmlFor="transfer-amount" error={amountError || undefined}>
            <Input
              id="transfer-amount"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              hasError={Boolean(amountError)}
            />
          </Field>
          <Field label="Date" htmlFor="transfer-date">
            <Input id="transfer-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
        </div>

        <Field label="Notes" htmlFor="transfer-notes">
          <Textarea
            id="transfer-notes"
            placeholder="Optional details"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>

        {valid && fromWallet && toWallet ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-dark-surface-2 dark:text-dark-faint">
            {hidden ? (
              <span>Balances hidden</span>
            ) : (
              <>
                <span>
                  {fromWallet.name}: {formatCurrency(fromWallet.balance - value)}
                </span>
                <span>
                  {toWallet.name}: {formatCurrency(toWallet.balance + value)}
                </span>
              </>
            )}
          </div>
        ) : null}
      </form>
    </Modal>
  )
}
