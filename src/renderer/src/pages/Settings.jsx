import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  BarChart3,
  Coins,
  Database,
  Download,
  HandCoins,
  Info,
  KeyRound,
  LogOut,
  PiggyBank,
  Receipt,
  ShieldCheck,
  Trash2,
  TrendingUp,
  Upload,
  User,
  Wallet
} from 'lucide-react'
import { PageHeader } from '@renderer/components/ui/PageHeader.jsx'
import { Card, CardBody, CardHeader, CardIcon, CardTitle } from '@renderer/components/ui/Card.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'
import { Field, SettingRow } from '@renderer/components/ui/Field.jsx'
import { Select, Switch } from '@renderer/components/ui/Input.jsx'
import { ConfirmDialog } from '@renderer/components/ui/ConfirmDialog.jsx'
import { ChangePasswordForm } from '@renderer/components/settings/ChangePasswordForm.jsx'
import { DeleteDataForm } from '@renderer/components/settings/DeleteDataForm.jsx'
import { useAuthStore } from '@renderer/store/authStore.js'
import { useSettingsStore } from '@renderer/store/settingsStore.js'
import { currencyCodes, currencyName, currencySymbol } from '@shared/currency.js'
import { formatCurrency } from '@renderer/lib/format.js'
import { toast } from '@renderer/store/uiStore.js'

const VERSION = '0.1.0'

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
  const navigate = useNavigate()
  const [busy, setBusy] = useState(null)
  const [confirmImport, setConfirmImport] = useState(false)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [deleteDataOpen, setDeleteDataOpen] = useState(false)
  const currency = useSettingsStore((state) => state.currency)
  const requirePasswordOnStart = useSettingsStore((state) => state.requirePasswordOnStart)

  const changeCurrency = async (event) => {
    const next = event.target.value
    try {
      await useSettingsStore.getState().update({ currency: next })
      toast('Currency updated', 'success', { description: formatCurrency(1234.56) })
    } catch (error) {
      toast(error.message, 'error')
    }
  }

  const toggleRequirePassword = async (next) => {
    try {
      await useSettingsStore.getState().update({ requirePasswordOnStart: next })
      toast(
        next ? 'Password will be required on startup' : 'Password no longer required on startup',
        'success'
      )
    } catch (error) {
      toast(error.message, 'error')
    }
  }

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

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage your account, preferences and data." />

      <Card>
        <CardHeader>
          <CardIcon icon={User} />
          <CardTitle>Account &amp; Security</CardTitle>
        </CardHeader>
        <CardBody className="py-2">
          <SettingRow title="Username" description="The name you sign in with.">
            <span className="text-sm font-medium text-slate-700">{user?.username}</span>
          </SettingRow>

          <SettingRow title="Password" description="Change the password for this account.">
            <Button variant="secondary" size="sm" onClick={() => setChangePasswordOpen(true)}>
              <KeyRound size={16} aria-hidden="true" />
              Change password
            </Button>
          </SettingRow>

          <SettingRow
            title="Require password on startup"
            description="Ask for your password each time PocketVault opens."
          >
            <Switch
              checked={requirePasswordOnStart}
              onChange={toggleRequirePassword}
              aria-label="Require password on startup"
            />
          </SettingRow>

          <SettingRow title="Sign out" description="End your session on this device." last>
            <Button variant="secondary" size="sm" onClick={logout}>
              <LogOut size={16} aria-hidden="true" />
              Sign out
            </Button>
          </SettingRow>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardIcon icon={Coins} />
          <CardTitle>Preferences</CardTitle>
        </CardHeader>
        <CardBody className="py-2">
          <SettingRow
            title="Currency"
            description={`Formatting example: ${formatCurrency(1234.56)}`}
            htmlFor="settings-currency"
            last
          >
            <Select
              id="settings-currency"
              value={currency}
              onChange={changeCurrency}
              className="sm:w-72"
            >
              {currencyCodes().map((code) => (
                <option key={code} value={code}>
                  {code} — {currencyName(code)} ({currencySymbol(code)})
                </option>
              ))}
            </Select>
          </SettingRow>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardIcon icon={Database} />
          <CardTitle>Data &amp; Backup</CardTitle>
        </CardHeader>
        <CardBody className="py-2">
          <SettingRow
            title="Export backup"
            description="Save a ZIP of this account's records and receipts."
          >
            <Button onClick={exportBackup} loading={busy === 'export'}>
              <Download size={16} aria-hidden="true" />
              Export backup
            </Button>
          </SettingRow>

          <SettingRow
            title="Import backup"
            description="Restore this account from a previous backup."
            last
          >
            <Button
              variant="secondary"
              onClick={() => setConfirmImport(true)}
              loading={busy === 'import'}
            >
              <Upload size={16} aria-hidden="true" />
              Import backup
            </Button>
          </SettingRow>

          <div className="mt-2 border-t border-red-100 pt-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                  <AlertTriangle size={18} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-medium text-red-700">Delete all data</p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Permanently delete every record and receipt in this account. Your account and
                    password are kept.
                  </p>
                </div>
              </div>
              <Button variant="danger" size="sm" onClick={() => setDeleteDataOpen(true)}>
                <Trash2 size={16} aria-hidden="true" />
                Delete all data
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardIcon icon={Info} />
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="max-w-2xl text-sm text-slate-600">
            PocketVault keeps your money organized in one place so you always know what came in,
            where it went, and what you are working toward.
          </p>
          <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-50 text-accent-700">
                  <Icon size={15} aria-hidden="true" />
                </span>
                <span className="text-sm text-slate-700">{label}</span>
              </li>
            ))}
          </ul>
          <p className="border-t border-slate-100 pt-4 text-xs text-slate-400">
            PocketVault v{VERSION}
          </p>
        </CardBody>
      </Card>

      <ChangePasswordForm
        open={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
      />

      <DeleteDataForm
        open={deleteDataOpen}
        onClose={() => setDeleteDataOpen(false)}
        onDeleted={() => navigate('/')}
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
