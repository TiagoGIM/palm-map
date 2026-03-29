#!/usr/bin/env node
/**
 * CLI de ingestão genérica para datasets do palm-map.
 *
 * Uso:
 *   node ingest.mjs --city <CityName> --input <path/to/docs.json> [--id <artifact-id>]
 *
 * Exemplos:
 *   node ingest.mjs --city Recife --input ../datasets/recife-v1.documents.json --id recife-v1
 *   node ingest.mjs --city Salvador --input ../datasets/salvador-v1.documents.json --id salvador-v1
 *   node ingest.mjs --validate-only --city Fortaleza --input ../datasets/fortaleza-v1.documents.json
 *
 * Flags:
 *   --city         Nome da cidade (obrigatório). Deve bater com o campo "city" de todos os docs.
 *   --input        Caminho para o arquivo .json com array de documentos (obrigatório).
 *   --id           Identificador do artefato gerado (padrão: <city-lowercase>-v1).
 *   --validate-only  Só valida, sem gerar artefatos.
 *   --output-dir   Diretório de saída dos artefatos (padrão: ../artifacts/).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--validate-only') {
      args.validateOnly = true
    } else if (arg.startsWith('--') && i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      args[key] = argv[++i]
    }
  }
  return args
}

const args = parseArgs(process.argv.slice(2))

if (!args.city) {
  console.error('Error: --city is required.')
  console.error('Usage: node ingest.mjs --city <CityName> --input <path> [--id <artifact-id>]')
  process.exit(1)
}

if (!args.input) {
  console.error('Error: --input is required.')
  console.error('Usage: node ingest.mjs --city <CityName> --input <path> [--id <artifact-id>]')
  process.exit(1)
}

const city = args.city.trim()
const inputPath = resolve(process.cwd(), args.input)
const artifactId = args.id ?? `${city.toLowerCase().replace(/\s+/g, '-')}-v1`
const outputDir = args.outputDir ? resolve(process.cwd(), args.outputDir) : resolve(__dirname, '../artifacts')
const validateOnly = args.validateOnly === true

const ARTIFACT_JSON_PATH = resolve(outputDir, `${artifactId}.chunks.json`)
const ARTIFACT_TS_PATH = resolve(outputDir, `${artifactId}.chunks.ts`)

// ---------------------------------------------------------------------------
// Load and validate
// ---------------------------------------------------------------------------
let dataset
try {
  dataset = JSON.parse(readFileSync(inputPath, 'utf-8'))
} catch (err) {
  console.error(`Error reading input file: ${inputPath}`)
  console.error(err.message)
  process.exit(1)
}

if (!Array.isArray(dataset)) {
  console.error('Error: input file must contain a JSON array of documents.')
  process.exit(1)
}

const VALID_CATEGORIES = ['attraction', 'neighborhood', 'food_cafe', 'logistics']
const REQUIRED_FIELDS = ['id', 'city', 'title', 'category', 'region', 'summary', 'content', 'tags', 'source', 'updatedAt']

const validationErrors = validateDocuments(dataset, city)
if (validationErrors.length > 0) {
  const joined = validationErrors.map((e) => `  - ${e}`).join('\n')
  console.error(`Validation failed (${validationErrors.length} error${validationErrors.length > 1 ? 's' : ''}):\n${joined}`)
  process.exit(1)
}

console.log(`✓ Validation passed: ${dataset.length} document${dataset.length !== 1 ? 's' : ''} OK`)

if (validateOnly) {
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Build and write artifacts
// ---------------------------------------------------------------------------
const chunks = buildChunks(dataset)
mkdirSync(outputDir, { recursive: true })
writeFileSync(ARTIFACT_JSON_PATH, JSON.stringify(chunks, null, 2))
writeFileSync(ARTIFACT_TS_PATH, toTsModule(chunks, artifactId))

console.log(`✓ Artifacts written:`)
console.log(`    JSON → ${ARTIFACT_JSON_PATH}`)
console.log(`    TS   → ${ARTIFACT_TS_PATH}`)
console.log(`    docs=${dataset.length}  chunks=${chunks.length}  id=${artifactId}`)

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
function validateDocuments(documents, expectedCity) {
  const errors = []

  documents.forEach((doc, i) => {
    const label = `doc[${i}]${doc.id ? ` (${doc.id})` : ''}`

    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
      errors.push(`${label} must be an object`)
      return
    }

    for (const field of REQUIRED_FIELDS) {
      if (doc[field] === undefined || doc[field] === null || doc[field] === '') {
        errors.push(`${label} missing required field: ${field}`)
      }
    }

    if (doc.city !== expectedCity) {
      errors.push(`${label} city="${doc.city}" does not match expected "${expectedCity}"`)
    }

    if (!VALID_CATEGORIES.includes(doc.category)) {
      errors.push(`${label} invalid category: "${String(doc.category)}" — valid: ${VALID_CATEGORIES.join(', ')}`)
    }

    if (!Array.isArray(doc.tags) || doc.tags.length === 0) {
      errors.push(`${label} tags must be a non-empty array`)
    }

    if (typeof doc.updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(doc.updatedAt)) {
      errors.push(`${label} updatedAt must match YYYY-MM-DD, got: "${String(doc.updatedAt)}"`)
    }

    if (typeof doc.summary === 'string' && doc.summary.length < 10) {
      errors.push(`${label} summary too short (min 10 chars)`)
    }

    if (typeof doc.content === 'string' && doc.content.length < 30) {
      errors.push(`${label} content too short (min 30 chars)`)
    }
  })

  return errors
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------
function buildChunks(documents) {
  const maxChars = 320
  const overlap = 60
  const chunks = []

  for (const doc of documents) {
    const text = normalizeSpaces(`${doc.summary}\n\n${doc.content}`)
    const parts = splitByWindow(text, maxChars, overlap)

    parts.forEach((part, index) => {
      chunks.push({
        chunkId: `${doc.id}-chunk-${index + 1}`,
        docId: doc.id,
        city: doc.city,
        title: doc.title,
        category: doc.category,
        region: doc.region,
        summary: doc.summary,
        content: doc.content,
        snippet: part,
        tags: doc.tags,
        source: doc.source,
        updatedAt: doc.updatedAt,
      })
    })
  }

  return chunks
}

function splitByWindow(text, maxChars, overlapChars) {
  if (text.length <= maxChars) return [text]

  const out = []
  let start = 0

  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length)
    let piece = text.slice(start, end)

    if (end < text.length) {
      const lastBreak = Math.max(piece.lastIndexOf('. '), piece.lastIndexOf('; '))
      if (lastBreak > 100) piece = piece.slice(0, lastBreak + 1)
    }

    out.push(piece.trim())
    if (end >= text.length) break

    const nextStart = start + piece.length - overlapChars
    start = nextStart > start ? nextStart : end
  }

  return out
}

function normalizeSpaces(value) {
  return value.replace(/\s+/g, ' ').trim()
}

// ---------------------------------------------------------------------------
// TypeScript module generation
// ---------------------------------------------------------------------------
function toTsModule(chunks, id) {
  const exportName = toCamelCase(id) + 'Chunks'
  return [
    `// Auto-generated by scripts/ingest.mjs --id ${id}`,
    '// Do not edit manually. Re-run ingest.mjs to regenerate.',
    '',
    'export type RetrievalChunkArtifact = {',
    '  chunkId: string',
    '  docId: string',
    '  city: string',
    '  title: string',
    "  category: 'attraction' | 'neighborhood' | 'food_cafe' | 'logistics'",
    '  region: string',
    '  summary: string',
    '  content: string',
    '  snippet: string',
    '  tags: string[]',
    '  source: string',
    '  updatedAt: string',
    '}',
    '',
    `export const ${exportName}: RetrievalChunkArtifact[] = ${JSON.stringify(chunks, null, 2)}\n`,
  ].join('\n')
}

function toCamelCase(id) {
  return id
    .split(/[-_\s]+/)
    .map((part, i) => (i === 0 ? part.toLowerCase() : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()))
    .join('')
}
