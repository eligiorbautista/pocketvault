import { Fragment } from 'react'
import { LoadingBlock } from './Spinner.jsx'
import { cn } from '@renderer/lib/cn.js'

function isActionColumn(column) {
  return column.action === true || column.key === 'actions'
}

export function DataTable({ columns, rows, getRowKey, loading, emptyState }) {
  if (loading) return <LoadingBlock />
  if (!rows || rows.length === 0) return emptyState ?? null

  const dataColumns = columns.filter((column) => !isActionColumn(column))
  const actionColumns = columns.filter(isActionColumn)

  return (
    <>
      {/* Desktop / tablet: premium horizontal table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    'px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500',
                    column.align === 'right' && 'text-right',
                    column.className
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={getRowKey(row)}
                className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      'px-4 py-3 text-slate-700',
                      column.align === 'right' && 'text-right',
                      column.className
                    )}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: stackable card list (no table header, key-value rows) */}
      <div className="space-y-4 p-4 md:hidden">
        {rows.map((row) => (
          <div
            key={getRowKey(row)}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <dl className="space-y-2.5">
              {dataColumns.map((column) => (
                <div key={column.key} className="flex items-start justify-between gap-4">
                  <dt className="shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {column.header}
                  </dt>
                  <dd className="min-w-0 text-right text-sm text-slate-700">
                    {column.render(row)}
                  </dd>
                </div>
              ))}
            </dl>

            {actionColumns.length ? (
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
                {actionColumns.map((column) => (
                  <Fragment key={column.key}>{column.render(row)}</Fragment>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </>
  )
}
