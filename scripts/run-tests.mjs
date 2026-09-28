// Runs all repository/service smoke tests. Each is bundled with esbuild (so the
// ESM sources load under Node) and executed. Cross-platform (Windows included).
import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'

const tests = [
  { name: 'db', entry: 'scripts/db-smoke.mjs', external: ['better-sqlite3'] },
  { name: 'backup', entry: 'scripts/backup-smoke.mjs', external: ['better-sqlite3', 'jszip'] },
  { name: 'audit', entry: 'scripts/audit-smoke.mjs', external: ['better-sqlite3'] }
]

const outputs = []
let failed = false

for (const test of tests) {
  const out = `.pv-${test.name}.cjs`
  outputs.push(out)
  const external = test.external.map((name) => `--external:${name}`).join(' ')
  console.log(`\n=== ${test.name} smoke test ===`)
  try {
    execSync(
      `npx esbuild ${test.entry} --bundle --platform=node --format=cjs ${external} --outfile="${out}"`,
      { stdio: 'inherit', shell: true }
    )
    execSync(`node "${out}"`, { stdio: 'inherit', shell: true })
  } catch {
    failed = true
  }
}

for (const out of outputs) rmSync(out, { force: true })

if (failed) {
  console.error('\nSome smoke tests failed.')
  process.exit(1)
}
console.log('\nAll smoke tests passed.')
