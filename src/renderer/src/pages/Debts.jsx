import { useState } from 'react'
import { Eye, HandCoins, Pencil, Plus, Trash2 } from 'lucide-react'
import { DEBT_STATUSES } from '@shared/constants.js'
import { PageHeader, StatCard } from '@renderer/components/ui/PageHeader.jsx'
import { Card } from '@renderer/components/ui/Card.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'
import { Field } from '@renderer/components/ui/Field.jsx'
import { Input, Select } from '@renderer/components/ui/Input.jsx'
import { Badge, statusVariant } from '@renderer/components/ui/Badge.jsx'
import { DataTable } from '@renderer/components/ui/DataTable.jsx'
import { Pagination } from '@renderer/components/ui/Pagination.jsx'
import { EmptyState } from '@renderer/components/ui/EmptyState.jsx'
import { ConfirmDialog } from '@renderer/components/ui/ConfirmDialog.jsx'
import { DebtForm } from '@renderer/components/debts/DebtForm.jsx'
import { DebtDetail } from '@renderer/components/debts/DebtDetail.jsx'
import { formatCurrency, formatDate } from '@renderer/lib/format.js'
import { useApiData } from '@renderer/hooks/useApiData.js'
import { toast } from '@renderer/store/uiStore.js'

const EMPTY_FILTERS = { search: '', status: '', order: 'recent' }

export default function Debts() {
  const [page, setPage] = useState(1)
  const [draft, setDraft] = useState(EMPTY_FILTERS)
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [detailId, setDetailId] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const { data, loading, error, reload } = useApiData(
    () => window.api.debts.list({ page, ...filters }),
    [page, filters]
  )
  const summary = useApiData(() => window.api.reports.debtSummary(), [])

  const rows = data?.rows ?? []

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
      await window.api.debts.remove(pendingDelete.id)
      toast('Debt deleted', 'success')
      setPendingDelete(null)
      if (rows.length === 1 && page > 1) setPage(page - 1)
      else reload()
      summary.reload()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setDeleting(false)
    }
  }

  const columns = [
    { key: 'creditor', header: 'Creditor', render: (row) => <span className="font-medium text-slate-900">{row.creditor}</span> },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      mobile: false,
      render: (row) => formatCurrency(row.total_amount)
    },
    {
      key: 'remaining',
      header: 'Remaining',
      align: 'right',
      render: (row) => <span className="font-medium text-red-600">{formatCurrency(row.remaining_amount)}</span>
    },
    { key: 'due', header: 'Due date', mobile: false, render: (row) => formatDate(row.due_date) },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge variant={statusVariant(row.effective_status)}>{row.effective_status}</Badge>
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`View debt ${row.id}`}
            onClick={() => setDetailId(row.id)}
          >
            <Eye size={16} aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Edit debt ${row.id}`}
            onClick={() => {
              setEditing(row)
              setFormOpen(true)
            }}
          >
            <Pencil size={16} aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Delete debt ${row.id}`}
            onClick={() => setPendingDelete(row)}
          >
            <Trash2 size={16} className="text-red-500" aria-hidden="true" />
          </Button>
        </div>
      )
    }
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Debts"
        description="Track balances, flexible payments and re-borrows."
        actions={
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus size={16} aria-hidden="true" />
            Add debt
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Outstanding"
          value={formatCurrency(summary.data?.outstanding ?? 0)}
          tone="negative"
          loading={summary.loading}
        />
        <StatCard
          label="Total paid"
          value={formatCurrency(summary.data?.paid ?? 0)}
          tone="positive"
          loading={summary.loading}
        />
        <StatCard
          label="Overdue"
          value={`${summary.data?.overdueCount ?? 0} debt(s)`}
          loading={summary.loading}
        />
      </div>

      <Card>
        <form onSubmit={applyFilters} className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Search" htmlFor="debt-search">
            <Input
              id="debt-search"
              placeholder="Creditor or notes"
              value={draft.search}
              onChange={(event) => setDraft((prev) => ({ ...prev, search: event.target.value }))}
            />
          </Field>
          <Field label="Status" htmlFor="debt-status">
            <Select
              id="debt-status"
              value={draft.status}
              onChange={(event) => setDraft((prev) => ({ ...prev, status: event.target.value }))}
            >
              <option value="">All statuses</option>
              {DEBT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sort" htmlFor="debt-order">
            <Select
              id="debt-order"
              value={draft.order}
              onChange={(event) => setDraft((prev) => ({ ...prev, order: event.target.value }))}
            >
              <option value="recent">Recently added</option>
              <option value="due">Due soonest</option>
              <option value="oldest">Oldest first</option>
            </Select>
          </Field>
          <div className="flex items-end gap-2">
            <Button type="submit" size="sm">
              Apply filters
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
              Reset
            </Button>
          </div>
        </form>

        {error ? (
          <p role="alert" className="px-4 pb-4 text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          loading={loading}
          emptyState={
            <EmptyState
              icon={HandCoins}
              title="No debts tracked"
              description="Add a debt to monitor payments and remaining balance."
              action={
                <Button
                  onClick={() => {
                    setEditing(null)
                    setFormOpen(true)
                  }}
                >
                  <Plus size={16} aria-hidden="true" />
                  Add debt
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

      <DebtForm
        open={formOpen}
        initial={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          reload()
          summary.reload()
        }}
      />

      <DebtDetail
        debtId={detailId}
        open={Boolean(detailId)}
        onClose={() => setDetailId(null)}
        onChanged={() => {
          reload()
          summary.reload()
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete debt?"
        message="This removes the debt and its entire payment history from your local database."
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
