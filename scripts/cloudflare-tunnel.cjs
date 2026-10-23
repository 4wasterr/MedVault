const fs = require('node:fs')
const path = require('node:path')
const net = require('node:net')
const { spawn, spawnSync } = require('node:child_process')
const { prepareTunnelEnvironment, tunnelUrl } = require('./cloudflare-config.cjs')

const root = path.resolve(__dirname, '..')
const serverRoot = path.join(root, 'frontend/server')
const clientRoot = path.join(root, 'frontend/client')
let connector, server, database, building
let stopping = false

async function stop(code = 0) {
  if (stopping) return
  stopping = true
  process.exitCode = code
  if (connector && connector.exitCode === null) connector.kill()
  if (building && building.exitCode === null) building.kill()
  if (server) {
    server.closeIdleConnections()
    await new Promise(resolve => server.close(resolve))
  }
  if (database) await database.close()
}

process.once('SIGINT', () => { stop().catch(console.error) })
process.once('SIGTERM', () => { stop().catch(console.error) })

async function main() {
  console.log('Preparing MedVault for a temporary public HTTPS URL...')
  const env = prepareTunnelEnvironment(root)
  const localBinary = path.join(root, '.tools', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared')
  const binary = env.MEDVAULT_CLOUDFLARED_PATH || (fs.existsSync(localBinary) ? localBinary : 'cloudflared')
  const check = spawnSync(binary, ['--version'], { windowsHide: true, encoding: 'utf8', timeout: 5000 })
  if (check.error || check.status !== 0) throw new Error('cloudflared is not installed. Run npm run tunnel:setup first.')

  // Serve the built UI and API together; no Vite server or database port is published.
  await new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once('error', () => reject(new Error(`Port ${env.PORT} is occupied. Stop the local API or set MEDVAULT_TUNNEL_PORT to another port.`)))
    probe.listen(Number(env.PORT), env.HOST, () => probe.close(resolve))
  })
  Object.assign(process.env, env)
  const { getPostgresConfig } = require(path.join(serverRoot, 'src/storage'))
  const config = getPostgresConfig()
  if (config) {
    const { Pool } = require(path.join(serverRoot, 'node_modules/pg'))
    const pool = new Pool(config)
    try { await pool.query('SELECT 1') }
    catch { throw new Error('The configured PostgreSQL database is unavailable. Start the Linux Mint VM and verify its port forwarding with npm run db:verify. No storage settings were changed.') }
    finally { await pool.end() }
  }
  if (stopping) return
  console.log('Building the frontend...')
  const vite = path.join(clientRoot, 'node_modules/vite/bin/vite.js')
  if (!fs.existsSync(vite)) throw new Error('Frontend dependencies are missing. Run npm ci --prefix frontend/client.')
  await new Promise((resolve, reject) => {
    building = spawn(process.execPath, [vite, 'build'], { cwd: clientRoot, env, stdio: 'inherit', windowsHide: true })
    building.once('error', reject)
    building.once('exit', code => code === 0 ? resolve() : reject(new Error('Frontend build failed.')))
  })
  if (stopping) return

  console.log('Requesting a free Cloudflare Quick Tunnel...')
  // An explicit empty config prevents a personal named-tunnel config from being loaded.
  const configPath = path.join(root, '.tools/quick-tunnel.json')
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, '{}\n')
  const origin = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Cloudflare did not issue a URL within 60 seconds. Check the Internet connection and cloudflared output.')), 60_000)
    let output = ''
    connector = spawn(binary, ['tunnel', '--config', configPath, '--no-autoupdate', '--url', `http://${env.HOST}:${env.PORT}`], {
      cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    })
    const inspect = chunk => {
      const line = chunk.toString()
      process.stderr.write(line)
      output = (output + line).slice(-16_384)
      const url = tunnelUrl(output)
      if (url) { clearTimeout(timer); resolve(url) }
    }
    connector.stdout.on('data', inspect)
    connector.stderr.on('data', inspect)
    connector.once('error', error => { clearTimeout(timer); reject(error) })
    connector.once('exit', code => {
      clearTimeout(timer)
      reject(new Error(`Cloudflare stopped (${code}).`))
      if (!stopping) { console.error('Cloudflare stopped. Closing MedVault.'); stop(1).catch(console.error) }
    })
  })
  if (stopping) return
  process.env.MEDVAULT_PUBLIC_ORIGIN = origin
  const application = await require(path.join(serverRoot, 'src/index')).createApp()
  database = application.db
  if (stopping) { await database.close(); return }
  server = application.app.listen(Number(env.PORT), env.HOST)
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
  const health = await fetch(`http://${env.HOST}:${env.PORT}/api/health`, { headers: { 'X-Forwarded-Proto': 'https' }, signal: AbortSignal.timeout(5000) })
  if (!health.ok) throw new Error('The API health check failed.')
  const healthStatus = await health.json()
  if (config && healthStatus.storage !== 'PostgreSQL') throw new Error('PostgreSQL was configured, but the API did not confirm PostgreSQL storage.')
  console.log(`Database connected: ${healthStatus.storage}${config ? ` (${config.database || 'configured database'})` : ''}. Shared records are saved by the API.`)
  console.log(`\nMedVault public URL: ${origin}`)
  console.log(`Administrator: ${env.MEDVAULT_ADMIN_USERNAME}`)
  console.log(env.MEDVAULT_ADMIN_PASSWORD_FILE ? `Password file (open locally): ${env.MEDVAULT_ADMIN_PASSWORD_FILE}` : 'Password: your configured MEDVAULT_ADMIN_PASSWORD')
  console.log('Keep this terminal, this computer, and the database running. Ctrl+C stops sharing.')
  console.log('After code changes, stop and restart npm run tunnel to rebuild the public app.')
  console.log('Quick Tunnels are temporary previews. The URL changes on restart. Use test data only.')
}

main().catch(async error => {
  if (!stopping) console.error(`Tunnel startup failed: ${error.message}`)
  await stop(1)
})
