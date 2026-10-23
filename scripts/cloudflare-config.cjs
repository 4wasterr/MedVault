const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const dotenv = require('../frontend/server/node_modules/dotenv')

function ensureSecret(filename, generate) {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 })
  try { fs.writeFileSync(filename, generate(), { flag: 'wx', mode: 0o600 }) }
  catch (error) { if (error.code !== 'EEXIST') throw error }
  return filename
}

function prepareTunnelEnvironment(root, input = process.env) {
  const env = { ...input }
  const serverRoot = path.join(root, 'frontend/server')
  dotenv.config({
    path: [path.join(serverRoot, '.env'), path.join(root, 'frontend/.env'), path.join(root, '.env')],
    processEnv: env, quiet: true,
  })
  env.NODE_ENV = 'production'
  env.HOST = '127.0.0.1'
  env.PORT = env.MEDVAULT_TUNNEL_PORT || env.PORT || '5000'
  if (!/^\d+$/.test(env.PORT) || Number(env.PORT) < 1 || Number(env.PORT) > 65535) throw new Error('Set MEDVAULT_TUNNEL_PORT to a port between 1 and 65535.')
  env.MEDVAULT_DB_PATH = path.resolve(serverRoot, env.MEDVAULT_DB_PATH || 'data/medvault_storage.db')
  const dataDirectory = path.dirname(env.MEDVAULT_DB_PATH)
  for (const key of ['MEDVAULT_ENCRYPTION_KEY', 'MEDVAULT_JWT_SECRET']) {
    if (env[`${key}_FILE`]) env[`${key}_FILE`] = path.resolve(serverRoot, env[`${key}_FILE`])
    else if (!env[key]) env[`${key}_FILE`] = ensureSecret(path.join(dataDirectory, `${key.toLowerCase()}.key`), () => crypto.randomBytes(32).toString('hex'))
  }
  env.MEDVAULT_ADMIN_USERNAME ||= 'clinic.admin'
  if (env.MEDVAULT_ADMIN_PASSWORD_FILE) env.MEDVAULT_ADMIN_PASSWORD_FILE = path.resolve(serverRoot, env.MEDVAULT_ADMIN_PASSWORD_FILE)
  else if (!env.MEDVAULT_ADMIN_PASSWORD) env.MEDVAULT_ADMIN_PASSWORD_FILE = ensureSecret(path.join(root, 'deploy/secrets/tunnel_admin_password'), () => `Mv9!${crypto.randomBytes(24).toString('base64url')}`)
  const password = env.MEDVAULT_ADMIN_PASSWORD_FILE ? fs.readFileSync(env.MEDVAULT_ADMIN_PASSWORD_FILE, 'utf8').trim() : env.MEDVAULT_ADMIN_PASSWORD
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new Error('The tunnel administrator password must have 12 or more characters, letters and numbers (at most 72 UTF-8 bytes). Update MEDVAULT_ADMIN_PASSWORD or its file.')
  return env
}

function tunnelUrl(output) {
  return output.match(/https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com(?=[\s|"']|$)/i)?.[0]?.toLowerCase()
}

module.exports = { prepareTunnelEnvironment, tunnelUrl }
