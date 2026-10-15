const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

async function run() {
  const local = !process.env.MEDVAULT_LOAD_URL
  let fixture, server, db
  if (local) {
    fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'medvault-load-'))
    process.env.MEDVAULT_DB_PATH = path.join(fixture, 'test.sqlite')
    const application = await require('../src/index').createApp({ seedDemo: true })
    db = application.db
    server = application.app.listen(0, '127.0.0.1')
    await new Promise(resolve => server.once('listening', resolve))
  }
  const base = local ? `http://127.0.0.1:${server.address().port}` : process.env.MEDVAULT_LOAD_URL.replace(/\/$/, '')
  const username = local ? 'user2' : process.env.MEDVAULT_LOAD_USERNAME
  const password = local ? 'user2' : process.env.MEDVAULT_LOAD_PASSWORD
  if (!username || !password) throw new Error('Set MEDVAULT_LOAD_USERNAME and MEDVAULT_LOAD_PASSWORD for the test server.')
  try {
    const csrf = await fetch(`${base}/api/csrf`)
    const { csrfToken } = await csrf.json()
    const csrfCookie = csrf.headers.get('set-cookie').split(';')[0]
    const login = await fetch(`${base}/api/login`, { method: 'POST', headers: {
      Cookie: csrfCookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken,
    }, body: JSON.stringify({ username, password }) })
    if (!login.ok) throw new Error('Load-test account could not sign in.')
    const headers = { Cookie: login.headers.get('set-cookie').split(';')[0] }
    const requests = Math.min(1000, Math.max(1, Number(process.env.MEDVAULT_LOAD_REQUESTS || 200)))
    const concurrency = Math.min(50, Math.max(1, Number(process.env.MEDVAULT_LOAD_CONCURRENCY || 20)))
    let sent = 0, successful = 0
    const latencies = []
    const started = performance.now()
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (sent++ < requests) {
        const time = performance.now()
        const response = await fetch(`${base}/api/state`, { headers })
        await response.arrayBuffer()
        if (response.ok) successful++
        latencies.push(performance.now() - time)
      }
    }))
    const durationMs = performance.now() - started
    latencies.sort((a, b) => a - b)
    const percentile = value => Math.round(latencies[Math.max(0, Math.ceil(latencies.length * value) - 1)] * 100) / 100
    const result = { measuredAt: new Date().toISOString(), mode: local ? 'local SQLite test fixture' : 'configured test server',
      node: process.version, requests, concurrency, successful, successRate: successful / requests,
      p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99),
      requestsPerSecond: Math.round(requests / (durationMs / 1000) * 100) / 100 }
    const output = path.resolve(__dirname, '../../../output/security')
    fs.mkdirSync(output, { recursive: true })
    fs.writeFileSync(path.join(output, 'load-results.json'), JSON.stringify(result, null, 2))
    console.log(JSON.stringify(result, null, 2))
    if (successful !== requests) process.exitCode = 1
  } finally {
    if (server) await new Promise(resolve => server.close(resolve))
    if (db) await db.close()
    if (fixture && path.resolve(fixture).startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(fixture, { recursive: true, force: true })
  }
}
run().catch(error => { console.error(error.message); process.exitCode = 1 })
