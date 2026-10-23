#!/usr/bin/env node
// Run one command with DATABASE_URL pointed at the MarketData staging database.
//
//   node scripts/marketdata/with-staging-db.mjs pnpm migrate
//
// The source URL is DATABASE_URL in ~/MarketData-App/feedback/.env (override
// the file with MARKETDATA_ENV_FILE). That URL names Neon's pooler host and
// the `neondb` database. Migrations need the direct host (the hostname without
// `-pooler`) and the `feedlog_staging` database, so this script rewrites both.
//
// The URL is never printed: the child's stdout and stderr pass through a
// filter that replaces the URL, the password and the hostnames.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const STAGING_DB = 'feedlog_staging'
const envFile = process.env.MARKETDATA_ENV_FILE || join(homedir(), 'MarketData-App', 'feedback', '.env')

function readEnvFile(path) {
  const values = {}
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).replace(/^export\s+/, '').trim()
    values[key] = line.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
  }
  return values
}

const [command, ...args] = process.argv.slice(2)
if (!command) {
  console.error('usage: with-staging-db.mjs <command> [args...]')
  process.exit(2)
}

let source
try {
  source = readEnvFile(envFile).DATABASE_URL
}
catch (error) {
  console.error(`Cannot read ${envFile}: ${error.code ?? error.message}`)
  process.exit(1)
}
if (!source) {
  console.error(`DATABASE_URL is missing in ${envFile}`)
  process.exit(1)
}

const url = new URL(source)
const poolerHost = url.hostname
url.hostname = poolerHost.replace('-pooler', '')
url.pathname = `/${STAGING_DB}`
url.search = '?sslmode=verify-full'
const stagingUrl = url.href

const hidden = [source, stagingUrl, url.password, decodeURIComponent(url.password), poolerHost, url.hostname]
  .filter(value => value && value.length >= 4)
  .sort((a, b) => b.length - a.length)

function redact(text) {
  for (const value of hidden) text = text.split(value).join('<redacted>')
  return text
}

// Redact whole lines so that a secret split across two chunks is still caught.
function pipeRedacted(stream, target) {
  let pending = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    pending += chunk
    const cut = pending.lastIndexOf('\n')
    if (cut < 0) return
    target.write(redact(pending.slice(0, cut + 1)))
    pending = pending.slice(cut + 1)
  })
  stream.on('end', () => {
    if (pending) target.write(redact(pending))
  })
}

const child = spawn(command, args, {
  env: { ...process.env, DATABASE_URL: stagingUrl },
  stdio: ['inherit', 'pipe', 'pipe'],
})
pipeRedacted(child.stdout, process.stdout)
pipeRedacted(child.stderr, process.stderr)
child.on('error', (error) => {
  console.error(redact(`Cannot start ${command}: ${error.message}`))
  process.exit(1)
})
child.on('close', (code, signal) => {
  process.exitCode = signal ? 1 : code ?? 1
})
