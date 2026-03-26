let storedPreferencesText: string | undefined

export function resolveEffectivePreferencesText(
  explicitPreferencesText: string | undefined,
): string | undefined {
  if (explicitPreferencesText !== undefined) {
    storedPreferencesText = explicitPreferencesText
    return explicitPreferencesText
  }

  return storedPreferencesText
}

const domainMemoryModule = {
  resolveEffectivePreferencesText,
}

export default domainMemoryModule
