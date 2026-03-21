/**
 * Shared city/place name normalization utilities.
 * Used by conversation-update pipeline and conversation-llm-adapter.
 */

export function normalizeCity(value: string): string {
  const compactBase = value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^praia\s+de\s+/i, '')
    .replace(/\s*\/\s*[a-z]{2}\b.*$/i, '')
    .replace(/\s*-\s*[a-z]{2}\b.*$/i, '')
    .replace(/\s+e\s+seguir.*$/i, '')
    .replace(/\s+e\s+depois.*$/i, '')
    .replace(/\s+no\s+caminho.*$/i, '')
    .replace(/[.,;:!?]+$/g, '')
    .trim()

  const compact = stripCityTailNoise(compactBase)
  if (!compact) {
    return ''
  }

  return compact
    .split(' ')
    .map((part, index) => {
      const lowerPart = part.toLowerCase()
      if (
        index > 0 &&
        ['de', 'da', 'do', 'das', 'dos', 'e'].includes(lowerPart)
      ) {
        return lowerPart
      }

      return lowerPart[0].toUpperCase() + lowerPart.slice(1)
    })
    .join(' ')
}

function stripCityTailNoise(value: string): string {
  const noiseTokens = new Set([
    'vou',
    'quero',
    'pretendo',
    'passar',
    'ficar',
    'seguir',
    'viajar',
    'serao',
    'serão',
    'sera',
    'será',
  ])

  const parts = value.split(' ').filter(Boolean)
  while (parts.length > 1) {
    const tail = parts[parts.length - 1]?.toLowerCase()
    if (!tail || !noiseTokens.has(tail)) {
      break
    }
    parts.pop()
  }

  return parts.join(' ').trim()
}
