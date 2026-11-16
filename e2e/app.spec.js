const { test, expect, _electron: electron } = require('@playwright/test')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

// Full desktop flow through the real preload bridge, IPC, SQLite, and renderer.
// The app is launched with an isolated userData directory and without the
// single-instance lock (see src/main/index.js).
test('register, add a wallet, record income, spend, transfer, and open activity', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'pocketvault-e2e-'))
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      POCKETVAULT_E2E: '1',
      POCKETVAULT_USER_DATA: userData
    }
  })

  try {
    const page = await app.firstWindow()
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()

    await page.getByRole('link', { name: 'Create one' }).click()
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
    await page.getByLabel('Username').fill('e2euser')
    await page.getByLabel('Password', { exact: true }).fill('secret123')
    await page.getByLabel('Confirm password').fill('secret123')
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page.getByRole('link', { name: 'Wallet' })).toBeVisible()
    await page.getByRole('link', { name: 'Wallet' }).click()
    await expect(page.getByRole('heading', { name: 'Wallet', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Add wallet' }).first().click()
    const walletDialog = page.getByRole('dialog')
    await expect(walletDialog).toBeVisible()
    await walletDialog.getByLabel('Wallet').selectOption('bdo')
    await expect(walletDialog.getByLabel('Name')).toHaveValue('BDO')
    await walletDialog.getByLabel('Opening balance').fill('1000')
    await walletDialog.getByRole('button', { name: 'Add wallet' }).click()
    await expect(walletDialog).toBeHidden()

    await expect(page.getByRole('button', { name: /BDO, balance/ })).toBeVisible()
    await expect(page.getByText(/1,000\.00/).first()).toBeVisible()

    await page.getByRole('link', { name: 'Income' }).click()
    await page.getByRole('button', { name: 'Add income' }).first().click()
    const incomeDialog = page.getByRole('dialog')
    await expect(incomeDialog).toBeVisible()
    await incomeDialog.getByLabel('Amount').fill('500')
    await incomeDialog.getByLabel('Wallet').selectOption({ label: 'BDO' })
    await incomeDialog.getByRole('button', { name: 'Add income' }).click()
    await expect(incomeDialog).toBeHidden()

    // Spend from the same wallet, then move money out of it.
    await page.getByRole('link', { name: 'Expenses' }).click()
    await page.getByRole('button', { name: 'Add expense' }).first().click()
    const expenseDialog = page.getByRole('dialog')
    await expect(expenseDialog).toBeVisible()
    await expenseDialog.getByLabel('Amount').fill('200')
    await expenseDialog.getByLabel('Wallet').selectOption({ label: 'BDO' })
    await expenseDialog.getByRole('button', { name: 'Add expense' }).click()
    await expect(expenseDialog).toBeHidden()

    await page.getByRole('link', { name: 'Wallet' }).click()
    await expect(page.getByRole('button', { name: /BDO, balance.*1,300\.00/ })).toBeVisible()

    await page.getByRole('button', { name: 'BDO actions' }).click()
    await page.getByRole('menuitem', { name: 'Transfer' }).click()
    const transferDialog = page.getByRole('dialog')
    await expect(transferDialog).toBeVisible()
    await transferDialog.getByLabel('Amount').fill('300')
    await transferDialog.getByRole('button', { name: 'Transfer' }).click()
    await expect(transferDialog).toBeHidden()

    await expect(page.getByRole('button', { name: /BDO, balance.*1,000\.00/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Cash, balance.*300\.00/ })).toBeVisible()

    await page.getByRole('button', { name: /^BDO, balance/ }).click()
    const activity = page.getByRole('dialog')
    await expect(activity.getByText('Transfer out')).toBeVisible()
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
  }
})
