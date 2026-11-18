const { test, expect, _electron: electron } = require('@playwright/test')
const { source } = require('axe-core')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

async function audit(page) {
  // AxeBuilder opens a second page, which Electron's context does not allow.
  // CSP blocks addScriptTag, but CDP evaluation (page.evaluate) is allowed.
  await page.evaluate(source)
  const results = await page.evaluate(async () =>
    window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] }
    })
  )
  return results.violations.filter((violation) =>
    ['critical', 'serious'].includes(violation.impact)
  )
}

test('wallet page and add-wallet dialog have no serious accessibility violations', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'pocketvault-a11y-wallet-'))
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
    await page.getByLabel('Username').fill('a11ywallet')
    await page.getByLabel('Password', { exact: true }).fill('secret123')
    await page.getByLabel('Confirm password').fill('secret123')
    await page.getByRole('button', { name: 'Create account' }).click()

    await page.getByRole('link', { name: 'Wallet', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Wallet', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Add wallet' }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Wallet type').selectOption('bank')
    await dialog.getByLabel('Bank').selectOption('bdo')
    await dialog.getByLabel('Opening balance').fill('1000')
    await dialog.getByRole('button', { name: 'Add wallet' }).click()
    await expect(dialog).toBeHidden()

    const pageViolations = await audit(page)
    expect(pageViolations, JSON.stringify(pageViolations, null, 2)).toEqual([])

    await page.getByRole('button', { name: 'Add wallet' }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    const dialogViolations = await audit(page)
    expect(dialogViolations, JSON.stringify(dialogViolations, null, 2)).toEqual([])
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
  }
})
