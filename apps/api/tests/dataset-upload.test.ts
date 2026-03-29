import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleDatasetUpload } from '../dataset-upload'
import type { D1Database } from '../../../packages/domain-memory'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeValidDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'recife-attraction-praca-boa-viagem',
    city: 'Recife',
    title: 'Praia de Boa Viagem',
    category: 'attraction',
    region: 'Boa Viagem',
    summary: 'Praia urbana de Recife com extenso calçadão.',
    content: 'Praia de Boa Viagem é a principal praia urbana do Recife, com 8 km de extensão. É famosa pelo calçadão animado, bares e restaurantes à beira-mar. Ideal para caminhadas ao amanhecer.',
    tags: ['praia', 'boa viagem', 'recife'],
    source: 'manual',
    updatedAt: '2026-03-29',
    ...overrides,
  }
}

function makeMockDb(overrides: Partial<D1Database> = {}): D1Database {
  const mockStatement = {
    bind: vi.fn().mockReturnThis(),
    run: vi.fn().mockResolvedValue({ success: true }),
    first: vi.fn().mockResolvedValue(null),
    all: vi.fn().mockResolvedValue({ results: [] }),
  }
  return {
    prepare: vi.fn().mockReturnValue(mockStatement),
    batch: vi.fn().mockResolvedValue([{ success: true }]),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleDatasetUpload', () => {
  it('returns 503 when db is undefined', async () => {
    const result = await handleDatasetUpload(
      { city: 'Recife', documents: [makeValidDoc()] },
      undefined,
    )
    expect(result.status).toBe(503)
    expect((result.body as { error: { code: string } }).error.code).toBe('db_unavailable')
  })

  it('returns 400 when city is missing', async () => {
    const db = makeMockDb()
    const result = await handleDatasetUpload({ documents: [makeValidDoc()] }, db)
    expect(result.status).toBe(400)
    expect((result.body as { error: { code: string } }).error.code).toBe('invalid_request')
  })

  it('returns 400 when documents is not an array', async () => {
    const db = makeMockDb()
    const result = await handleDatasetUpload({ city: 'Recife', documents: 'not-an-array' }, db)
    expect(result.status).toBe(400)
  })

  it('skips invalid doc and reports error, does not count it as imported', async () => {
    const db = makeMockDb()
    const result = await handleDatasetUpload(
      {
        city: 'Recife',
        documents: [
          makeValidDoc({ summary: '' }),  // missing summary → invalid
        ],
      },
      db,
    )
    expect(result.status).toBe(200)
    const body = result.body as { imported: number; skipped: number; errors: unknown[] }
    expect(body.imported).toBe(0)
    expect(body.skipped).toBe(1)
    expect(body.errors.length).toBeGreaterThan(0)
  })

  it('imports valid doc, calls db.batch with upsert statement', async () => {
    const db = makeMockDb()
    const result = await handleDatasetUpload(
      { city: 'Recife', documents: [makeValidDoc()] },
      db,
    )
    expect(result.status).toBe(200)
    const body = result.body as { imported: number; skipped: number; errors: unknown[] }
    expect(body.imported).toBe(1)
    expect(body.skipped).toBe(0)
    expect(body.errors).toHaveLength(0)
    expect(db.batch).toHaveBeenCalledOnce()
  })

  it('returns imported=0 and reports error when db.batch throws', async () => {
    const db = makeMockDb({
      batch: vi.fn().mockRejectedValue(new Error('D1 connection refused')),
    })
    const result = await handleDatasetUpload(
      { city: 'Recife', documents: [makeValidDoc()] },
      db,
    )
    expect(result.status).toBe(200)
    const body = result.body as { imported: number; skipped: number; errors: { message: string }[] }
    expect(body.imported).toBe(0)
    expect(body.errors.length).toBeGreaterThan(0)
    expect(body.errors[0].message).toContain('D1 batch write failed')
  })
})
