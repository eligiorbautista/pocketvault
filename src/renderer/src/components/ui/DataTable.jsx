import { LoadingBlock } from './Spinner.jsx'
import { cn } from '@renderer/lib/cn.js'

export function DataTable({ columns, rows, getRowKey, loading, emptyState }) {
  if (loading) return <LoadingBlock />
  if (!rows || rows.length === 0) return emptyState ?? null

  const mobileColumns = columns.filter((column) => column.mobile !== false)

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    'px-4 py-3 font-medium',
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

      <div className="divide-y divide-slate-100 md:hidden">
        {rows.map((row) => (
          <div key={getRowKey(row)} className="space-y-2 p-4">
            {mobileColumns.map((column) => (
              <div key={column.key} className="flex items-start justify-between gap-3">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  {column.header}
                </span>
                <span className="min-w-0 text-right text-sm text-slate-700">
                  {column.render(row)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}
