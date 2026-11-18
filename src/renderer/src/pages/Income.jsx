import { useSearchParams } from 'react-router-dom'
import { api } from '@renderer/lib/api.js'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Plus, Receipt, TrendingUp } from 'lucide-react'
import { INCOME_SOURCES } from '@shared/constants.js'
import { PageHeader } from '@renderer/components/ui/PageHeader.jsx'
import { Card } from '@renderer/components/ui/Card.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'
import { Field } from '@renderer/components/ui/Field.jsx'
import { Input, Select, Textarea } from '@renderer/components/ui/Input.jsx'
import { DataTable } from '@renderer/components/ui/DataTable.jsx'
import { Pagination } from '@renderer/components/ui/Pagination.jsx'
import { EmptyState } from '@renderer/components/ui/EmptyState.jsx'
import { Modal } from '@renderer/components/ui/Modal.jsx'
import { ConfirmDialog } from '@renderer/components/ui/ConfirmDialog.jsx'
import { ReceiptViewer } from '@renderer/components/income/ReceiptViewer.jsx'
import { formatCurrency, formatDate, todayInput } from '@renderer/lib/format.js'
import { useApiData } from '@renderer/hooks/useApiData.js'
import { toast } from '@renderer/store/uiStore.js'

const EMPTY_FILTERS = { search: '', from: '', to: '', order: 'newest' }

