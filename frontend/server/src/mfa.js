const crypto = require('node:crypto')

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Encode(buffer) {
  let bits = 0
  let value = 0
  let output = ''
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i]
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

function base32Decode(string) {
  const clean = String(string || '').toUpperCase().replace(/[\s=-]/g, '')
  let bits = 0
  let value = 0
  const bytes = []
  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i])
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

function generateSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes))
}

function getTotpCode(secret, timestamp = Date.now(), step = 30) {
  const key = base32Decode(secret)
  const counter = Math.floor(timestamp / 1000 / step)
  const counterBuffer = Buffer.alloc(8)
  counterBuffer.writeBigInt64BE(BigInt(counter))

  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)

  const otp = binary % 1000000
  return String(otp).padStart(6, '0')
}

function verifyTotp(secret, code, window = 1, step = 30) {
  const cleanCode = String(code || '').trim().replace(/\s/g, '')
  if (!/^\d{6}$/.test(cleanCode)) return false
  const now = Date.now()
  for (let offset = -window; offset <= window; offset++) {
    const candidate = getTotpCode(secret, now + offset * step * 1000, step)
    if (candidate === cleanCode) return true
  }
  return false
}

function generateBackupCodes(count = 8) {
  const codes = []
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(4).toString('hex').toUpperCase()
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`)
  }
  return codes
}

function hashBackupCode(code) {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex')
}

function getOtpauthUrl(username, secret, issuer = 'MedVault') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(username)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
}

module.exports = {
  generateSecret,
  getTotpCode,
  verifyTotp,
  generateBackupCodes,
  hashBackupCode,
  getOtpauthUrl,
  base32Encode,
  base32Decode,
}

