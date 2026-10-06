import { LoadingBlock } from './Spinner.jsx'
import { RowActionsMenu } from './RowActionsMenu.jsx'
import { ErrorState } from './ErrorState.jsx'
import { cn } from '@renderer/lib/cn.js'

// Renders a responsive table:
//  - Desktop/tablet (md+): horizontal table with an ellipsis row-actions menu.
//  - Mobile (<md): elevated stackable cards, tap-to-view, with a text action footer.
//
// `actions`  : (row) => [{ key, label, tone?: 'danger', onSelect, mobile?: false }]
// `onRowClick`: (row) => void  — makes the whole mobile card body the "view" trigger.
// `error`    : when set, an error + retry is shown instead of the empty state.
export function DataTable({
  columns,
  rows,
  getRowKey,
  loading,
  error,
  onRetry,
  emptyState,
  actions,
  onRowClick,
  onRowClickLabel = 'View details'
}) {
  if (loading) return <LoadingBlock />
  if (error) return <ErrorState message={error} onRetry={onRetry} />
  if (!rows || rows.length === 0) return emptyState ?? null

  const resolveActions = typeof actions === 'function' ? actions : () => actions ?? []
  const hasActions = Boolean(actions)
  const mobileColumns = columns.filter((column) => column.mobile !== false)

  return (
    <>
      {/* Desktop / tablet: premium horizontal table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-gray-700">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    'px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400',
                    column.align === 'right' && 'text-right',
                    column.className
                  )}
                >
                  {column.header}
                </th>
              ))}
              {hasActions ? (
                <th scope="col" className="w-14 px-3 py-3 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={getRowKey(row)}
                className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50 dark:border-gray-800 dark:hover:bg-white/5"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      'px-4 py-3 text-slate-700 dark:text-gray-200',
                      column.align === 'right' && 'text-right',
                      column.className
                    )}
                  >
                    {column.render(row)}
                  </td>
                ))}
                {hasActions ? (
                  <td className="px-3 py-2 text-right">
                    <RowActionsMenu actions={resolveActions(row)} />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: stackable cards elevated on the page background */}
      <div className="space-y-3 bg-slate-50 p-3 dark:bg-dark-bg md:hidden">
        {rows.map((row) => {
          const mobileActions = resolveActions(row).filter(
            (action) => action && action.mobile !== false
          )
          const clickable = Boolean(onRowClick)
          return (
            <div
              key={getRowKey(row)}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-[#333333]"
            >
              <div
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                aria-label={clickable ? onRowClickLabel : undefined}
                onClick={clickable ? () => onRowClick(row) : undefined}
                onKeyDown={
                  clickable
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onRowClick(row)
                        }
                      }
                    : undefined
                }
                className={cn(
                  'p-4',
                  clickable &&
                    'cursor-pointer transition-colors hover:bg-slate-50 active:bg-slate-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-600 dark:hover:bg-white/5 dark:active:bg-white/10 dark:focus-visible:outline-accent-400'
                )}
              >
                <dl className="space-y-2.5">
                  {mobileColumns.map((column) => (
                    <div key={column.key} className="flex items-start justify-between gap-4">
                      <dt className="shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-gray-500">
                        {column.header}
                      </dt>
                      <dd className="min-w-0 text-right text-sm text-slate-700 dark:text-gray-200">
                        {column.render(row)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              {mobileActions.length ? (
                <div className="flex items-center justify-end gap-1 border-t border-gray-100 px-2 py-1.5 dark:border-gray-700">
                  {mobileActions.map((action) => (
                    <button
                      key={action.key}
                      type="button"
                      onClick={() => action.onSelect?.()}
                      className={cn(
                        'flex min-h-11 cursor-pointer items-center rounded-lg px-3 text-sm font-medium transition-colors',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 dark:focus-visible:outline-accent-400',
                        action.tone === 'danger'
                          ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40'
                          : 'text-slate-600 hover:bg-slate-100 dark:text-gray-300 dark:hover:bg-white/10'
                      )}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </>
  )
}
