// Runs every e2e suite in its own process and prints a summary.
// Needs a built app (`npm run build`) and a Windows desktop session.
//   F2PX_E2E_NETWORK=0  skips checks that need internet access
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { downloadsDir, killAll } from '../helpers/harness.mjs'

const dir = path.dirname(fileURLToPath(import.meta.url))
const only = process.argv[2]
const suites = fs.readdirSync(dir).filter((f) => /^\d+-.*\.mjs$/.test(f)).filter((f) => !only || f.includes(only)).sort()

let failed = 0
for (const suite of suites) {
  console.log(`\n=== ${suite} ===`)
  let result = spawnSync(process.execPath, [path.join(dir, suite)], { stdio: 'inherit' })
  if (result.status !== 0) {
    // UI automation on a live desktop can lose a race (focus, window animations): retry once before failing
    console.log(`\n--- ${suite} failed (status ${result.status}), retrying once ---`)
    killAll()
    await new Promise((r) => setTimeout(r, 2000))
    result = spawnSync(process.execPath, [path.join(dir, suite)], { stdio: 'inherit' })
  }
  if (result.status !== 0) failed++
  killAll()
  await new Promise((r) => setTimeout(r, 1500))
}
// test downloads are named f2px-*; leave the user's own files alone
try {
  for (const f of fs.readdirSync(downloadsDir)) if (f.startsWith('f2px-')) fs.rmSync(path.join(downloadsDir, f), { force: true })
} catch {}
console.log(failed ? `\n${failed} suite(s) FAILED` : '\nAll e2e suites passed')
process.exit(failed ? 1 : 0)
