const { defineConfig } = require('@playwright/test')

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  outputDir: 'test-results'
})
