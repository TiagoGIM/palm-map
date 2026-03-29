/**
 * Script de comparação: roda os cenários de teste contra o pipeline de extração
 * e imprime uma tabela com os resultados vs. esperado.
 *
 * Modos de uso:
 *
 *   # Baseline heurístico (sem LLM)
 *   pnpm --dir apps/api test:scenarios
 *
 *   # Com Cloudflare Workers AI (requer credenciais em .env.test.local)
 *   pnpm --dir apps/api test:scenarios:llm
 *
 * Como gerar credenciais Cloudflare Workers AI:
 *   1. Acesse dash.cloudflare.com → Workers & Pages → Overview
 *   2. Copie o Account ID (canto direito da tela)
 *   3. Vá em My Profile → API Tokens → Create Token
 *   4. Use o template "Workers AI (Read)" → Create Token
 *   5. Crie o arquivo apps/api/.env.test.local:
 *      CONVERSATION_LLM_ACCOUNT_ID=<account_id>
 *      CONVERSATION_LLM_API_KEY=<api_token>
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createBaseTripState } from '../conversation-merge'
import { extractFromMessage } from '../conversation-extract'
import type { ConversationUpdateRuntimeEnv } from '../conversation-types'
import { scenarios } from './scenarios'
import type { Scenario, ScenarioExpectation } from './scenarios'
import type { ExtractedUpdate } from '../conversation-types'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Carrega .env.test.local se existir
// ---------------------------------------------------------------------------
function loadEnvFile(): Record<string, string> {
  const envPath = resolve(__dirname, '../.env.test.local')
  if (!existsSync(envPath)) {
    return {}
  }
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

// ---------------------------------------------------------------------------
// Monta env de runtime a partir de process.env + .env.test.local
// ---------------------------------------------------------------------------
function buildEnv(useLlm: boolean): ConversationUpdateRuntimeEnv {
  const fileVars = loadEnvFile()
  const merged = { ...fileVars, ...process.env }

  if (!useLlm) {
    return { CONVERSATION_LLM_ENABLED: 'false' }
  }

  const accountId = merged['CONVERSATION_LLM_ACCOUNT_ID']?.trim()
  const apiKey = merged['CONVERSATION_LLM_API_KEY']?.trim()

  if (!accountId || !apiKey) {
    console.error('\n❌  Credenciais não encontradas.')
    console.error('    Crie o arquivo apps/api/.env.test.local com:')
    console.error('    CONVERSATION_LLM_ACCOUNT_ID=<account_id>')
    console.error('    CONVERSATION_LLM_API_KEY=<api_token>')
    console.error('\n    Veja instruções no topo deste arquivo.\n')
    process.exit(1)
  }

  const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`

  return {
    CONVERSATION_LLM_ENABLED: 'true',
    CONVERSATION_LLM_API_KEY: apiKey,
    CONVERSATION_LLM_BASE_URL: baseUrl,
    CONVERSATION_LLM_MODEL: merged['CONVERSATION_LLM_MODEL'] ?? '@cf/meta/llama-3.1-8b-instruct',
    CONVERSATION_LLM_TIMEOUT_MS: merged['CONVERSATION_LLM_TIMEOUT_MS'] ?? '15000',
    CONVERSATION_LLM_RESPONSE_MODE: 'json_object',
    CONVERSATION_LLM_MIN_CONFIDENCE: '0.3',
    CONVERSATION_LLM_DEBUG: merged['CONVERSATION_LLM_DEBUG'] ?? 'false',
  }
}

// ---------------------------------------------------------------------------
// Avaliação de resultado vs esperado
// ---------------------------------------------------------------------------
type FieldResult = { field: string; got: string; expected: string; pass: boolean }

function evaluate(result: ExtractedUpdate, expected: ScenarioExpectation): FieldResult[] {
  const checks: FieldResult[] = []

  function check(field: string, got: string | undefined, exp: string | undefined) {
    if (exp === undefined) return // campo não testado neste cenário
    const gotNorm = got?.trim().toLowerCase() ?? '—'
    const expNorm = exp.trim().toLowerCase()
    checks.push({ field, got: got ?? '—', expected: exp, pass: gotNorm === expNorm })
  }

  check('origin', result.origin, expected.origin)
  check('destination', result.destination, expected.destination)

  if (expected.daysTotal !== undefined) {
    const gotDays = result.daysTotal?.toString()
    checks.push({
      field: 'daysTotal',
      got: gotDays ?? '—',
      expected: String(expected.daysTotal),
      pass: result.daysTotal === expected.daysTotal,
    })
  }

  if (expected.stopCities) {
    for (const city of expected.stopCities) {
      const found = result.stops.some((s) => s.city.toLowerCase() === city.toLowerCase())
      checks.push({
        field: `stop:${city}`,
        got: found ? city : '—',
        expected: city,
        pass: found,
      })
    }
  }

  if (expected.stopStayDays) {
    for (const [city, days] of Object.entries(expected.stopStayDays)) {
      const stop = result.stops.find((s) => s.city.toLowerCase() === city.toLowerCase())
      checks.push({
        field: `stayDays:${city}`,
        got: stop?.stayDays?.toString() ?? '—',
        expected: String(days),
        pass: stop?.stayDays === days,
      })
    }
  }

  if (expected.likes) {
    for (const like of expected.likes) {
      const found = result.likes.some((l) => l.toLowerCase().includes(like.toLowerCase()))
      checks.push({
        field: `like:${like}`,
        got: found ? like : '—',
        expected: like,
        pass: found,
      })
    }
  }

  if (expected.dislikes) {
    for (const dislike of expected.dislikes) {
      const found = result.dislikes.some((d) => d.toLowerCase().includes(dislike.toLowerCase()))
      checks.push({
        field: `dislike:${dislike}`,
        got: found ? dislike : '—',
        expected: dislike,
        pass: found,
      })
    }
  }

  if (expected.pace !== undefined) {
    checks.push({
      field: 'pace',
      got: result.pace ?? '—',
      expected: expected.pace,
      pass: result.pace === expected.pace,
    })
  }

  if (expected.budget !== undefined) {
    checks.push({
      field: 'budget',
      got: result.budget ?? '—',
      expected: expected.budget,
      pass: result.budget === expected.budget,
    })
  }

  if (expected.suggestionIntent !== undefined) {
    checks.push({
      field: 'suggestionIntent',
      got: String(result.suggestionIntent ?? false),
      expected: String(expected.suggestionIntent),
      pass: (result.suggestionIntent ?? false) === expected.suggestionIntent,
    })
  }

  return checks
}

// ---------------------------------------------------------------------------
// Formatação da tabela
// ---------------------------------------------------------------------------
function printScenarioResult(
  scenario: Scenario,
  checks: FieldResult[],
  durationMs: number,
  mode: string,
) {
  const allPass = checks.every((c) => c.pass)
  const passCount = checks.filter((c) => c.pass).length
  const icon = allPass ? '✅' : checks.length === 0 ? '⚪' : '❌'

  console.log(`\n${icon} [${scenario.id}] ${scenario.label}  (${durationMs}ms, ${mode})`)
  console.log(`   Mensagem: "${scenario.message}"`)

  if (checks.length === 0) {
    console.log('   (nenhum campo esperado — extração vazia é OK)')
    return
  }

  console.log(`   Resultado: ${passCount}/${checks.length} campos corretos`)
  const colField = 22
  const colGot = 25
  const colExp = 25
  const header = `   ${'CAMPO'.padEnd(colField)} ${'OBTIDO'.padEnd(colGot)} ${'ESPERADO'.padEnd(colExp)} OK?`
  console.log(header)
  console.log(`   ${'-'.repeat(colField + colGot + colExp + 8)}`)
  for (const c of checks) {
    const icon = c.pass ? '✅' : '❌'
    const got = c.got.length > colGot - 1 ? c.got.slice(0, colGot - 2) + '…' : c.got
    const exp = c.expected.length > colExp - 1 ? c.expected.slice(0, colExp - 2) + '…' : c.expected
    console.log(`   ${c.field.padEnd(colField)} ${got.padEnd(colGot)} ${exp.padEnd(colExp)} ${icon}`)
  }
}

// ---------------------------------------------------------------------------
// Runner principal
// ---------------------------------------------------------------------------
async function main() {
  const useLlm = process.argv.includes('--llm') ||
    process.env['CONVERSATION_LLM_ENABLED'] === 'true'

  const env = buildEnv(useLlm)
  const mode = useLlm ? '🤖 Cloudflare Workers AI' : '📐 Heurístico'

  console.log('\n' + '═'.repeat(70))
  console.log(`  PALM MAP — Comparação de Extração`)
  console.log(`  Modo: ${mode}`)
  console.log('═'.repeat(70))

  let totalPass = 0
  let totalChecks = 0
  let totalScenarios = 0
  let totalScenariosPass = 0

  for (const scenario of scenarios) {
    const tripState = createBaseTripState(scenario.previousState as any)

    const start = Date.now()
    let result: ExtractedUpdate
    try {
      result = await extractFromMessage({
        message: scenario.message,
        tripState,
        env,
      })
    } catch (err) {
      console.log(`\n💥 [${scenario.id}] ERRO: ${err instanceof Error ? err.message : String(err)}`)
      totalScenarios++
      continue
    }
    const durationMs = Date.now() - start

    const checks = evaluate(result, scenario.expected)
    printScenarioResult(scenario, checks, durationMs, mode)

    totalPass += checks.filter((c) => c.pass).length
    totalChecks += checks.length
    totalScenarios++
    if (checks.length === 0 || checks.every((c) => c.pass)) totalScenariosPass++
  }

  console.log('\n' + '═'.repeat(70))
  console.log(`  RESUMO: ${totalScenariosPass}/${totalScenarios} cenários OK`)
  if (totalChecks > 0) {
    console.log(`  Campos: ${totalPass}/${totalChecks} corretos (${Math.round(totalPass / totalChecks * 100)}%)`)
  }
  console.log('═'.repeat(70) + '\n')

  if (totalPass < totalChecks) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Erro fatal:', err)
  process.exit(1)
})
