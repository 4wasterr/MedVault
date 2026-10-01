import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { connect } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const clientRoot = path.join(frontendRoot, 'client')
const serverRoot = path.join(frontendRoot, 'server')
const clientUrl = 'http://localhost:5173/'
const apiUrl = 'http://localhost:5000/api/health'

function isListeningOn(port, host) {
  return new Promise((resolve) => {
    const socket = connect({ port, host })
    socket.setTimeout(750)
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(false))
    socket.once('timeout', () => { socket.destroy(); resolve(false) })
  })
}

async function portIsBusy(port) {
  const results = await Promise.all([isListeningOn(port, '127.0.0.1'), isListeningOn(port, '::1')])
  return results.some(Boolean)
}

async function serviceStatus(name) {
  try {
    if (name === 'api') {
      const response = await fetch(apiUrl, { signal: AbortSignal.timeout(3000) })
      const body = await response.json()
      if (response.ok && body.message === 'MedVault API is running') return 'running'
    } else {
      const [page, app] = await Promise.all([
        fetch(clientUrl, { signal: AbortSignal.timeout(3000) }),
        fetch(`${clientUrl}src/App.jsx`, { signal: AbortSignal.timeout(3000) }),
      ])
      if (page.ok && app.ok && (await page.text()).includes('<title>MedVault</title>') &&
        (await app.text()).includes('AdminDashboard')) return 'running'
    }
  } catch { /* A missing service is checked below. */ }
  return (await portIsBusy(name === 'api' ? 5000 : 5173)) ? 'occupied' : 'stopped'
}

const [clientStatus, apiStatus] = await Promise.all([serviceStatus('client'), serviceStatus('api')])
if (clientStatus === 'occupied' || apiStatus === 'occupied') {
  const port = clientStatus === 'occupied' ? 5173 : 5000
  console.error(`Port ${port} is occupied by a service that is not serving this MedVault app. Close that service, then run npm run dev again.`)
  process.exitCode = 1
} else if (clientStatus === 'running' && apiStatus === 'running') {
  console.log(`MedVault is already running at ${clientUrl}`)
} else {
  const children = []
  let stopping = false
  function stopAll(exitCode) {
    if (stopping) return
    stopping = true
    for (const child of children) if (child.exitCode === null) child.kill('SIGTERM')
    process.exitCode = exitCode
  }
  process.on('SIGINT', () => stopAll(0))
  process.on('SIGTERM', () => stopAll(0))

  function start(name, cwd, binary, args) {
    if (!existsSync(binary)) {
      console.error(`${name} dependencies are missing. Run npm install in ${cwd} and try again.`)
      stopAll(1)
      return
    }
    console.log(`Starting MedVault ${name}...`)
    const child = spawn(process.execPath, [binary, ...args], { cwd, stdio: 'inherit', windowsHide: true })
    children.push(child)
    child.on('error', (error) => { console.error(`${name} could not start: ${error.message}`); stopAll(1) })
    child.on('exit', (code) => {
      if (!stopping) { console.error(`${name} stopped${code ? ` (exit ${code})` : ''}.`); stopAll(code || 1) }
    })
  }

  if (apiStatus === 'stopped') start('API', serverRoot, path.join(serverRoot, 'node_modules/nodemon/bin/nodemon.js'), ['src/index.js'])
  if (!stopping && clientStatus === 'stopped') start('frontend', clientRoot, path.join(clientRoot, 'node_modules/vite/bin/vite.js'), [])
  if (!stopping) console.log(`Open ${clientUrl} when the startup messages appear.`)
}
