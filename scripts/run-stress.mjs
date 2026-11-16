import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'

const out = '.pv-stress.cjs'
try {
  execSync(
    `npx esbuild scripts/stress-smoke.mjs --bundle --platform=node --format=cjs --external:better-sqlite3 --outfile="${out}"`,
    { stdio: 'inherit', shell: true }
  )
  execSync(`node "${out}"`, { stdio: 'inherit', shell: true })
} finally {
  rmSync(out, { force: true })
}
