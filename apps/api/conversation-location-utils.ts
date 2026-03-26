import { normalizeCity } from './conversation-city-utils'

const TYPO_CORRECTIONS: Record<string, string> = {
  'rio de janiero': 'Rio de Janeiro',
  'fortalez': 'Fortaleza',
  'recifee': 'Recife',
}

const STATE_ONLY_INPUTS = new Set([
  'acre',
  'alagoas',
  'amapá',
  'amapa',
  'amazonas',
  'bahia',
  'ceará',
  'ceara',
  'distrito federal',
  'espírito santo',
  'espirito santo',
  'goiás',
  'goias',
  'maranhão',
  'maranhao',
  'mato grosso',
  'mato grosso do sul',
  'minas gerais',
  'paraíba',
  'paraiba',
  'pará',
  'para',
  'paraná',
  'parana',
  'pernambuco',
  'piauí',
  'piaui',
  'rio grande do norte',
  'rio grande do sul',
  'rondônia',
  'rondonia',
  'roraima',
  'santa catarina',
  'sergipe',
  'tocantins',
])

export function normalizeGeographicMention(value: string): string | undefined {
  const normalizedCity = normalizeCity(value)
  if (!normalizedCity) {
    return undefined
  }

  const lower = normalizedCity.toLowerCase()
  if (STATE_ONLY_INPUTS.has(lower)) {
    return undefined
  }

  const corrected = TYPO_CORRECTIONS[lower] ?? normalizedCity
  return corrected
}
