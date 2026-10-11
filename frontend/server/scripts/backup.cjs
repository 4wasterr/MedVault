const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { pipeline } = require('node:stream/promises')
const { DatabaseSync, backup } = require('node:sqlite')
const { auditDigest } = require('../src/security')

const magic = Buffer.from('MVBAK001')
const headerLength = magic.length + 12
function validateKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Backup key must contain 32 bytes.')
}
function remove(file) { try { fs.unlinkSync(file) } catch (error) { if (error.code !== 'ENOENT') throw error } }
function checkDatabase(filename) {
  const db = new DatabaseSync(filename, { readOnly: true })
  try {
    const checks = db.prepare('PRAGMA integrity_check').all()
    if (checks.length !== 1 || checks[0].integrity_check !== 'ok') throw new Error('SQLite integrity check failed.')
    if (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'audit_events'").get()) {
      let previous = ''
      for (const row of db.prepare('SELECT * FROM audit_events ORDER BY id').iterate()) {
        if (row.prev_hash !== previous || row.entry_hash !== auditDigest(row)) throw new Error(`Audit integrity check failed at entry ${row.id}.`)
        previous = row.entry_hash
      }
    }
  } finally { db.close() }
}
async function digest(filename) {
  const hash = crypto.createHash('sha256')
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk)
  return hash.digest('hex')
}

async function createBackup(filename, directory, key) {
  validateKey(key)
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  const work = fs.mkdtempSync(path.join(directory, '.snapshot-'))
  const snapshot = path.join(work, 'snapshot.sqlite')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const target = path.join(directory, `medvault-${stamp}-${crypto.randomUUID().slice(0, 8)}.mvb`)
  const pending = target + '.pending'
  let source
  try {
    source = new DatabaseSync(filename, { readOnly: true })
    source.exec('PRAGMA busy_timeout = 5000')
    await backup(source, snapshot)
    fs.chmodSync(snapshot, 0o600)
    source.close(); source = null
    checkDatabase(snapshot)
    const iv = crypto.randomBytes(12)
    const header = Buffer.concat([magic, iv])
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    cipher.setAAD(header)
    fs.writeFileSync(pending, header, { flag: 'wx', mode: 0o600 })
    await pipeline(fs.createReadStream(snapshot), cipher, fs.createWriteStream(pending, { flags: 'a' }))
    fs.appendFileSync(pending, cipher.getAuthTag())
    const handle = fs.openSync(pending, 'r+')
    try { fs.fsyncSync(handle) } finally { fs.closeSync(handle) }
    fs.renameSync(pending, target)
    fs.writeFileSync(target + '.sha256', `${await digest(target)}  ${path.basename(target)}\n`, { flag: 'wx', mode: 0o600 })
    return target
  } finally {
    if (source) source.close()
    remove(pending)
    for (const suffix of ['', '-wal', '-shm']) remove(snapshot + suffix)
    fs.rmdirSync(work)
  }
}

async function restoreBackup(input, filename, key, { confirmStopped = false } = {}) {
  validateKey(key)
  if (!confirmStopped) throw new Error('Stop the API before restoring and explicitly confirm that it is stopped.')
  if (path.resolve(input) === path.resolve(filename)) throw new Error('Backup and database paths must differ.')
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 })
  const temporary = filename + `.restore-${crypto.randomUUID()}`
  const size = fs.statSync(input).size
  if (size <= headerLength + 16) throw new Error('Invalid or truncated backup.')
  const header = Buffer.alloc(headerLength)
  const tag = Buffer.alloc(16)
  const handle = fs.openSync(input, 'r')
  try { fs.readSync(handle, header, 0, header.length, 0); fs.readSync(handle, tag, 0, tag.length, size - 16) }
  finally { fs.closeSync(handle) }
  if (!header.subarray(0, magic.length).equals(magic)) throw new Error('Unrecognized backup format.')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, header.subarray(magic.length))
  decipher.setAAD(header); decipher.setAuthTag(tag)
  let previous = null
  try {
    await pipeline(fs.createReadStream(input, { start: headerLength, end: size - 17 }), decipher,
      fs.createWriteStream(temporary, { flags: 'wx', mode: 0o600 }))
    checkDatabase(temporary)
    // Retain a consistent snapshot of the previous database before replacing it.
    if (fs.existsSync(filename)) {
      previous = filename + `.pre-restore-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
      const old = new DatabaseSync(filename, { readOnly: true })
      try { await backup(old, previous); fs.chmodSync(previous, 0o600) } finally { old.close() }
    }
    for (const suffix of ['-wal', '-shm']) remove(filename + suffix)
    fs.renameSync(temporary, filename)
    return { filename, previous }
  } finally { for (const suffix of ['', '-wal', '-shm']) remove(temporary + suffix) }
}

async function main() {
  require('dotenv').config()
  const keyText = process.env.MEDVAULT_BACKUP_KEY_FILE
    ? fs.readFileSync(process.env.MEDVAULT_BACKUP_KEY_FILE, 'utf8').trim() : process.env.MEDVAULT_BACKUP_KEY
  if (!/^[a-f0-9]{64}$/i.test(keyText || '')) throw new Error('Set MEDVAULT_BACKUP_KEY_FILE to a 64-hex-character backup key file.')
  const key = Buffer.from(keyText, 'hex')
  const filename = path.resolve(process.env.MEDVAULT_DB_PATH || path.join(__dirname, '../data/medvault.sqlite'))
  if (process.argv[2] === 'restore') {
    if (!process.argv[3]) throw new Error('Provide the encrypted .mvb backup path.')
    const result = await restoreBackup(path.resolve(process.argv[3]), filename, key,
      { confirmStopped: process.env.MEDVAULT_CONFIRM_RESTORE === 'yes' })
    console.log(JSON.stringify({ event: 'backup_restored', ...result }))
  } else {
    const directory = path.resolve(process.env.MEDVAULT_BACKUP_DIRECTORY || path.join(__dirname, '../../../deploy/backups'))
    console.log(JSON.stringify({ event: 'backup_completed', filename: await createBackup(filename, directory, key) }))
  }
}
if (require.main === module) main().catch(error => { console.error(JSON.stringify({ event: 'backup_error', error: error.message })); process.exitCode = 1 })
module.exports = { createBackup, restoreBackup }
