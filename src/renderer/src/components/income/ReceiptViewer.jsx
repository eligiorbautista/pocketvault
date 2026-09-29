import { api } from '@renderer/lib/api.js'
import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Modal } from '@renderer/components/ui/Modal.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'
import { LoadingBlock } from '@renderer/components/ui/Spinner.jsx'
import { toast } from '@renderer/store/uiStore.js'

export function ReceiptViewer({ filename, open, onClose }) {
  const [receipt, setReceipt] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open || !filename) {
      setReceipt(null)
      setError(null)
      return
    }
    let active = true
    setLoading(true)
    setError(null)
    api.files
      .readReceipt(filename)
      .then((result) => {
        if (active) setReceipt(result)
      })
      .catch((err) => {
        if (active) setError(err.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [open, filename])

  const openExternally = async () => {
    try {
      await api.files.openReceipt(filename)
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Receipt"
      size="lg"
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={openExternally}>
            <ExternalLink size={16} aria-hidden="true" />
            Open in system viewer
          </Button>
        </div>
      }
    >
      {loading ? <LoadingBlock label="Loading receipt..." /> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {receipt ? (
        receipt.mime === 'application/pdf' ? (
          <iframe
            title="Receipt PDF"
            src={receipt.dataUrl}
            className="h-[60vh] w-full rounded-lg border border-slate-200"
          />
        ) : (
          <img
            src={receipt.dataUrl}
            alt="Receipt"
            className="mx-auto max-h-[60vh] w-auto rounded-lg border border-slate-200 object-contain"
          />
        )
      ) : null}
    </Modal>
  )
}
