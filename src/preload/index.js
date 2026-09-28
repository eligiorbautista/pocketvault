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
    logout: () => call('auth:logout')
  },

  income: {
    list: (params) => call('income:list', params),
    get: (id) => call('income:get', { id }),
    create: (data) => call('income:create', data),
    update: (id, data) => call('income:update', { id, ...data }),
    remove: (id) => call('income:remove', { id }),
    all: (params) => call('income:all', params)
  },

  expenses: {
    list: (params) => call('expenses:list', params),
    get: (id) => call('expenses:get', { id }),
    create: (data) => call('expenses:create', data),
    update: (id, data) => call('expenses:update', { id, ...data }),
    remove: (id) => call('expenses:remove', { id }),
    all: (params) => call('expenses:all', params)
  },

  debts: {
    list: (params) => call('debts:list', params),
    get: (id) => call('debts:get', { id }),
    create: (data) => call('debts:create', data),
    update: (id, data) => call('debts:update', { id, ...data }),
    remove: (id) => call('debts:remove', { id }),
    payments: (debtId) => call('debts:payments', { debtId }),
    addPayment: (debtId, data) => call('debts:addPayment', { debtId, ...data }),
    reborrow: (debtId, data) => call('debts:reborrow', { debtId, ...data }),
    removePayment: (paymentId) => call('debts:removePayment', { paymentId })
  },

  budgets: {
    list: (month) => call('budgets:list', { month }),
    upsert: (data) => call('budgets:upsert', data),
    remove: (id) => call('budgets:remove', { id })
  },

  savings: {
    list: () => call('savings:list'),
    get: (id) => call('savings:get', { id }),
    create: (data) => call('savings:create', data),
    update: (id, data) => call('savings:update', { id, ...data }),
    remove: (id) => call('savings:remove', { id }),
    contributions: (goalId) => call('savings:contributions', { goalId }),
    addContribution: (goalId, data) => call('savings:addContribution', { goalId, ...data }),
    removeContribution: (contributionId) => call('savings:removeContribution', { contributionId })
  },

  reports: {
    dashboard: (month) => call('reports:dashboard', { month }),
    monthlyTotals: (year) => call('reports:monthlyTotals', { year }),
    rangeTotals: (params) => call('reports:rangeTotals', params),
    categoryBreakdown: (params) => call('reports:categoryBreakdown', params),
    incomeBySource: (params) => call('reports:incomeBySource', params),
    debtSummary: () => call('reports:debtSummary'),
    monthRange: (month) => call('reports:monthRange', { month })
  },

  files: {
    selectReceipt: () => call('files:selectReceipt'),
    readReceipt: (filename) => call('files:readReceipt', { filename }),
    openReceipt: (filename) => call('files:openReceipt', { filename }),
    deleteReceipt: (filename) => call('files:deleteReceipt', { filename }),
    saveExport: (params) => call('files:saveExport', params)
  },

  backup: {
    export: () => call('backup:export'),
    import: () => call('backup:import')
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  window.api = api
}
