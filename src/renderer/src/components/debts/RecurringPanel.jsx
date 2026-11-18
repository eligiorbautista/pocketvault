import { useEffect, useState } from 'react'
import { api } from '@renderer/lib/api.js'
import { EXPENSE_CATEGORIES } from '@shared/constants.js'
import { Button } from '@renderer/components/ui/Button.jsx'
import { Card, CardBody } from '@renderer/components/ui/Card.jsx'
import { ConfirmDialog } from '@renderer/components/ui/ConfirmDialog.jsx'
import { EmptyState } from '@renderer/components/ui/EmptyState.jsx'
import { Field } from '@renderer/components/ui/Field.jsx'
import { Input, Select } from '@renderer/components/ui/Input.jsx'
import { Modal } from '@renderer/components/ui/Modal.jsx'
import { LoadingBlock } from '@renderer/components/ui/Spinner.jsx'
import { ErrorState } from '@renderer/components/ui/ErrorState.jsx'
import { useApiData } from '@renderer/hooks/useApiData.js'
import { formatCurrency, formatDate, todayInput } from '@renderer/lib/format.js'
import { toast } from '@renderer/store/uiStore.js'
import { CalendarClock, Plus } from 'lucide-react'
import { RECURRING_FREQUENCIES, RECURRING_KINDS } from '@shared/recurring.js'

const KIND_LABELS = { bill: 'Bill', subscription: 'Subscription', income: 'Income' }

function RuleForm({ open, initial, wallets, onClose, onSaved }) {
  const [values, setValues] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    const cash = wallets.find((wallet) => wallet.type === 'cash')?.id ?? wallets[0]?.id ?? ''
    setValues(
      initial
        ? {
            name: initial.name,
            kind: initial.kind,
            wallet_id: String(initial.wallet_id),
            category: initial.category ?? 'other',
            amount: String(initial.amount),
            frequency: initial.frequency,
            next_due: initial.next_due,
            reminder_days: String(initial.reminder_days)
          }
        : {
            name: '',
            kind: 'bill',
            wallet_id: String(cash),
            category: 'other',
            amount: '',
            frequency: 'monthly',
            next_due: todayInput(),
            reminder_days: '3'
          }
    )
    setError(null)
  }, [open, initial, wallets])

  if (!values) return null
  const set = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }))

  const save = async (event) => {
    event.preventDefault()
    setError(null)
    if (!values.name.trim()) return setError('Name is required')
    if (!(Number(values.amount) > 0)) return setError('Amount must be greater than zero')
    setBusy(true)
    try {
      const payload = {
        name: values.name.trim(),
        kind: values.kind,
        wallet_id: Number(values.wallet_id),
        category: values.kind === 'income' ? null : values.category,
        amount: Number(values.amount),
        frequency: values.frequency,
        next_due: values.next_due,
        reminder_days: Number(values.reminder_days)
      }
      if (initial) await api.recurring.update(initial.id, payload)
      else await api.recurring.create(payload)
      toast(initial ? 'Bill updated' : 'Bill added', 'success')
      onSaved()
      onClose()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Edit bill' : 'Add bill or income'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" form="recurring-form" loading={busy}>Save</Button>
        </div>
      }
    >
      <form id="recurring-form" onSubmit={save} className="space-y-4" noValidate>
        {error ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        <Field label="Name" htmlFor="recurring-name">
          <Input id="recurring-name" value={values.name} onChange={set('name')} placeholder="e.g. Rent, Netflix" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" htmlFor="recurring-kind">
            <Select id="recurring-kind" value={values.kind} onChange={set('kind')}>
              {RECURRING_KINDS.map((kind) => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}
            </Select>
          </Field>
          <Field label="Amount" htmlFor="recurring-amount">
            <Input id="recurring-amount" type="number" step="0.01" min="0" inputMode="decimal" value={values.amount} onChange={set('amount')} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Wallet" htmlFor="recurring-wallet">
            <Select id="recurring-wallet" value={values.wallet_id} onChange={set('wallet_id')}>
              {wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}
            </Select>
          </Field>
          <Field label="Frequency" htmlFor="recurring-frequency">
            <Select id="recurring-frequency" value={values.frequency} onChange={set('frequency')}>
              {RECURRING_FREQUENCIES.map((frequency) => <option key={frequency} value={frequency}>{frequency[0].toUpperCase() + frequency.slice(1)}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Next due" htmlFor="recurring-due">
            <Input id="recurring-due" type="date" value={values.next_due} onChange={set('next_due')} />
          </Field>
          <Field label="Remind me (days)" htmlFor="recurring-reminder">
            <Input id="recurring-reminder" type="number" min="0" max="30" value={values.reminder_days} onChange={set('reminder_days')} />
          </Field>
        </div>
        {values.kind !== 'income' ? (
          <Field label="Category" htmlFor="recurring-category">
            <Select id="recurring-category" value={values.category} onChange={set('category')}>
              {EXPENSE_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
            </Select>
          </Field>
        ) : null}
      </form>
    </Modal>
  )
}

export function RecurringPanel() {
  const { data, loading, error, reload } = useApiData(() => api.recurring.list(), [])
  const walletsQuery = useApiData(() => api.wallets.list(), [])
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [pending, setPending] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const rules = data ?? []
  const wallets = walletsQuery.data ?? []
  const today = todayInput()

  const act = async (rule, action) => {
    setBusyId(rule.id)
    try {
      if (action === 'post') {
        await api.recurring.post(rule.id)
        toast('Bill posted to the wallet', 'success')
      } else {
        await api.recurring.skip(rule.id)
        toast('Bill skipped', 'success')
      }
      reload()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusyId(null)
    }
  }

  const archive = async () => {
    if (!pending) return
    try {
      await api.recurring.remove(pending.id)
      toast('Bill archived', 'success')
      setPending(null)
      reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-gray-100">Bills &amp; recurring</h2>
          <p className="text-sm text-slate-600 dark:text-dark-muted">Post a bill when it is due; nothing is automatic.</p>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true) }}>
          <Plus size={16} aria-hidden="true" /> Add bill
        </Button>
      </div>
      {loading ? <LoadingBlock /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {!loading && !error && rules.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No recurring bills" description="Add rent, subscriptions or recurring income to see what is due next." />
      ) : null}
      {rules.map((rule) => {
        const due = rule.next_due <= today
        return (
          <Card key={rule.id}>
            <CardBody className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 dark:text-gray-100">{rule.name}</p>
                <p className="text-xs text-slate-600 dark:text-dark-muted">
                  {KIND_LABELS[rule.kind]} · {formatCurrency(rule.amount)} · {rule.frequency} · next {formatDate(rule.next_due)}
                  {due ? ' · due' : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => act(rule, 'post')} loading={busyId === rule.id}>Post now</Button>
                <Button size="sm" variant="secondary" onClick={() => act(rule, 'skip')} disabled={busyId === rule.id}>Skip</Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(rule); setFormOpen(true) }}>Edit</Button>
                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setPending(rule)}>Archive</Button>
              </div>
            </CardBody>
          </Card>
        )
      })}
      <RuleForm open={formOpen} initial={editing} wallets={wallets} onClose={() => setFormOpen(false)} onSaved={reload} />
      <ConfirmDialog open={Boolean(pending)} title="Archive bill?" message="It stops appearing in Bills; you can restore it from Archive." confirmLabel="Archive" onConfirm={archive} onCancel={() => setPending(null)} />
    </div>
  )
}
