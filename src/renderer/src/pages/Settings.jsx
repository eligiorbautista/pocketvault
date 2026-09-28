import { useState } from 'react'
import {
  BarChart3,
  Database,
  Download,
  HandCoins,
  Info,
  KeyRound,
  LogOut,
  PiggyBank,
  Receipt,
  TrendingUp,
  Upload,
  User,
  Wallet
} from 'lucide-react'
import { PageHeader } from '@renderer/components/ui/PageHeader.jsx'
import { Card, CardBody, CardHeader, CardTitle } from '@renderer/components/ui/Card.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'
import { ConfirmDialog } from '@renderer/components/ui/ConfirmDialog.jsx'
import { ChangePasswordForm } from '@renderer/components/settings/ChangePasswordForm.jsx'
import { useAuthStore } from '@renderer/store/authStore.js'
import { toast } from '@renderer/store/uiStore.js'

const FEATURES = [
  { icon: TrendingUp, label: 'Track income and expenses' },
  { icon: Receipt, label: 'Attach receipts to income records' },
  { icon: HandCoins, label: 'Manage debts and payments' },
  { icon: Wallet, label: 'Set monthly budgets with alerts' },
  { icon: PiggyBank, label: 'Create and fund savings goals' },
  { icon: BarChart3, label: 'View reports and export data' },
  { icon: Database, label: 'Back up and restore your data' }
]

export default function Settings() {
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const [busy, setBusy] = useState(null)
  const [confirmImport, setConfirmImport] = useState(false)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)

  const exportBackup = async () => {
    setBusy('export')
    try {
      const result = await window.api.backup.export()
      if (result.saved) {
        toast('Backup exported', 'success', {
          description: 'The file contains only this account\u2019s data.'
        })
      }
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
        toast('Backup imported', 'success', {
          description: 'This account\u2019s data was restored.'
        })
      }
    } catch (error) {
      toast(error.message, 'error')
      setConfirmImport(false)
    } finally {
      setBusy(null)
    }
  }

  const VERSION = '0.1.0'

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
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setChangePasswordOpen(true)}>
                <KeyRound size={16} aria-hidden="true" />
                Change password
              </Button>
              <Button variant="secondary" size="sm" onClick={logout}>
                <LogOut size={16} aria-hidden="true" />
                Sign out
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center gap-2">
            <Database size={16} className="text-slate-400" aria-hidden="true" />
            <CardTitle>Data backup</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <p className="text-sm text-slate-600">
              Export a backup of this account, or restore a previous one. Backups are tied to your
              username and never include other accounts.
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
          <CardBody className="space-y-4">
            <p className="max-w-2xl text-sm text-slate-600">
              PocketVault keeps your money organized in one place so you always know what came in,
              where it went, and what you are working toward.
            </p>
            <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-50 text-accent-700">
                    <Icon size={15} aria-hidden="true" />
                  </span>
                  <span className="text-sm text-slate-700">{label}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-400">Version {VERSION}</p>
          </CardBody>
        </Card>
      </div>

      <ChangePasswordForm
        open={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
      />

      <ConfirmDialog
        open={confirmImport}
        title="Import backup?"
        message="Importing replaces all data in this account with the backup's contents. This cannot be undone. Other accounts are not affected."
        confirmLabel="Replace account data"
        loading={busy === 'import'}
        onConfirm={importBackup}
        onCancel={() => setConfirmImport(false)}
      />
    </div>
  )
}
