const { test, expect, _electron: electron } = require('@playwright/test')
const { source } = require('axe-core')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

test('login screen has no serious accessibility violations', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'pocketvault-a11y-'))
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
    // AxeBuilder opens a second page, which Electron's context does not allow.
    // CSP blocks addScriptTag, but CDP evaluation (page.evaluate) is allowed.
    await page.evaluate(source)
    const results = await page.evaluate(async () => {
      return window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] }
      })
    })
    const serious = results.violations.filter((violation) =>
      ['critical', 'serious'].includes(violation.impact)
    )
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([])
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
  }
})
