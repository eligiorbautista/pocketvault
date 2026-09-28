import { registerAuthHandlers } from './auth.ipc.js'
import { registerIncomeHandlers } from './income.ipc.js'
import { registerExpensesHandlers } from './expenses.ipc.js'
import { registerDebtsHandlers } from './debts.ipc.js'
import { registerBudgetsHandlers } from './budgets.ipc.js'
import { registerSavingsHandlers } from './savings.ipc.js'
import { registerReportsHandlers } from './reports.ipc.js'
import { registerFilesHandlers } from './files.ipc.js'
import { registerBackupHandlers } from './backup.ipc.js'
import { registerDataHandlers } from './data.ipc.js'

export function registerIpcHandlers() {
  registerAuthHandlers()
  registerIncomeHandlers()
  registerExpensesHandlers()
  registerDebtsHandlers()
  registerBudgetsHandlers()
  registerSavingsHandlers()
  registerReportsHandlers()
  registerFilesHandlers()
  registerBackupHandlers()
  registerDataHandlers()
}
