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
      include: [
        'src/shared/wallets.js',
        'src/shared/money.js',
        'src/renderer/src/components/wallets/WalletForm.jsx',
        'src/renderer/src/components/wallets/WalletActivity.jsx'
      ],
      thresholds: {
        lines: 55,
        functions: 55,
        branches: 45,
        statements: 55
      }
    }
  }
})
