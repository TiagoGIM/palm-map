/**
 * Retrieval evaluation runner for staging.
 *
 * Goal:
 * - Execute a fixed suite of retrieval queries against `POST /retrieve`.
 * - Print a compact pass/fail summary in the terminal.
 * - Persist a markdown report at `docs/retrieval-eval/latest-report.md`.
 *
 * Required env (from `apps/api/.env.test.local` or process env):
 * - `PALM_SESSION_TOKEN`
 *
 * Optional env:
 * - `RETRIEVAL_API_BASE_URL` (preferred base URL)
 * - `STAGING_API_BASE_URL` (fallback base URL)
 *
 * Useful commands:
 * - `pnpm --dir apps/api test:retrieval-eval`
 * - `pnpm --dir apps/api test:retrieval-eval:curl`
 *
 * Flags:
 * - `--print-curl`: prints a sample curl command built from runtime config.
 * - `--dry-run`: validates config/flags and exits without network calls.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RetrieveResult } from '../../../packages/shared-types'
import { retrievalEvalCases } from './retrieval-eval-cases'

const __dirname = dirname(fileURLToPath(import.meta.url))

type EvalRow = {
  id: string
  city: string
  query: string
  expectResults: boolean
  ok: boolean
  status: number
  resultsCount: number
  warning?: string
  error?: string
}

/** Loads key-value pairs from `apps/api/.env.test.local` when present. */
function loadEnvFile(): Record<string, string> {
  const envPath = resolve(__dirname, '../.env.test.local')
  if (!existsSync(envPath)) return {}

  const content = readFileSync(envPath, 'utf-8')
  const vars: Record<string, string> = {}

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 0) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim()
    vars[key] = value
  }

  return vars
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

/** Resolves runtime token + endpoint from env and enforces required values. */
function resolveRuntimeConfig(): { token: string; endpoint: string } {
  const fileVars = loadEnvFile()
  const merged = { ...fileVars, ...process.env }

  const token = merged['PALM_SESSION_TOKEN']?.trim()
  if (!token) {
    console.error('\n❌ PALM_SESSION_TOKEN nao encontrado.')
    console.error('   Defina em apps/api/.env.test.local ou em process.env.')
    process.exit(1)
  }

  const baseUrlRaw =
    merged['RETRIEVAL_API_BASE_URL']?.trim() ||
    merged['STAGING_API_BASE_URL']?.trim() ||
    'https://palm-map-api-staging.thsa-dev.workers.dev'

  const endpoint = `${normalizeBaseUrl(baseUrlRaw)}/retrieve`
  return { token, endpoint }
}

function buildCurl(endpoint: string, token: string, city: string, query: string): string {
  const escapedCity = city.replaceAll('"', '\\"')
  const escapedQuery = query.replaceAll('"', '\\"')
  return `curl -sS -X POST "${endpoint}" -H "content-type: application/json" -H "x-palm-session-token: ${token}" -d "{\\"city\\":\\"${escapedCity}\\",\\"query\\":\\"${escapedQuery}\\",\\"topK\\":3}"`
}

async function evaluateCase(params: {
  endpoint: string
  token: string
  item: (typeof retrievalEvalCases)[number]
}): Promise<EvalRow> {
  const expectResults = params.item.expectResults ?? true

  try {
    const response = await fetch(params.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-palm-session-token': params.token,
      },
      body: JSON.stringify({
        city: params.item.city,
        query: params.item.query,
        topK: 3,
      }),
    })

    const body = (await response.json()) as RetrieveResult | { error?: { message?: string } }

    const resultsCount =
      'results' in body && Array.isArray(body.results) ? body.results.length : 0
    const warning = 'warning' in body ? body.warning : undefined
    const errorMessage =
      'error' in body ? body.error?.message : undefined

    const ok = response.ok && (expectResults ? resultsCount > 0 : resultsCount === 0)

    return {
      id: params.item.id,
      city: params.item.city,
      query: params.item.query,
      expectResults,
      ok,
      status: response.status,
      resultsCount,
      warning,
      error: errorMessage,
    }
  } catch (error) {
    return {
      id: params.item.id,
      city: params.item.city,
      query: params.item.query,
      expectResults,
      ok: false,
      status: 0,
      resultsCount: 0,
      error: error instanceof Error ? error.message : 'unknown error',
    }
  }
}

function printSummary(rows: EvalRow[]) {
  const passed = rows.filter((row) => row.ok).length
  const failed = rows.length - passed
  console.log('\n=== Retrieval Eval ===')
  console.log(`Total: ${rows.length} | Pass: ${passed} | Fail: ${failed}`)
  for (const row of rows) {
    const icon = row.ok ? '✅' : '❌'
    const warning = row.warning ? ` | warning: ${row.warning}` : ''
    const error = row.error ? ` | error: ${row.error}` : ''
    console.log(
      `${icon} [${row.id}] status=${row.status} results=${row.resultsCount} city="${row.city}" query="${row.query}"${warning}${error}`,
    )
  }
}

/** Writes the markdown report consumed by retrieval quality review. */
function writeReport(rows: EvalRow[], endpoint: string) {
  const now = new Date().toISOString()
  const passed = rows.filter((row) => row.ok).length
  const failed = rows.length - passed

  const lines = [
    '# Retrieval Evaluation Report',
    '',
    `- Generated at: ${now}`,
    `- Endpoint: ${endpoint}`,
    `- Total: ${rows.length}`,
    `- Pass: ${passed}`,
    `- Fail: ${failed}`,
    '',
    '| ID | Status | Results | City | Query | Warning | Error |',
    '|---|---:|---:|---|---|---|---|',
  ]

  rows.forEach((row) => {
    lines.push(
      `| ${row.id} | ${row.status} | ${row.resultsCount} | ${row.city} | ${row.query} | ${row.warning ?? ''} | ${row.error ?? ''} |`,
    )
  })

  const reportsDir = resolve(__dirname, '../../../docs/retrieval-eval')
  mkdirSync(reportsDir, { recursive: true })
  writeFileSync(resolve(reportsDir, 'latest-report.md'), `${lines.join('\n')}\n`, 'utf-8')
}

/**
 * Runs the evaluation suite.
 *
 * Behavior:
 * - builds runtime config,
 * - optionally prints sample curl,
 * - optionally exits early in dry-run mode,
 * - executes all cases and writes report,
 * - returns non-zero exit code when any case fails.
 */
async function main() {
  const printCurl = process.argv.includes('--print-curl')
  const dryRun = process.argv.includes('--dry-run')
  const { token, endpoint } = resolveRuntimeConfig()

  console.log(`\nEndpoint: ${endpoint}`)
  console.log(`Cases: ${retrievalEvalCases.length}`)

  if (printCurl) {
    const first = retrievalEvalCases[0]
    if (first) {
      console.log('\nSample curl:')
      console.log(buildCurl(endpoint, token, first.city, first.query))
    }
  }

  if (dryRun) {
    console.log('\nDry-run habilitado: nenhuma chamada de rede foi executada.')
    return
  }

  const rows: EvalRow[] = []
  for (const item of retrievalEvalCases) {
    const result = await evaluateCase({ endpoint, token, item })
    rows.push(result)
  }

  printSummary(rows)
  writeReport(rows, endpoint)

  const hasFailures = rows.some((row) => !row.ok)
  if (hasFailures) {
    process.exitCode = 1
  }
}

void main()
