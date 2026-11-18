const { test, expect, _electron: electron } = require('@playwright/test')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

test('mobile shell uses bottom tabs, grouped More page, and quick add', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'pocketvault-mobile-'))
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
    await page.setViewportSize({ width: 390, height: 844 })

    await page.getByRole('link', { name: 'Create one' }).click()
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
    await page.getByLabel('Username').fill('mobileuser')
    await page.getByLabel('Password', { exact: true }).fill('secret123')
    await page.getByLabel('Confirm password').fill('secret123')
    await page.getByRole('button', { name: 'Create account' }).click()

    const nav = page.getByRole('navigation', { name: 'Mobile navigation' })
    await expect(nav).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Home' })).toBeVisible()

    await nav.getByRole('link', { name: 'More' }).click()
    await expect(page.getByRole('heading', { name: 'More' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Income' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible()

    await page.getByRole('button', { name: 'Quick add' }).click()
    const sheet = page.getByRole('dialog', { name: 'Quick add' })
    await expect(sheet).toBeVisible()
    await sheet.getByRole('button', { name: 'Add wallet' }).click()

    await expect(page.getByRole('heading', { name: 'Wallet', exact: true })).toBeVisible()
    const walletDialog = page.getByRole('dialog', { name: 'Add wallet' })
    await expect(walletDialog).toBeVisible()
    await expect(walletDialog.getByLabel('Wallet type')).toBeVisible()
    await walletDialog.getByRole('button', { name: 'Cancel' }).click()

    await page.getByRole('button', { name: 'Quick add' }).click()
    await page.getByRole('button', { name: 'Add income' }).click()
    const incomeDialog = page.getByRole('dialog', { name: 'Add income' })
    await expect(incomeDialog).toBeVisible()
    await expect(incomeDialog.getByLabel('Amount')).toHaveValue('0.00')
    await expect.poll(async () => incomeDialog.getByLabel('Wallet').locator('option').count()).toBeGreaterThan(0)
    await incomeDialog.getByRole('button', { name: 'Cancel' }).click()

    // Native Android shortcuts land on this hash after unlock.
    await page.evaluate(() => {
      window.location.hash = '#/debts?tab=bills&new=1'
    })
    await expect(page.getByRole('dialog', { name: 'Add bill or income' })).toBeVisible()
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
  }
})
