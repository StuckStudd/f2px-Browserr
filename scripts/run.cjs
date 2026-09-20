// Launcher for electron-vite / electron. VS Code (and similar Electron hosts) export
// ELECTRON_RUN_AS_NODE=1, which makes Electron start as a plain Node binary instead of an app.
const { spawn } = require('node:child_process')
const path = require('node:path')

delete process.env.ELECTRON_RUN_AS_NODE

const [tool, ...args] = process.argv.slice(2)
const bins = {
  'electron-vite': path.join(__dirname, '..', 'node_modules', 'electron-vite', 'bin', 'electron-vite.js'),
  electron: path.join(__dirname, '..', 'node_modules', 'electron', 'cli.js')
}
if (!bins[tool]) {
  console.error(`Unknown tool "${tool}"`)
  process.exit(1)
}

const child = spawn(process.execPath, [bins[tool], ...args], { stdio: 'inherit', env: process.env })
child.on('exit', (code) => process.exit(code ?? 0))
