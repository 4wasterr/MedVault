const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { DatabaseSync } = require('node:sqlite')
const { createBackup, restoreBackup } = require('../scripts/backup.cjs')

test('encrypted SQLite backups include WAL records and authenticate before restoring', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'medvault-backup-test-'))
  const filename = path.join(directory, 'test.sqlite')
  const key = crypto.randomBytes(32)
  let db = new DatabaseSync(filename)
  try {
    db.exec('PRAGMA journal_mode = WAL; CREATE TABLE clinical (id INTEGER PRIMARY KEY, diagnosis TEXT)')
    db.prepare('INSERT INTO clinical VALUES (?, ?)').run(1, 'Private medical history')
    // Leave the writer open: the latest committed record is still in the WAL.
    const encrypted = await createBackup(filename, path.join(directory, 'backups'), key)
    assert.equal(fs.readFileSync(encrypted).includes(Buffer.from('Private medical history')), false)
    assert.match(fs.readFileSync(encrypted + '.sha256', 'utf8'), /^[a-f0-9]{64}  medvault-/)
    db.prepare('INSERT INTO clinical VALUES (?, ?)').run(2, 'New record after backup')
    db.close(); db = null
    const rows = () => {
      const reader = new DatabaseSync(filename)
      try { return reader.prepare('SELECT * FROM clinical ORDER BY id').all().map(row => ({ ...row })) }
      finally { reader.close() }
    }
    await assert.rejects(restoreBackup(encrypted, filename, key), /Stop the API/)
    await assert.rejects(restoreBackup(encrypted, filename, crypto.randomBytes(32), { confirmStopped: true }), /authenticate|Unsupported state/)
    assert.equal(rows().length, 2)
    const damaged = path.join(directory, 'damaged.mvb')
    const bytes = fs.readFileSync(encrypted)
    bytes[bytes.length - 1] ^= 1
    fs.writeFileSync(damaged, bytes)
    await assert.rejects(restoreBackup(damaged, filename, key, { confirmStopped: true }), /authenticate|Unsupported state/)
    assert.equal(rows().length, 2)
    const restored = await restoreBackup(encrypted, filename, key, { confirmStopped: true })
    assert.deepEqual(rows(), [{ id: 1, diagnosis: 'Private medical history' }])
    const previous = new DatabaseSync(restored.previous, { readOnly: true })
    try { assert.equal(previous.prepare('SELECT COUNT(*) AS count FROM clinical').get().count, 2) }
    finally { previous.close() }
    assert.equal(fs.readdirSync(directory).some(file => file.includes('.restore-')), false)
  } finally {
    if (db) db.close()
    if (path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(directory, { recursive: true, force: true })
  }
})
