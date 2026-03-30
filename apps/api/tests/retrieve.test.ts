import { describe, expect, it } from 'vitest'
import type { D1Database } from '../../../packages/domain-memory'
import { handleRetrieve } from '../retrieve'

type D1ChunkRow = {
  chunk_id: string
  doc_id: string
  city: string
  title: string
  category: string
  region: string
  summary: string
  content: string
  snippet: string
  tags: string
  source: string
  updated_at: string
}

function createMockDb(rows: D1ChunkRow[]): D1Database {
  return {
    prepare(query: string) {
      let boundCity: string | undefined
      return {
        bind(...values: unknown[]) {
          boundCity = typeof values[0] === 'string' ? values[0] : undefined
          return this
        },
        async first() {
          return null
        },
        async run() {
          return { success: true }
        },
        async all<T = Record<string, unknown>>() {
          if (query.includes('WHERE lower(city) = ?')) {
            const filtered = rows.filter(
              (row) => row.city.toLowerCase() === (boundCity ?? ''),
            )
            return { results: filtered as T[] }
          }
          return { results: rows as T[] }
        },
      }
    },
    async batch() {
      return [{ success: true }]
    },
  }
}

describe('handleRetrieve', () => {
  it('finds D1 rows for city names without accent when stored city has accent', async () => {
    const db = createMockDb([
      {
        chunk_id: 'joao-pessoa-praia-tambau-chunk-1',
        doc_id: 'joao-pessoa-praia-tambau',
        city: 'João Pessoa',
        title: 'Praia de Tambaú',
        category: 'attraction',
        region: 'Tambaú',
        summary: 'Praia urbana com passeios e orla movimentada.',
        content: 'Passeios de barco e praia urbana em João Pessoa.',
        snippet: 'Praia urbana com passeios de barco.',
        tags: '["praia","passeio"]',
        source: 'upload:joao-pessoa-2026-03-30',
        updated_at: '2026-03-30',
      },
    ])

    const response = await handleRetrieve(
      { city: 'Joao Pessoa', query: 'praias e passeios', topK: 3 },
      db,
    )

    expect(response.status).toBe(200)
    if (response.status !== 200) return
    expect(response.body.results.length).toBeGreaterThan(0)
    expect(response.body.results[0]?.city).toBe('João Pessoa')
  })

  it('prioritizes D1 warning when merged result is empty', async () => {
    const db = createMockDb([])

    const response = await handleRetrieve(
      { city: 'João Pessoa', query: 'praias e passeios', topK: 3 },
      db,
    )

    expect(response.status).toBe(200)
    if (response.status !== 200) return
    expect(response.body.results).toHaveLength(0)
    expect(response.body.warning).toBe(
      'Nenhum resultado encontrado nos datasets enviados para essa busca.',
    )
  })
})
