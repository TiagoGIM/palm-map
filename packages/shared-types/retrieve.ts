export type RetrieveInput = {
  query: string
  city: string
  topK?: number
}

export type RetrievalCategory =
  | 'attraction'
  | 'neighborhood'
  | 'food_cafe'
  | 'logistics'

export type RetrieveHit = {
  chunkId: string
  docId: string
  city: string
  title: string
  category: RetrievalCategory
  region: string
  summary: string
  snippet: string
  tags: string[]
  source: string
  updatedAt: string
  score: number
}

export type RetrieveResult = {
  query: string
  city: string
  topK: number
  results: RetrieveHit[]
  warning?: string
}
