const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const helmet = require('helmet')
const sanitize = require('sanitize-html')
const { decodeHTML } = require('entities')

const production = process.env.NODE_ENV === 'production'
function secret(name, directory) {
  const filename = process.env[`${name}_FILE`]
  const configured = filename ? fs.readFileSync(filename, 'utf8').trim() : process.env[name]
  if (configured) {
    if (!/^[a-f0-9]{64}$/i.test(configured)) throw new Error(`${name} must contain 32 random bytes encoded as 64 hex characters.`)
    return Buffer.from(configured, 'hex')
  }
  if (production) throw new Error(`${name}_FILE is required in production.`)
  fs.mkdirSync(directory, { recursive: true })
  const file = path.join(directory, `${name.toLowerCase()}.key`)
  try { fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }) }
  catch (error) { if (error.code !== 'EEXIST') throw error }
  const key = fs.readFileSync(file, 'utf8').trim()
  if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error(`Invalid local key file: ${file}`)
  return Buffer.from(key, 'hex')
}

function createSecurity(directory) {
  const encryptionKey = secret('MEDVAULT_ENCRYPTION_KEY', directory)
  const jwtKey = secret('MEDVAULT_JWT_SECRET', directory)
  const protectedFields = new Set(['vitals', 'medical', 'medicalHistory', 'consultation', 'recordNotes',
    'diagnosis', 'treatment', 'followUp', 'summary', 'notes', 'vitalsSummary', 'name', 'patientName',
    'contact', 'address', 'birthday', 'emergencyName', 'emergencyContact'])
  function encrypt(value, context) {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv)
    cipher.setAAD(Buffer.from(context))
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
    return { _medvaultEncrypted: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: ciphertext.toString('base64') }
  }
  function decrypt(value, context) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(value.iv, 'base64'))
    decipher.setAAD(Buffer.from(context))
    decipher.setAuthTag(Buffer.from(value.tag, 'base64'))
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data, 'base64')), decipher.final()]).toString('utf8'))
  }
  function transform(value, mode, context = '') {
    if (!value || typeof value !== 'object') return value
    if (value._medvaultEncrypted) return mode === 'read' ? decrypt(value, context) : value
    if (Array.isArray(value)) return value.map((entry, index) => transform(entry, mode, `${context}.${index}`))
    return Object.fromEntries(Object.entries(value).map(([field, entry]) => {
      const next = `${context}.${field}`
      return [field, mode === 'write' && protectedFields.has(field) && entry !== null && !entry?._medvaultEncrypted
        ? encrypt(entry, next) : transform(entry, mode, next)]
    }))
  }
  const json = (text, mode) => {
    if (text === null || text === undefined) return text
    let object
    try { object = JSON.parse(text) } catch { return text }
    return JSON.stringify(transform(object, mode, `medvault:${object?.id || ''}`))
  }
  return {
    encode: text => json(text, 'write'), decode: text => json(text, 'read'), encrypt, decrypt,
    sign: (username, role, duration) => jwt.sign({ role }, jwtKey, {
      algorithm: 'HS256', subject: username, jwtid: crypto.randomUUID(), issuer: 'medvault', audience: 'medvault-web', expiresIn: duration,
    }),
    verify: token => jwt.verify(token, jwtKey, { algorithms: ['HS256'], issuer: 'medvault', audience: 'medvault-web' }),
  }
}

const hashPassword = password => bcrypt.hash(password, 12)
async function verifyPassword(password, hash, salt) {
  if (/^\$2[aby]\$/.test(hash)) return bcrypt.compare(password, hash)
  const candidate = crypto.scryptSync(password, Buffer.from(salt, 'hex'), 32)
  const expected = Buffer.from(hash, 'hex')
  return expected.length === candidate.length && crypto.timingSafeEqual(candidate, expected)
}

function sanitizeInput(value, depth = 0, field = '') {
  if (depth > 12) throw new Error('Request is too deeply nested.')
  if (typeof value === 'string') {
    if (value.length > 100_000) throw new Error('A field is too large.')
    if (/password/i.test(field)) return value
    // eslint-disable-next-line no-control-regex -- Strip disallowed controls before storing clinical text.
    const plain = decodeHTML(value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''))
    // Store plain text: React escapes it when rendering, so HTML entities must not be stored twice.
    return decodeHTML(sanitize(plain, { allowedTags: [], allowedAttributes: {} }))
  }
  if (Array.isArray(value)) return value.map(entry => sanitizeInput(entry, depth + 1, field))
  if (!value || typeof value !== 'object') return value
  const result = {}
  for (const [key, entry] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype', '_medvaultEncrypted'].includes(key)) throw new Error('Invalid request field.')
    // Optimistic-concurrency snapshots must match stored text exactly.
    result[key] = key === 'before' ? entry : sanitizeInput(entry, depth + 1, key)
  }
  return result
}

function installProtection(app, log) {
  app.set('trust proxy', production ? 1 : false)
  app.use(helmet({ contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"],
    frameAncestors: ["'none'"], objectSrc: ["'none'"], baseUri: ["'self'"],
    upgradeInsecureRequests: production ? [] : null,
  } }, strictTransportSecurity: production ? { maxAge: 31536000, includeSubDomains: true } : false }))
  app.use('/api', (request, response, next) => {
    const started = performance.now()
    response.on('finish', () => log('access', { method: request.method, path: request.path.split('?')[0], status: response.statusCode,
      username: request.user?.username || 'anonymous', ip: request.ip, durationMs: Math.round(performance.now() - started) }))
    response.setHeader('Cache-Control', 'no-store')
    if (production && !request.secure) return response.status(400).json({ error: 'HTTPS is required.' })
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      if (!request.is('application/json')) return response.status(415).json({ error: 'Use JSON requests.' })
      const expected = process.env.MEDVAULT_PUBLIC_ORIGIN || `${request.protocol}://${request.get('host')}`
      if (request.get('origin') && request.get('origin') !== expected) return response.status(403).json({ error: 'Request origin is not allowed.' })
      if (request.get('sec-fetch-site') === 'cross-site') return response.status(403).json({ error: 'Cross-site requests are not allowed.' })
      const cookie = (request.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('medvault_csrf='))?.slice(14)
      const token = request.get('x-csrf-token') || ''
      if (!cookie || !/^[a-f0-9]{64}$/.test(token) || cookie !== token) return response.status(403).json({ error: 'Invalid CSRF token. Reload and try again.' })
      try { request.body = sanitizeInput(request.body) } catch (error) { return response.status(400).json({ error: error.message }) }
    }
    next()
  })
  app.get('/api/csrf', (request, response) => {
    const existing = (request.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith('medvault_csrf='))?.slice(14)
    const token = /^[a-f0-9]{64}$/.test(existing || '') ? existing : crypto.randomBytes(32).toString('hex')
    response.setHeader('Set-Cookie', `medvault_csrf=${token}; HttpOnly; SameSite=Strict; Path=/${production || request.secure ? '; Secure' : ''}`)
    response.json({ csrfToken: token })
  })
}

const auditDigest = row => crypto.createHash('sha256').update(JSON.stringify([
  row.prev_hash || '', row.occurred_at, row.username, row.role, row.collection, row.record_id, row.action,
  row.before_data ?? null, row.after_data ?? null,
])).digest('hex')

module.exports = { createSecurity, hashPassword, verifyPassword, installProtection, auditDigest, production }
