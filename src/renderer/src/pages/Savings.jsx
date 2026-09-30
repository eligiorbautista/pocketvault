import { api } from '@renderer/lib/api.js'
import { useState } from 'react'
import { CalendarClock, Plus, Target } from 'lucide-react'
import { PageHeader } from '@renderer/components/ui/PageHeader.jsx'
import { Card } from '@renderer/components/ui/Card.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'
import { Badge } from '@renderer/components/ui/Badge.jsx'
import { ProgressBar } from '@renderer/components/ui/ProgressBar.jsx'
import { EmptyState } from '@renderer/components/ui/EmptyState.jsx'
import { LoadingBlock } from '@renderer/components/ui/Spinner.jsx'
import { ConfirmDialog } from '@renderer/components/ui/ConfirmDialog.jsx'
import { SavingsGoalForm } from '@renderer/components/savings/SavingsGoalForm.jsx'
import { SavingsDetail } from '@renderer/components/savings/SavingsDetail.jsx'
import { formatCurrency, formatDate } from '@renderer/lib/format.js'
import { useApiData } from '@renderer/hooks/useApiData.js'
import { toast } from '@renderer/store/uiStore.js'

export default function Savings() {
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [detailId, setDetailId] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const { data, loading, error, reload } = useApiData(() => api.savings.list(), [])
  const goals = data ?? []

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await api.savings.remove(pendingDelete.id)
      toast('Goal archived', 'success')
      setPendingDelete(null)
      reload()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Savings"
        description="Set targets, track progress and link contributions to income."
        actions={
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus size={16} aria-hidden="true" />
            New goal
          </Button>
        }
      />

      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {loading ? (
        <Card>
          <LoadingBlock />
        </Card>
      ) : goals.length === 0 ? (
        <Card>
          <EmptyState
            icon={Target}
            title="No savings goals yet"
            description="Create a goal to start setting money aside."
            action={
              <Button
                onClick={() => {
                  setEditing(null)
                  setFormOpen(true)
                }}
              >
                <Plus size={16} aria-hidden="true" />
                New goal
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {goals.map((goal) => (
            <Card key={goal.id} className="flex flex-col p-4">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-gray-100">{goal.goal_name}</p>
                  <p className="text-xs text-slate-500 dark:text-gray-400">
                    {formatCurrency(goal.current_amount)} of {formatCurrency(goal.target_amount)}
                  </p>
                </div>
                {goal.complete ? <Badge variant="success">Complete</Badge> : null}
              </div>

              <ProgressBar percent={goal.percent} />
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-gray-400">
                <span>{Math.round(goal.percent)}% funded</span>
                {goal.deadline ? (
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock size={13} aria-hidden="true" />
                    {formatDate(goal.deadline)}
                  </span>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-gray-800">
                <Button size="sm" onClick={() => setDetailId(goal.id)}>
                  Contribute
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(goal)
                    setFormOpen(true)
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                  onClick={() => setPendingDelete(goal)}
                >
                  Archive
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <SavingsGoalForm
        open={formOpen}
        initial={editing}
        onClose={() => setFormOpen(false)}
        onSaved={reload}
      />

      <SavingsDetail
        goalId={detailId}
        open={Boolean(detailId)}
        onClose={() => setDetailId(null)}
        onChanged={reload}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Archive savings goal?"
        message="This moves the goal and its contributions to the Archive. You can restore it anytime from the Archive page."
        confirmLabel="Archive"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
