const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const directory = path.resolve(__dirname, '../secrets')
fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
const values = {
  encryption_key: crypto.randomBytes(32).toString('hex'), jwt_secret: crypto.randomBytes(32).toString('hex'),
  backup_key: crypto.randomBytes(32).toString('hex'),
  admin_password: 'Mv9!' + crypto.randomBytes(24).toString('base64url'),
}
for (const [name, value] of Object.entries(values)) {
  try { fs.writeFileSync(path.join(directory, name), value + '\n', { flag: 'wx', mode: 0o444 }) }
  catch (error) { if (error.code !== 'EEXIST') throw error }
}
console.log('Secret files prepared. Existing keys and passwords were preserved. Read the admin_password file locally when signing in.')
