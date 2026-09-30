import { useState } from 'react'
import { Paperclip } from 'lucide-react'
import { api } from '@renderer/lib/api.js'
import { Button } from './Button.jsx'
import { toast } from '@renderer/store/uiStore.js'

// Optional file (receipt/proof) attach control. `value` is a stored filename.
export function ReceiptField({ value, onChange }) {
  const [busy, setBusy] = useState(false)

  const attach = async () => {
    setBusy(true)
    try {
      const filename = await api.files.selectReceipt()
      if (filename) onChange(filename)
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="secondary" size="sm" onClick={attach} loading={busy}>
        <Paperclip size={15} aria-hidden="true" />
        {value ? 'Replace proof' : 'Attach proof'}
      </Button>
      {value ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
          Remove
        </Button>
      ) : (
        <span className="text-xs text-slate-500 dark:text-gray-400">Optional</span>
      )}
    </div>
  )
}
