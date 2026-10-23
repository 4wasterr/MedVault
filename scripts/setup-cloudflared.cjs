const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

async function main() {
  const platform = { win32: 'windows', linux: 'linux' }[process.platform]
  const architecture = { x64: 'amd64', arm64: 'arm64' }[process.arch]
  if (!platform || !architecture) throw new Error('Install cloudflared from https://developers.cloudflare.com/tunnel/downloads/ and add it to PATH on this platform.')
  const suffix = process.platform === 'win32' ? '.exe' : ''
  const assetName = `cloudflared-${platform}-${architecture}${suffix}`
  const directory = path.resolve(__dirname, '../.tools')
  const destination = path.join(directory, `cloudflared${suffix}`)
  const headers = { 'User-Agent': 'MedVault-setup', Accept: 'application/vnd.github+json' }
  const response = await fetch('https://api.github.com/repos/cloudflare/cloudflared/releases/latest', {
    headers, signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`Cloudflare release lookup failed (${response.status}).`)
  const release = await response.json()
  const asset = release.assets.find(item => item.name === assetName)
  if (!asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || '')) throw new Error('The official release has no verified download for this platform. Install cloudflared manually.')
  console.log(`Downloading official Cloudflare cloudflared ${release.tag_name}...`)
  const download = await fetch(asset.browser_download_url, { signal: AbortSignal.timeout(120_000) })
  if (!download.ok) throw new Error(`cloudflared download failed (${download.status}).`)
  const binary = Buffer.from(await download.arrayBuffer())
  if (`sha256:${crypto.createHash('sha256').update(binary).digest('hex')}` !== asset.digest) throw new Error('cloudflared checksum mismatch; download was not installed.')
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(destination, binary, { mode: 0o755 })
  console.log(`Installed ${destination} (SHA-256 verified). Next: npm run tunnel`)
}

main().catch(error => { console.error(`Tunnel setup failed: ${error.message}`); process.exitCode = 1 })
