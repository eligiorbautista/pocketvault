import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      // Focused on the wallet math and wallet UI. Repositories/services are
      // covered by the smoke suites; this gate catches regressions in the
      // modules that unit tests can exercise quickly.
      include: [
        'src/shared/*.js',
        'src/renderer/src/components/wallets/WalletCard.jsx',
        'src/renderer/src/components/wallets/WalletForm.jsx',
        'src/renderer/src/components/wallets/WalletActivity.jsx',
        'src/renderer/src/components/wallets/TransferForm.jsx'
      ],
      exclude: ['**/*.test.js', '**/*.test.jsx'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 99,
        statements: 100
      }
    }
  }
})
