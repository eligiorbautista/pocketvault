import { useState } from 'react'
import { Database, Download, Info, LogOut, Upload, User } from 'lucide-react'
import { PageHeader } from '@renderer/components/ui/PageHeader.jsx'
import { Card, CardBody, CardHeader, CardTitle } from '@renderer/components/ui/Card.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'
import { ConfirmDialog } from '@renderer/components/ui/ConfirmDialog.jsx'
import { useAuthStore } from '@renderer/store/authStore.js'
import { toast } from '@renderer/store/uiStore.js'

export default function Settings() {
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const [busy, setBusy] = useState(null)
  const [confirmImport, setConfirmImport] = useState(false)

  const exportBackup = async () => {
    setBusy('export')
    try {
      const result = await window.api.backup.export()
      if (result.saved) toast('Backup exported', 'success')
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const importBackup = async () => {
    setBusy('import')
    try {
      const result = await window.api.backup.import()
      setConfirmImport(false)
      if (result.imported) {
        toast('Backup imported. Please sign in again.', 'success')
        await logout()
      }
    } catch (error) {
      toast(error.message, 'error')
      setConfirmImport(false)
    } finally {
      setBusy(null)
    }
  }

  const versions = window.api?.versions ?? {}

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description="Profile, backups and application info." />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex items-center gap-2">
            <User size={16} className="text-slate-400" aria-hidden="true" />
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Username</p>
              <p className="text-sm font-medium text-slate-800">{user?.username}</p>
            </div>
            <p className="text-xs text-slate-500">
              Your password is stored only as a local hash (bcrypt) on this device.
            </p>
            <Button variant="secondary" size="sm" onClick={logout}>
              <LogOut size={16} aria-hidden="true" />
              Sign out
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center gap-2">
            <Database size={16} className="text-slate-400" aria-hidden="true" />
            <CardTitle>Data backup</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <p className="text-sm text-slate-600">
              Export a ZIP containing your database and receipts, or restore from a previous backup.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={exportBackup} loading={busy === 'export'}>
                <Download size={16} aria-hidden="true" />
                Export backup
              </Button>
              <Button
                variant="secondary"
                onClick={() => setConfirmImport(true)}
                loading={busy === 'import'}
              >
                <Upload size={16} aria-hidden="true" />
                Import backup
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center gap-2">
            <Info size={16} className="text-slate-400" aria-hidden="true" />
            <CardTitle>About</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">App version</dt>
                <dd className="text-slate-800">0.1.0</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Electron</dt>
                <dd className="text-slate-800">{versions.electron ?? '\u2014'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Chromium</dt>
                <dd className="text-slate-800">{versions.chrome ?? '\u2014'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Node</dt>
                <dd className="text-slate-800">{versions.node ?? '\u2014'}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              PocketVault is fully offline. No internet connection, cloud sync or telemetry is used.
            </p>
          </CardBody>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmImport}
        title="Import backup?"
        message="Importing replaces your entire local database and receipts with the contents of the backup file. This cannot be undone. You will be signed out afterwards."
        confirmLabel="Replace my data"
        loading={busy === 'import'}
        onConfirm={importBackup}
        onCancel={() => setConfirmImport(false)}
      />
    </div>
  )
}
