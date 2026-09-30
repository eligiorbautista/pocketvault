import { api } from '@renderer/lib/api.js'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Plus, TrendingDown } from 'lucide-react'
import { EXPENSE_CATEGORIES } from '@shared/constants.js'
import { PageHeader } from '@renderer/components/ui/PageHeader.jsx'
import { Card } from '@renderer/components/ui/Card.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'
import { Field } from '@renderer/components/ui/Field.jsx'
import { Input, Select, Textarea } from '@renderer/components/ui/Input.jsx'
import { Badge } from '@renderer/components/ui/Badge.jsx'
import { DataTable } from '@renderer/components/ui/DataTable.jsx'
import { Pagination } from '@renderer/components/ui/Pagination.jsx'
import { EmptyState } from '@renderer/components/ui/EmptyState.jsx'
import { Modal } from '@renderer/components/ui/Modal.jsx'
import { ConfirmDialog } from '@renderer/components/ui/ConfirmDialog.jsx'
import { categoryLabel, formatCurrency, formatDate, todayInput } from '@renderer/lib/format.js'
import { useApiData } from '@renderer/hooks/useApiData.js'
import { toast } from '@renderer/store/uiStore.js'

const EMPTY_FILTERS = { search: '', category: '', from: '', to: '', order: 'newest' }

function ExpenseForm({ open, initial, onClose, onSaved }) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting }
  } = useForm()
  const category = watch('category')

  useEffect(() => {
    if (open) {
      const known = EXPENSE_CATEGORIES.some((c) => c.value === initial?.category)
      reset({
        category: !initial ? 'food' : known ? initial.category : '__custom__',
        customCategory: initial && !known ? initial.category : '',
        amount: initial?.amount ?? '',
        date: initial?.date ?? todayInput(),
        notes: initial?.notes ?? ''
      })
    }
  }, [open, initial, reset])

  const onSubmit = async (values) => {
    const resolvedCategory =
      values.category === '__custom__' ? values.customCategory.trim() : values.category
    const payload = {
      category: resolvedCategory,
      amount: Number(values.amount),
      date: values.date,
      notes: values.notes
    }
    try {
      if (initial) await api.expenses.update(initial.id, payload)
      else await api.expenses.create(payload)
      toast(initial ? 'Expense updated' : 'Expense added', 'success')
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
      title={initial ? 'Edit expense' : 'Add expense'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="expense-form" loading={isSubmitting}>
            {initial ? 'Save changes' : 'Add expense'}
          </Button>
        </div>
      }
    >
      <form id="expense-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="category" required>
            <Select id="category" {...register('category', { required: true })}>
              {EXPENSE_CATEGORIES.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
              <option value="__custom__">Custom…</option>
            </Select>
          </Field>
          {category === '__custom__' ? (
            <Field
              label="Custom category"
              htmlFor="customCategory"
              error={errors.customCategory?.message}
              required
            >
              <Input
                id="customCategory"
                placeholder="e.g. Pet care"
                hasError={Boolean(errors.customCategory)}
                {...register('customCategory', {
                  required: category === '__custom__' ? 'Enter a category name' : false
                })}
              />
            </Field>
          ) : null}
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
        </div>

        <Field label="Date" htmlFor="date" error={errors.date?.message} required>
          <Input
            id="date"
            type="date"
            hasError={Boolean(errors.date)}
            {...register('date', { required: 'Date is required' })}
          />
        </Field>

        <Field label="Notes" htmlFor="notes">
          <Textarea id="notes" placeholder="Optional details" {...register('notes')} />
        </Field>
      </form>
    </Modal>
  )
}

export default function Expenses() {
  const [page, setPage] = useState(1)
  const [draft, setDraft] = useState(EMPTY_FILTERS)
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const { data, loading, error, reload } = useApiData(
    () => api.expenses.list({ page, ...filters }),
    [page, filters]
  )
  const categoriesQuery = useApiData(() => api.expenses.categories(), [])

  const rows = data?.rows ?? []

  // Built-in categories plus any custom categories already in use, so the
  // filter dropdown can select them too.
  const filterCategories = [
    ...EXPENSE_CATEGORIES,
    ...(categoriesQuery.data ?? [])
      .filter((value) => !EXPENSE_CATEGORIES.some((option) => option.value === value))
      .map((value) => ({ value, label: value }))
  ]

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
      await api.expenses.remove(pendingDelete.id)
      toast('Expense archived', 'success')
      setPendingDelete(null)
      if (rows.length === 1 && page > 1) setPage(page - 1)
      else reload()
      categoriesQuery.reload()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setDeleting(false)
    }
  }

  const columns = [
    { key: 'date', header: 'Date', render: (row) => formatDate(row.date) },
    {
      key: 'category',
      header: 'Category',
      render: (row) => <Badge>{categoryLabel(row.category)}</Badge>
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (row) => <span className="font-medium text-slate-900 dark:text-gray-100">{formatCurrency(row.amount)}</span>
    },
    {
      key: 'notes',
      header: 'Notes',
      mobile: false,
      className: 'max-w-xs',
      render: (row) => <span className="line-clamp-1 text-slate-500 dark:text-gray-400">{row.notes || '\u2014'}</span>
    }
  ]

  const rowActions = (row) => [
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
        title="Expenses"
        description="Review spending by category and keep records tidy."
        actions={
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus size={16} aria-hidden="true" />
            Add expense
          </Button>
        }
      />

      <Card>
        <form onSubmit={applyFilters} className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Search" htmlFor="expense-search">
            <Input
              id="expense-search"
              placeholder="Notes"
              value={draft.search}
              onChange={(event) => setDraft((prev) => ({ ...prev, search: event.target.value }))}
            />
          </Field>
          <Field label="Category" htmlFor="expense-category">
            <Select
              id="expense-category"
              value={draft.category}
              onChange={(event) => setDraft((prev) => ({ ...prev, category: event.target.value }))}
            >
              <option value="">All categories</option>
              {filterCategories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From" htmlFor="expense-from">
            <Input
              id="expense-from"
              type="date"
              value={draft.from}
              onChange={(event) => setDraft((prev) => ({ ...prev, from: event.target.value }))}
            />
          </Field>
          <Field label="To" htmlFor="expense-to">
            <Input
              id="expense-to"
              type="date"
              value={draft.to}
              onChange={(event) => setDraft((prev) => ({ ...prev, to: event.target.value }))}
            />
          </Field>
          <Field label="Sort" htmlFor="expense-order">
            <Select
              id="expense-order"
              value={draft.order}
              onChange={(event) => setDraft((prev) => ({ ...prev, order: event.target.value }))}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </Select>
          </Field>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
            <Button type="submit" size="sm">
              Apply filters
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
              Reset
            </Button>
          </div>
        </form>

        {error ? (
          <p role="alert" className="px-4 pb-4 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}

        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          loading={loading}
          actions={rowActions}
          onRowClick={(row) => {
            setEditing(row)
            setFormOpen(true)
          }}
          onRowClickLabel="Edit expense"
          emptyState={
            <EmptyState
              icon={TrendingDown}
              title="No expenses recorded"
              description="Add an expense to see where your money goes."
              action={
                <Button
                  onClick={() => {
                    setEditing(null)
                    setFormOpen(true)
                  }}
                >
                  <Plus size={16} aria-hidden="true" />
                  Add expense
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

      <ExpenseForm
        open={formOpen}
        initial={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          reload()
          categoriesQuery.reload()
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Archive expense?"
        message="This moves the expense to the Archive. You can restore it anytime from the Archive page."
        confirmLabel="Archive"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
