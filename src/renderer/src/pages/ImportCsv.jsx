import { useRef, useState } from 'react'
import { FileUp, Upload } from 'lucide-react'
import { api } from '@renderer/lib/api.js'
import { useApiData } from '@renderer/hooks/useApiData.js'
import { PageHeader } from '@renderer/components/ui/PageHeader.jsx'
import { Card } from '@renderer/components/ui/Card.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'
import { EmptyState } from '@renderer/components/ui/EmptyState.jsx'
import { toast } from '@renderer/store/uiStore.js'
import { formatCurrency } from '@renderer/lib/format.js'
import { CSV_HEADERS, parseCsv } from '@shared/csv.js'

function resolveWallet(wallets, name) {
  const match = wallets.find((wallet) => wallet.name.toLowerCase() === name.toLowerCase())
  return match ?? wallets.find((wallet) => wallet.type === 'cash') ?? wallets[0]
}

export default function ImportCsv() {
  const walletsQuery = useApiData(() => api.wallets.list(), [])
  const wallets = walletsQuery.data ?? []
  const inputRef = useRef(null)
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState([])
  const [errors, setErrors] = useState([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  const choose = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setPreview([])
      setErrors(['The CSV is larger than 5 MB.'])
      return
    }
    setResult(null)
    setFileName(file.name)
    try {
      const parsed = parseCsv(await file.text())
      setPreview(parsed.rows)
      setErrors(parsed.errors)
    } catch {
      setPreview([])
      setErrors(['Could not read that file.'])
    }
  }

  const runImport = async () => {
    if (!preview.length || busy) return
    setBusy(true)
    let imported = 0
    const failed = []
    for (const row of preview) {
      const wallet = resolveWallet(wallets, row.wallet)
      if (!wallet) {
        failed.push(`Line ${row.line}: no wallet available`)
        continue
      }
      try {
        if (row.type === 'income') {
          await api.income.create({
            wallet_id: wallet.id,
            amount: row.amount,
            date: row.date,
            source: row.category === 'other' ? 'Imported' : row.category,
            notes: row.notes || null,
            receipt_path: null
          })
        } else {
          await api.expenses.create({
            wallet_id: wallet.id,
            category: row.category,
            amount: row.amount,
            date: row.date,
            notes: row.notes || null
          })
        }
        imported += 1
      } catch (error) {
        failed.push(`Line ${row.line}: ${error.message}`)
      }
    }
    setBusy(false)
    setResult({ imported, failed })
    setPreview([])
    if (imported) toast(`${imported} transaction${imported === 1 ? '' : 's'} imported`, 'success')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import CSV"
        description="Bring income and expenses from a spreadsheet. Nothing is written until you review it."
      />

      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={choose}
          />
          <Button type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
            <FileUp size={16} aria-hidden="true" />
            Choose CSV
          </Button>
          {fileName ? <span className="text-sm text-slate-500 dark:text-dark-muted">{fileName}</span> : null}
        </div>
        <p className="mt-3 text-xs text-slate-500 dark:text-dark-muted">
          Required columns: {CSV_HEADERS.join(', ')}. Use YYYY-MM-DD dates; type is income or expense.
          Wallet names that are not found fall back to Cash.
        </p>
      </Card>

      {errors.length ? (
        <Card className="border-red-200 p-4 dark:border-red-900/60">
          <p className="text-sm font-medium text-red-600 dark:text-red-400">
            {errors.length} row{errors.length === 1 ? '' : 's'} could not be read
          </p>
          <ul className="mt-2 space-y-1 text-xs text-red-600 dark:text-red-400">
            {errors.slice(0, 8).map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {preview.length ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 dark:border-dark-border">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-gray-100">
                {preview.length} ready to import
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-dark-muted">
                Showing the first 20 rows.
              </p>
            </div>
            <Button type="button" onClick={runImport} loading={busy}>
              <Upload size={16} aria-hidden="true" />
              Import {preview.length}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-dark-surface-2 dark:text-dark-faint">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Wallet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-dark-rule">
                {preview.slice(0, 20).map((row) => (
                  <tr key={row.line}>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-gray-300">{row.date}</td>
                    <td className="px-4 py-3 capitalize text-slate-600 dark:text-gray-300">{row.type}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900 dark:text-gray-100">
                      {formatCurrency(row.amount)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-gray-300">{row.category}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-gray-300">
                      {resolveWallet(wallets, row.wallet)?.name ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <EmptyState
          icon={FileUp}
          title="No CSV selected"
          description="Choose a file to preview its rows before importing."
        />
      )}

      {result ? (
        <Card className="p-4">
          <p className="text-sm font-medium text-slate-900 dark:text-gray-100">
            Imported {result.imported} transaction{result.imported === 1 ? '' : 's'}.
          </p>
          {result.failed.length ? (
            <ul className="mt-2 space-y-1 text-xs text-red-600 dark:text-red-400">
              {result.failed.slice(0, 8).map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}
    </div>
  )
}