function IncomeForm({ open, initial, wallets, archivedWallets = [], onClose, onSaved }) {
  const [receiptPath, setReceiptPath] = useState(null)
  const [attaching, setAttaching] = useState(false)
  const cashId = wallets.find((wallet) => wallet.name === 'Cash')?.id ?? wallets[0]?.id ?? ''
  const archivedName = archivedWallets.find((wallet) => wallet.id === initial?.wallet_id)?.name
  const options =
    initial?.wallet_id && !wallets.some((wallet) => wallet.id === initial.wallet_id)
      ? [...wallets, { id: initial.wallet_id, name: archivedName ?? 'Archived wallet' }]
      : wallets
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm()

  useEffect(() => {
    if (open) {
      reset({
        wallet_id: String(initial?.wallet_id ?? cashId),
        amount: initial?.amount ?? '',
        date: initial?.date ?? todayInput(),
        source: initial?.source ?? '',
        notes: initial?.notes ?? ''
      })
      setReceiptPath(initial?.receipt_path ?? null)
    }
  }, [open, initial, reset, cashId])

  const attachReceipt = async () => {
    setAttaching(true)
    try {
      const filename = await api.files.selectReceipt()
      if (filename) setReceiptPath(filename)
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      setAttaching(false)
    }
  }

  const onSubmit = async (values) => {
    const payload = {
      wallet_id: Number(values.wallet_id),
      amount: Number(values.amount),
      date: values.date,
      source: values.source,
      notes: values.notes,
      receipt_path: receiptPath
    }
    try {
      const saved = initial
        ? await api.income.update(initial.id, payload)
        : await api.income.create(payload)

      if (
        initial?.receipt_path &&
        initial.receipt_path !== saved.receipt_path &&
        initial.receipt_path !== receiptPath
      ) {
        api.files.deleteReceipt(initial.receipt_path).catch(() => {})
      }

      toast(initial ? 'Income updated' : 'Income added', 'success')
      onSaved()
      onClose()
    } catch (error) {
      toast(error.message, 'error')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Edit income' : 'Add income'}
      description="Record money received."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="income-form" loading={isSubmitting}>
            {initial ? 'Save changes' : 'Add income'}
          </Button>
        </div>
      }
    >
      <form id="income-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount" htmlFor="amount" error={errors.amount?.message} required>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="0.00"
              hasError={Boolean(errors.amount)}
              {...register('amount', {
                required: 'Amount is required',
                validate: (value) => Number(value) > 0 || 'Amount must be greater than zero'
              })}
            />
          </Field>
          <Field label="Date" htmlFor="date" error={errors.date?.message} required>
            <Input
              id="date"
              type="date"
              hasError={Boolean(errors.date)}
              {...register('date', { required: 'Date is required' })}
            />
          </Field>
        </div>

        <Field label="Wallet" htmlFor="income-wallet" error={errors.wallet_id?.message}>
          <Select
            id="income-wallet"
            hasError={Boolean(errors.wallet_id)}
            {...register('wallet_id', { required: 'Wallet is required' })}
          >
            {options.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {wallet.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Source" htmlFor="source" hint="Optional. e.g. Salary, Freelance.">
          <Input
            id="source"
            list="income-sources"
            placeholder="Salary"
            {...register('source')}
          />
          <datalist id="income-sources">
            {INCOME_SOURCES.map((source) => (
              <option key={source} value={source} />
            ))}
          </datalist>
        </Field>

        <Field label="Notes" htmlFor="notes">
          <Textarea id="notes" placeholder="Optional details" {...register('notes')} />
        </Field>

        <div className="rounded-lg border border-slate-200 p-3 dark:border-dark-border">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-700 dark:text-gray-200">Receipt</p>
              <p className="truncate text-xs text-slate-500 dark:text-dark-faint">
                {receiptPath ? receiptPath : 'No file attached (image or PDF)'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={attachReceipt}
                loading={attaching}
                type="button"
              >
                <Receipt size={16} aria-hidden="true" />
                {receiptPath ? 'Replace' : 'Attach'}
              </Button>
              {receiptPath ? (
                <Button variant="ghost" size="sm" type="button" onClick={() => setReceiptPath(null)}>
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </form>
    </Modal>
  )
}

export default function Income() {
  const [page, setPage] = useState(1)
  const [draft, setDraft] = useState(EMPTY_FILTERS)
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [viewingReceipt, setViewingReceipt] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    if (searchParams.get('new') !== '1') return
    setEditing(null)
    setFormOpen(true)
    const next = new URLSearchParams(searchParams)
    next.delete('new')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const { data, loading, error, reload } = useApiData(
    () => api.income.list({ page, ...filters }),
    [page, filters]
  )
  const walletsQuery = useApiData(() => api.wallets.list(), [])
  const archivedWalletsQuery = useApiData(() => api.wallets.archived(), [])

  const rows = data?.rows ?? []
  const wallets = walletsQuery.data ?? []
  const archivedWallets = archivedWalletsQuery.data ?? []
  const walletName = (id) =>
    [...wallets, ...archivedWallets].find((wallet) => wallet.id === id)?.name ?? 'Wallet'

  const applyFilters = (event) => {
    event.preventDefault()
    setFilters({ ...draft, search: draft.search.trim() })
    setPage(1)
  }

  const resetFilters = () => {
    setDraft(EMPTY_FILTERS)
    setFilters(EMPTY_FILTERS)
    setPage(1)
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await api.income.remove(pendingDelete.id)
      toast('Income archived', 'success')
      setPendingDelete(null)
      if (rows.length === 1 && page > 1) setPage(page - 1)
      else reload()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setDeleting(false)
    }
  }

  const columns = [
    { key: 'date', header: 'Date', render: (row) => formatDate(row.date) },
    { key: 'wallet', header: 'Wallet', render: (row) => walletName(row.wallet_id) },
    { key: 'source', header: 'Source', render: (row) => row.source || '\u2014' },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (row) => <span className="font-medium text-accent-700 dark:text-accent-400">{formatCurrency(row.amount)}</span>
    },
    {
      key: 'notes',
      header: 'Notes',
      mobile: false,
      className: 'max-w-xs',
      render: (row) => <span className="line-clamp-1 text-slate-500 dark:text-dark-faint">{row.notes || '\u2014'}</span>
    }
  ]

  const rowActions = (row) => [
    row.receipt_path
      ? {
          key: 'receipt',
          label: 'View receipt',
          onSelect: () => setViewingReceipt(row.receipt_path)
        }
      : null,
    {
      key: 'edit',
      label: 'Edit',
      onSelect: () => {
        setEditing(row)
        setFormOpen(true)
      }
    },
    { key: 'archive', label: 'Archive', tone: 'danger', onSelect: () => setPendingDelete(row) }
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Income"
        description="Track every peso coming in, with optional receipts."
        actions={
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus size={16} aria-hidden="true" />
            Add income
          </Button>
        }
      />

      <Card>
        <form onSubmit={applyFilters} className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Search" htmlFor="income-search">
            <Input
              id="income-search"
              placeholder="Source or notes"
              value={draft.search}
              onChange={(event) => setDraft((prev) => ({ ...prev, search: event.target.value }))}
            />
          </Field>
          <Field label="From" htmlFor="income-from">
            <Input
              id="income-from"
              type="date"
              value={draft.from}
              onChange={(event) => setDraft((prev) => ({ ...prev, from: event.target.value }))}
            />
          </Field>
          <Field label="To" htmlFor="income-to">
            <Input
              id="income-to"
              type="date"
              value={draft.to}
              onChange={(event) => setDraft((prev) => ({ ...prev, to: event.target.value }))}
            />
          </Field>
          <Field label="Sort" htmlFor="income-order">
            <Select
              id="income-order"
              value={draft.order}
              onChange={(event) => setDraft((prev) => ({ ...prev, order: event.target.value }))}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </Select>
          </Field>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
            <Button type="submit" size="sm">
              Apply filters
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
              Reset
            </Button>
          </div>
        </form>

        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          loading={loading}
          error={error}
          onRetry={reload}
          actions={rowActions}
          onRowClick={(row) => {
            setEditing(row)
            setFormOpen(true)
          }}
          onRowClickLabel="Edit income"
          emptyState={
            <EmptyState
              icon={TrendingUp}
              title="No income recorded"
              description="Add your first income entry to start tracking your balance."
              action={
                <Button
                  onClick={() => {
                    setEditing(null)
                    setFormOpen(true)
                  }}
                >
                  <Plus size={16} aria-hidden="true" />
                  Add income
                </Button>
              }
            />
          }
        />

        {data ? (
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            pageSize={data.pageSize}
            onChange={setPage}
          />
        ) : null}
      </Card>

      <IncomeForm
        open={formOpen}
        initial={editing}
        wallets={wallets}
        archivedWallets={archivedWallets}
        onClose={() => setFormOpen(false)}
        onSaved={reload}
      />

      <ReceiptViewer
        open={Boolean(viewingReceipt)}
        filename={viewingReceipt}
        onClose={() => setViewingReceipt(null)}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Archive income record?"
        message="This moves the record to the Archive. You can restore it anytime from the Archive page."
        confirmLabel="Archive"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
