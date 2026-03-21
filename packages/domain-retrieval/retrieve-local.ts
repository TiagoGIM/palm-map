import type { RetrieveHit, RetrieveInput, RetrieveResult } from '../shared-types'
import { recifeV1Chunks } from './artifacts/recife-v1.chunks'

const DEFAULT_TOP_K = 5
const MAX_TOP_K = 10

export function retrieveLocalRecifeV1(input: RetrieveInput): RetrieveResult {
  return retrieveLocalRecifeV1WithContext(input)
}

export function retrieveLocalRecifeV1WithContext(
  input: RetrieveInput,
  context?: {
    regionHint?: string
    categoryHint?: 'attraction' | 'neighborhood' | 'food_cafe' | 'logistics'
  },
): RetrieveResult {
  const query = input.query.trim()
  const city = normalizeCity(input.city)
  const topK = clampTopK(input.topK)
  const normalizedRegionHint = normalizeText(context?.regionHint ?? '')

  const normalizedQuery = normalizeText(query)
  const queryTokens = uniqueTokens(normalizedQuery)

  const ranked = recifeV1Chunks
    .filter((chunk) => normalizeText(chunk.city) === city)
    .map((chunk) => {
      const searchable = normalizeText(
        [chunk.title, chunk.summary, chunk.snippet, chunk.tags.join(' ')].join(' '),
      )
      const score = scoreChunk({
        searchable,
        region: normalizeText(chunk.region),
        category: chunk.category,
        queryTokens,
        regionHint: normalizedRegionHint,
        categoryHint: context?.categoryHint,
      })
      return { chunk, score }
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, topK)

  const results: RetrieveHit[] = ranked.map(({ chunk, score }) => ({
    chunkId: chunk.chunkId,
    docId: chunk.docId,
    city: chunk.city,
    title: chunk.title,
    category: chunk.category,
    region: chunk.region,
    summary: chunk.summary,
    snippet: chunk.snippet,
    tags: chunk.tags,
    source: chunk.source,
    updatedAt: chunk.updatedAt,
    score,
  }))

  if (results.length === 0) {
    return {
      query,
      city: denormalizeCity(city),
      topK,
      results: [],
      warning: 'Nenhum resultado confiavel encontrado no dataset local Recife v1 para essa busca.',
    }
  }

  return {
    query,
    city: denormalizeCity(city),
    topK,
    results,
  }
}

function scoreChunk(params: {
  searchable: string
  region: string
  category: 'attraction' | 'neighborhood' | 'food_cafe' | 'logistics'
  queryTokens: string[]
  regionHint: string
  categoryHint?: 'attraction' | 'neighborhood' | 'food_cafe' | 'logistics'
}): number {
  const { searchable, region, category, queryTokens, regionHint, categoryHint } = params
  if (queryTokens.length === 0) {
    return 0
  }

  const matched = queryTokens.filter((token) => tokenMatches(searchable, token)).length
  if (matched === 0) {
    return 0
  }

  let score = matched / queryTokens.length
  if (regionHint && region.includes(regionHint)) {
    score += 0.35
  }
  if (categoryHint) {
    if (category === categoryHint) {
      score += 0.6
    } else {
      score -= 0.25
    }
  }

  return Number(Math.max(0, Math.min(1, score)).toFixed(3))
}

function clampTopK(topK: number | undefined): number {
  const raw = topK ?? DEFAULT_TOP_K
  if (!Number.isFinite(raw) || raw < 1) {
    return DEFAULT_TOP_K
  }

  return Math.min(MAX_TOP_K, Math.floor(raw))
}

function uniqueTokens(text: string): string[] {
  const tokens = text
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)

  return [...new Set(tokens)]
}

function tokenMatches(searchable: string, token: string): boolean {
  if (searchable.includes(token)) {
    return true
  }

  if (token.length > 3 && token.endsWith('s')) {
    const singular = token.slice(0, -1)
    if (searchable.includes(singular)) {
      return true
    }
  }

  return false
}

function normalizeCity(value: string): string {
  return normalizeText(value)
}

function denormalizeCity(value: string): string {
  if (value === 'recife') {
    return 'Recife'
  }

  return value
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
