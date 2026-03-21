import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const webDir = resolve(__dirname, '..')

const candidateEnvFiles = ['.env.staging.local', '.env.local']

const apiBaseUrl = resolveApiBaseUrl()

runCommand('pnpm', ['build:staging'], {
  cwd: webDir,
  env: {
    ...process.env,
    VITE_API_BASE_URL: apiBaseUrl,
  },
})

runCommand('pnpm', ['deploy:preview'], {
  cwd: webDir,
  env: {
    ...process.env,
    VITE_API_BASE_URL: apiBaseUrl,
  },
})

function resolveApiBaseUrl() {
  const directValue = process.env.VITE_API_BASE_URL?.trim()
  if (directValue) {
    return validateApiBaseUrl(directValue)
  }

  for (const filename of candidateEnvFiles) {
    const filepath = resolve(webDir, filename)
    if (!existsSync(filepath)) {
      continue
    }

    const fileValue = parseEnvFile(filepath).VITE_API_BASE_URL?.trim()
    if (fileValue) {
      return validateApiBaseUrl(fileValue)
    }
  }

  console.error(
    [
      'Missing VITE_API_BASE_URL for staging deploy.',
      'Defina a env no shell ou crie apps/web/.env.staging.local com:',
      'VITE_API_BASE_URL=https://<seu-worker-staging>.workers.dev',
    ].join('\n'),
  )
  process.exit(1)
}

function validateApiBaseUrl(value) {
  try {
    const url = new URL(value)
    return url.toString().replace(/\/+$/, '')
  } catch {
    console.error(
      `VITE_API_BASE_URL invalida para staging deploy: "${value}". Use uma URL absoluta publica da API.`,
    )
    process.exit(1)
  }
}

function parseEnvFile(filepath) {
  const content = readFileSync(filepath, 'utf-8')
  const entries = {}

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '')
    entries[key] = value
  }

  return entries
}

function runCommand(command, args, options) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
