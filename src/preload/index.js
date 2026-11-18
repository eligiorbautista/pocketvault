import { contextBridge, ipcRenderer } from 'electron'

async function call(channel, payload) {
  const response = await ipcRenderer.invoke(channel, payload)
  if (!response || response.ok !== true) {
    throw new Error(response?.error || 'Request failed')
  }
  return response.data
}

const api = {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  },

  auth: {
    register: (username, password) => call('auth:register', { username, password }),
    login: (username, password) => call('auth:login', { username, password }),
    restore: (userId) => call('auth:restore', { userId }),
    current: () => call('auth:current'),
    logout: () => call('auth:logout'),
    changePassword: (currentPassword, newPassword) =>
      call('auth:changePassword', { currentPassword, newPassword })
  },

  wallets: {
    list: () => call('wallets:list'),
    get: (id) => call('wallets:get', { id }),
    create: (data) => call('wallets:create', data),
    update: (id, data) => call('wallets:update', { id, ...data }),
    remove: (id) => call('wallets:remove', { id }),
    restore: (id) => call('wallets:restore', { id }),
    archived: () => call('wallets:archived'),
    move: (id, direction) => call('wallets:move', { id, direction }),
    summary: () => call('wallets:summary'),
    activity: (walletId, limit) => call('wallets:activity', { walletId, limit }),
    transfer: (data) => call('wallets:transfer', data),
    removeTransfer: (id) => call('wallets:removeTransfer', { id }),
    restoreTransfer: (id) => call('wallets:restoreTransfer', { id }),
    archivedTransfers: () => call('wallets:archivedTransfers')
  },

  income: {
    list: (params) => call('income:list', params),    get: (id) => call('income:get', { id }),
    create: (data) => call('income:create', data),
    update: (id, data) => call('income:update', { id, ...data }),
    remove: (id) => call('income:remove', { id }),
    restore: (id) => call('income:restore', { id }),
    archived: () => call('income:archived'),
    all: (params) => call('income:all', params)
  },

  expenses: {
    list: (params) => call('expenses:list', params),
    get: (id) => call('expenses:get', { id }),
    create: (data) => call('expenses:create', data),
    update: (id, data) => call('expenses:update', { id, ...data }),
    remove: (id) => call('expenses:remove', { id }),
    restore: (id) => call('expenses:restore', { id }),
    archived: () => call('expenses:archived'),
    categories: () => call('expenses:categories')
  },

  debts: {
    list: (params) => call('debts:list', params),
    get: (id) => call('debts:get', { id }),
    create: (data) => call('debts:create', data),
    update: (id, data) => call('debts:update', { id, ...data }),
    remove: (id) => call('debts:remove', { id }),
    restore: (id) => call('debts:restore', { id }),
    archived: () => call('debts:archived'),
    payments: (debtId) => call('debts:payments', { debtId }),
    addPayment: (debtId, data) => call('debts:addPayment', { debtId, ...data }),
    removePayment: (paymentId) => call('debts:removePayment', { paymentId })
  },

  budgets: {
    list: (month) => call('budgets:list', { month }),
    upsert: (data) => call('budgets:upsert', data),
    remove: (id) => call('budgets:remove', { id }),
    restore: (id) => call('budgets:restore', { id }),
    archived: () => call('budgets:archived')
  },

  recurring: {
    list: () => call('recurring:list'),
    create: (data) => call('recurring:create', data),
    update: (id, data) => call('recurring:update', { id, ...data }),
    remove: (id) => call('recurring:remove', { id }),
    restore: (id) => call('recurring:restore', { id }),
    archived: () => call('recurring:archived'),
    post: (id) => call('recurring:post', { id }),
    skip: (id) => call('recurring:skip', { id })
  },

  savings: {
    list: () => call('savings:list'),
    get: (id) => call('savings:get', { id }),
    create: (data) => call('savings:create', data),
    update: (id, data) => call('savings:update', { id, ...data }),
    remove: (id) => call('savings:remove', { id }),
    restore: (id) => call('savings:restore', { id }),
    archived: () => call('savings:archived'),
    contributions: (goalId) => call('savings:contributions', { goalId }),
    addContribution: (goalId, data) => call('savings:addContribution', { goalId, ...data }),
    removeContribution: (contributionId) => call('savings:removeContribution', { contributionId })
  },

  reports: {
    dashboard: (period) => call('reports:dashboard', period),
    monthlyTotals: (period) =>
      call('reports:monthlyTotals', typeof period === 'object' ? period : { year: period }),
    rangeTotals: (params) => call('reports:rangeTotals', params),
    categoryBreakdown: (params) => call('reports:categoryBreakdown', params),
    incomeBySource: (params) => call('reports:incomeBySource', params),
    debtSummary: () => call('reports:debtSummary')
  },

  files: {
    selectReceipt: () => call('files:selectReceipt'),
    readReceipt: (filename) => call('files:readReceipt', { filename }),
    openReceipt: (filename) => call('files:openReceipt', { filename }),
    deleteReceipt: (filename) => call('files:deleteReceipt', { filename }),
    saveExport: (params) => call('files:saveExport', params)
  },

  backup: {
    export: (passphrase) => call('backup:export', { passphrase }),
    import: (passphrase) => call('backup:import', { passphrase })
  },

  account: {
    deleteData: (password) => call('account:deleteData', { password })
  },

  settings: {
    get: () => call('settings:get'),
    update: (patch) => call('settings:update', patch)
  },

  notifications: {
    schedule: (plan) => call('notifications:schedule', { plan }),
    clear: () => call('notifications:clear')
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  window.api = api
}
