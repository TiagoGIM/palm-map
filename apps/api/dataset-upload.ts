import type { DatasetError, DatasetUploadInput, DatasetUploadResult } from '../../packages/shared-types'
import type { D1Database } from '../../packages/domain-memory'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DatasetUploadHttpResponse =
  | { status: 200; body: DatasetUploadResult }
  | { status: 400; body: { error: { code: 'invalid_request'; message: string } } }
  | { status: 503; body: { error: { code: 'db_unavailable'; message: string } } }

const VALID_CATEGORIES = ['attraction', 'neighborhood', 'food_cafe', 'logistics'] as const
const REQUIRED_FIELDS = [
  'id', 'city', 'title', 'category', 'region',
  'summary', 'content', 'tags', 'source', 'updatedAt',
] as const

const CHUNK_MAX_CHARS = 320
const CHUNK_OVERLAP = 60

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleDatasetUpload(
  requestBody: unknown,
  db: D1Database | undefined,
): Promise<DatasetUploadHttpResponse> {
  if (!db) {
    return {
      status: 503,
      body: {
        error: {
          code: 'db_unavailable',
          message: 'Dataset upload requires D1 to be configured. See wrangler.toml for setup instructions.',
        },
      },
    }
  }

  const input = parseDatasetUploadInput(requestBody)
  if (!input) {
    return {
      status: 400,
      body: {
        error: {
          code: 'invalid_request',
          message: 'Request body must include { city: string, documents: unknown[] }.',
        },
      },
    }
  }

  const { city, documents, artifactId } = input
  const uploadedAt = new Date().toISOString().slice(0, 10)
  const autoSource = `upload:${city.toLowerCase().replace(/\s+/g, '-')}-${uploadedAt}`
  const artifactPrefix = artifactId ?? city.toLowerCase().replace(/\s+/g, '-')

  const errors: DatasetError[] = []
  const statements: ReturnType<D1Database['prepare']>[] = []
  let imported = 0
  let skipped = 0

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i]
    const docErrors = validateDocument(doc, city, i)

    if (docErrors.length > 0) {
      errors.push(...docErrors)
      skipped++
      continue
    }

    const validDoc = doc as Record<string, unknown>
    const overriddenDoc = {
      ...validDoc,
      source: autoSource,
    }

    const chunks = buildChunks(overriddenDoc, artifactPrefix)

    for (const chunk of chunks) {
      statements.push(
        db.prepare(
          `INSERT INTO document_chunks
             (chunk_id, doc_id, city, title, category, region, summary, content, snippet, tags, source, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(chunk_id) DO UPDATE SET
             doc_id     = excluded.doc_id,
             city       = excluded.city,
             title      = excluded.title,
             category   = excluded.category,
             region     = excluded.region,
             summary    = excluded.summary,
             content    = excluded.content,
             snippet    = excluded.snippet,
             tags       = excluded.tags,
             source     = excluded.source,
             updated_at = excluded.updated_at`,
        ).bind(
          chunk.chunkId,
          chunk.docId,
          chunk.city,
          chunk.title,
          chunk.category,
          chunk.region,
          chunk.summary,
          chunk.content,
          chunk.snippet,
          JSON.stringify(chunk.tags),
          chunk.source,
          chunk.updatedAt,
        ),
      )
    }

    imported++
  }

  // Execute all upserts in one batch
  if (statements.length > 0) {
    try {
      await db.batch(statements)
    } catch (batchError) {
      errors.push({
        index: -1,
        message: `D1 batch write failed: ${batchError instanceof Error ? batchError.message : 'unknown error'}`,
      })
      imported = 0
      skipped = documents.length
    }
  }

  return {
    status: 200,
    body: { imported, skipped, errors },
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateDocument(doc: unknown, expectedCity: string, index: number): DatasetError[] {
  const errors: DatasetError[] = []

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    errors.push({ index, message: 'must be a JSON object' })
    return errors
  }

  const d = doc as Record<string, unknown>
  const docId = typeof d['id'] === 'string' ? d['id'] : undefined

  for (const field of REQUIRED_FIELDS) {
    if (d[field] === undefined || d[field] === null || d[field] === '') {
      errors.push({ index, docId, message: `missing required field: ${field}` })
    }
  }

  if (typeof d['city'] === 'string' && d['city'] !== expectedCity) {
    errors.push({
      index,
      docId,
      message: `city "${d['city']}" does not match expected "${expectedCity}"`,
    })
  }

  if (
    typeof d['category'] === 'string' &&
    !(VALID_CATEGORIES as readonly string[]).includes(d['category'])
  ) {
    errors.push({
      index,
      docId,
      message: `invalid category "${d['category']}" — valid: ${VALID_CATEGORIES.join(', ')}`,
    })
  }

  if (!Array.isArray(d['tags']) || d['tags'].length === 0) {
    errors.push({ index, docId, message: 'tags must be a non-empty array' })
  }

  if (
    typeof d['updatedAt'] !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(d['updatedAt'])
  ) {
    errors.push({ index, docId, message: `updatedAt must match YYYY-MM-DD, got: "${String(d['updatedAt'])}"` })
  }

  if (typeof d['summary'] === 'string' && d['summary'].length < 10) {
    errors.push({ index, docId, message: 'summary too short (min 10 chars)' })
  }

  if (typeof d['content'] === 'string' && d['content'].length < 30) {
    errors.push({ index, docId, message: 'content too short (min 30 chars)' })
  }

  return errors
}

// ---------------------------------------------------------------------------
// Chunking (ported from scripts/ingest.mjs)
// ---------------------------------------------------------------------------

type Chunk = {
  chunkId: string
  docId: string
  city: string
  title: string
  category: string
  region: string
  summary: string
  content: string
  snippet: string
  tags: string[]
  source: string
  updatedAt: string
}

function buildChunks(doc: Record<string, unknown>, artifactPrefix: string): Chunk[] {
  const text = normalizeSpaces(`${String(doc['summary'])}\n\n${String(doc['content'])}`)
  const parts = splitByWindow(text, CHUNK_MAX_CHARS, CHUNK_OVERLAP)
  const docId = String(doc['id'])

  return parts.map((part, index) => ({
    chunkId: `${artifactPrefix}-${docId}-chunk-${index + 1}`,
    docId,
    city: String(doc['city']),
    title: String(doc['title']),
    category: String(doc['category']),
    region: String(doc['region']),
    summary: String(doc['summary']),
    content: String(doc['content']),
    snippet: part,
    tags: Array.isArray(doc['tags']) ? (doc['tags'] as string[]) : [],
    source: String(doc['source']),
    updatedAt: String(doc['updatedAt']),
  }))
}

function splitByWindow(text: string, maxChars: number, overlapChars: number): string[] {
  if (text.length <= maxChars) return [text]

  const out: string[] = []
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

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

// ---------------------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------------------

function parseDatasetUploadInput(value: unknown): DatasetUploadInput | null {
  if (!isRecord(value)) return null

  const { city, documents, artifactId } = value

  if (typeof city !== 'string' || city.trim() === '') return null
  if (!Array.isArray(documents)) return null

  return {
    city: city.trim(),
    documents,
    artifactId: typeof artifactId === 'string' ? artifactId.trim() : undefined,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
