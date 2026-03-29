#!/usr/bin/env node
/**
 * Geração assistida de dataset para palm-map via Cloudflare Workers AI.
 *
 * O script gera um DRAFT — nunca sobrescreve o dataset real.
 * Você revisa o draft, edita se necessário, e depois roda ingest.mjs.
 *
 * Uso:
 *   node generate-dataset.mjs --city <Nome> --places "A,B,C" [--id <artifact-id>]
 *   node generate-dataset.mjs --city <Nome> --places-file <path/to/places.txt>
 *
 * Exemplos:
 *   node generate-dataset.mjs --city Recife --places "Paço do Frevo,Mercado de São José"
 *   node generate-dataset.mjs --city Salvador --places-file salvador-places.txt --id salvador-v1
 *
 * Credenciais (lidas de env ou flags):
 *   CONVERSATION_LLM_ACCOUNT_ID  ou  --account-id
 *   CONVERSATION_LLM_API_KEY     ou  --api-key
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--') && i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      args[key] = argv[++i]
    }
  }
  return args
}

const args = parseArgs(process.argv.slice(2))

// ---------------------------------------------------------------------------
// Validate required args
// ---------------------------------------------------------------------------
if (!args.city) {
  console.error('Error: --city is required.')
  console.error('')
  console.error('Usage:')
  console.error('  node generate-dataset.mjs --city <Nome> --places "A,B,C"')
  console.error('  node generate-dataset.mjs --city <Nome> --places-file places.txt')
  process.exit(1)
}

if (!args.places && !args.placesFile) {
  console.error('Error: --places or --places-file is required.')
  console.error('')
  console.error('Usage:')
  console.error('  node generate-dataset.mjs --city Recife --places "Paço do Frevo,Mercado de São José"')
  console.error('  node generate-dataset.mjs --city Recife --places-file recife-places.txt')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Load env file FIRST (apps/api/.env.test.local)
// ---------------------------------------------------------------------------
function loadEnvFile() {
  const paths = [
    resolve(ROOT, '../../apps/api/.env.test.local'),
    resolve(process.cwd(), '.env.test.local'),
  ]
  for (const p of paths) {
    if (!existsSync(p)) continue
    const content = readFileSync(p, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx < 0) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const value = trimmed.slice(eqIdx + 1).trim()
      if (!process.env[key]) process.env[key] = value
    }
    break
  }
}
loadEnvFile()

// ---------------------------------------------------------------------------
// Resolve credentials
// ---------------------------------------------------------------------------
const resolvedAccountId = args.accountId ?? process.env['CONVERSATION_LLM_ACCOUNT_ID'] ?? ''
const resolvedApiKey = args.apiKey ?? process.env['CONVERSATION_LLM_API_KEY'] ?? ''

if (!resolvedAccountId || !resolvedApiKey) {
  console.error('Error: Cloudflare credentials not found.')
  console.error('  Set CONVERSATION_LLM_ACCOUNT_ID and CONVERSATION_LLM_API_KEY in apps/api/.env.test.local')
  console.error('  Or pass --account-id and --api-key flags.')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Resolve places list
// ---------------------------------------------------------------------------
function loadPlaces() {
  if (args.places) {
    return args.places.split(',').map((p) => p.trim()).filter(Boolean)
  }
  const filePath = resolve(process.cwd(), args.placesFile)
  if (!existsSync(filePath)) {
    console.error(`Error: places file not found: ${filePath}`)
    process.exit(1)
  }
  return readFileSync(filePath, 'utf-8')
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean)
}

const city = args.city.trim()
const artifactId = args.id ?? `${city.toLowerCase().replace(/\s+/g, '-')}-v1`
const places = loadPlaces()
const DRAFT_PATH = resolve(ROOT, `datasets/${artifactId}.draft.json`)

const BASE_URL = `https://api.cloudflare.com/client/v4/accounts/${resolvedAccountId}/ai/v1`
const MODEL = '@cf/meta/llama-3.1-8b-instruct'
const TIMEOUT_MS = 20_000

const VALID_CATEGORIES = ['attraction', 'neighborhood', 'food_cafe', 'logistics']
const REQUIRED_FIELDS = ['id', 'city', 'title', 'category', 'region', 'summary', 'content', 'tags', 'updatedAt']

console.log(`\n${'═'.repeat(65)}`)
console.log(`  PALM MAP — Geração de Dataset`)
console.log(`  Cidade: ${city}  |  Lugares: ${places.length}  |  ID: ${artifactId}`)
console.log(`${'═'.repeat(65)}\n`)

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are a travel dataset generator for the palm-map app.
Given a place name and city, output a single JSON object with these fields:

{
  "id": "<city-lowercase>-<category>-<slug>",
  "city": "<exact city name>",
  "title": "<place name, properly capitalized>",
  "category": "attraction" | "neighborhood" | "food_cafe" | "logistics",
  "region": "<neighborhood or area within the city>",
  "summary": "<1-2 sentences, factual, 20-120 chars>",
  "content": "<2-4 sentences of practical travel info, 60-400 chars>",
  "tags": ["<tag1>", "<tag2>", "<tag3>"],
  "source": "llm-draft:${artifactId}",
  "updatedAt": "${new Date().toISOString().slice(0, 10)}"
}

Category guide:
- attraction: museum, monument, park, historical site, cultural venue
- neighborhood: area or district worth visiting
- food_cafe: restaurant, bar, market, cafe
- logistics: airport, transport, safety tips, practical info

Rules:
- ONLY output the JSON object. No prose, no explanation, no markdown.
- Use Portuguese for summary and content (Brazilian Portuguese).
- Do not invent facts. If unsure about a detail, keep it generic.
- tags: 2-4 items, lowercase, 2+ chars each.
- summary: minimum 20 characters, maximum 120.
- content: minimum 60 characters, maximum 400.
- id: lowercase, hyphens only, pattern: <city-slug>-<category>-<place-slug>

Example output for "Marco Zero" in Recife:
{
  "id": "recife-attraction-marco-zero",
  "city": "Recife",
  "title": "Marco Zero",
  "category": "attraction",
  "region": "Recife Antigo",
  "summary": "Praca historica e ponto de partida comum para visitar o centro antigo.",
  "content": "O Marco Zero fica na Praca Rio Branco, no bairro do Recife Antigo. O local concentra movimento de visitantes, feiras sazonais e acesso facil para caminhar pela area historica.",
  "tags": ["centro historico", "recife antigo", "passeio a pe"],
  "source": "llm-draft:${artifactId}",
  "updatedAt": "${new Date().toISOString().slice(0, 10)}"
}`

// ---------------------------------------------------------------------------
// LLM call
// ---------------------------------------------------------------------------
async function generateDocument(placeName) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${resolvedApiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.1,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Generate the JSON document for: "${placeName}" in ${city}` },
        ],
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      return { ok: false, reason: `http_${response.status}` }
    }

    const body = await response.json()
    const content = body?.choices?.[0]?.message?.content ?? ''

    // Extract JSON from content (model may wrap in markdown)
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { ok: false, reason: 'no_json_in_response', raw: content.slice(0, 200) }
    }

    let doc
    try {
      doc = JSON.parse(jsonMatch[0])
    } catch {
      return { ok: false, reason: 'json_parse_error', raw: jsonMatch[0].slice(0, 200) }
    }

    return { ok: true, doc }
  } catch (err) {
    if (err.name === 'AbortError') return { ok: false, reason: 'timeout' }
    return { ok: false, reason: err.message }
  } finally {
    clearTimeout(timeout)
  }
}

// ---------------------------------------------------------------------------
// Validation (mirrors ingest.mjs rules)
// ---------------------------------------------------------------------------
function validateDoc(doc, expectedCity) {
  const errors = []
  if (!doc || typeof doc !== 'object') return ['not an object']

  for (const field of REQUIRED_FIELDS) {
    if (doc[field] === undefined || doc[field] === null || doc[field] === '') {
      errors.push(`missing field: ${field}`)
    }
  }

  if (doc.city !== undefined && doc.city !== expectedCity) {
    errors.push(`city="${doc.city}" should be "${expectedCity}"`)
  }

  if (doc.category !== undefined && !VALID_CATEGORIES.includes(doc.category)) {
    errors.push(`invalid category: "${doc.category}"`)
  }

  if (!Array.isArray(doc.tags) || doc.tags.length === 0) {
    errors.push('tags must be non-empty array')
  }

  if (typeof doc.summary === 'string' && doc.summary.length < 10) {
    errors.push(`summary too short (${doc.summary.length} chars, min 10)`)
  }

  if (typeof doc.content === 'string' && doc.content.length < 30) {
    errors.push(`content too short (${doc.content.length} chars, min 30)`)
  }

  return errors
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const docs = []
  const report = { ok: 0, invalid: 0, failed: 0 }

  for (let i = 0; i < places.length; i++) {
    const placeName = places[i]
    process.stdout.write(`[${i + 1}/${places.length}] ${placeName} ... `)

    const result = await generateDocument(placeName)

    if (!result.ok) {
      console.log(`❌ FALHOU (${result.reason})`)
      if (result.raw) console.log(`    raw: ${result.raw}`)
      report.failed++
      continue
    }

    // Auto-fix: ensure city and source are correct
    result.doc.city = city
    result.doc.source = `llm-draft:${artifactId}`
    result.doc.updatedAt = result.doc.updatedAt ?? new Date().toISOString().slice(0, 10)

    const errors = validateDoc(result.doc, city)
    if (errors.length > 0) {
      console.log(`⚠️  INVÁLIDO`)
      errors.forEach((e) => console.log(`    → ${e}`))
      docs.push(result.doc) // include anyway so user can review/fix
      report.invalid++
    } else {
      console.log(`✅ OK`)
      docs.push(result.doc)
      report.ok++
    }
  }

  // Write draft
  mkdirSync(resolve(ROOT, 'datasets'), { recursive: true })
  writeFileSync(DRAFT_PATH, JSON.stringify(docs, null, 2))

  console.log(`\n${'═'.repeat(65)}`)
  console.log(`  RESUMO`)
  console.log(`  ✅ OK: ${report.ok}  ⚠️  inválido: ${report.invalid}  ❌ falhou: ${report.failed}`)
  console.log(`  Draft escrito em: ${DRAFT_PATH}`)
  console.log(`${'═'.repeat(65)}`)
  console.log(`\nPróximos passos:`)
  console.log(`  1. Revisar e editar o draft acima`)
  console.log(`  2. mv ${DRAFT_PATH} ${DRAFT_PATH.replace('.draft.json', '.documents.json')}`)
  console.log(`  3. node scripts/ingest.mjs --city "${city}" --input datasets/${artifactId}.documents.json --id ${artifactId}`)
  console.log('')

  if (report.failed > 0 || report.invalid > 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Erro fatal:', err)
  process.exit(1)
})
