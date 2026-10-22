const { spawnSync } = require('node:child_process')
const path = require('node:path')
const result = spawnSync(process.execPath, ['--test', 'src/postgres.integration.test.js'], {
  cwd: path.resolve(__dirname, '../frontend/server'),
  env: { ...process.env, NODE_ENV: 'test', MEDVAULT_TEST_POSTGRES: '1', MEDVAULT_STORAGE: 'postgres' },
  stdio: 'inherit', windowsHide: true,
})
if (result.error) console.error(result.error.message)
process.exitCode = result.status ?? 1
