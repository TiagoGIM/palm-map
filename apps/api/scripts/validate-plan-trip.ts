
type PlanTripScenario = {
  name: string
  input: unknown
  expectFallback: boolean
}

const FALLBACK_WARNING =
  'Nao ha evidencias retrieval recentes; usando fixtures padrao para montar o roteiro.'

const scenarios: PlanTripScenario[] = [
  {
    name: 'conversa com suggestions',
    input: {
      origin: 'Fortaleza',
      destination: 'Recife',
      days: 2,
      tripState: {
        conversationMeta: {
          lastSuggestions: [
            {
              rank: 1,
              city: 'Recife',
              region: 'Várzea',
              title: 'Instituto Ricardo Brennand',
              category: 'attraction',
              summary: 'Museu com colecao de arte.',
              source: 'manual:recife-v1',
              score: 0.92,
              docId: 'recife-attraction-instituto-ricardo-brennand',
              chunkId: 'recife-attraction-instituto-ricardo-brennand-chunk-1',
            },
          ],
        },
      },
    },
    expectFallback: false,
  },
  {
    name: 'sem suggestions',
    input: {
      origin: 'Fortaleza',
      destination: 'Recife',
      days: 2,
    },
    expectFallback: true,
  },
]

async function runValidation() {
  const { handlePlanTrip } = await import('../plan-trip')
  for (const scenario of scenarios) {
    console.log(`executando cenarios: ${scenario.name}`)
    const result = await handlePlanTrip(scenario.input)

    if (result.status !== 200) {
      console.error(`[${scenario.name}] status ${result.status}`)
      process.exit(1)
    }

    const warnings = result.body.warnings ?? []
    const hasFallbackWarning = warnings.includes(FALLBACK_WARNING)

    if (scenario.expectFallback && !hasFallbackWarning) {
      console.error(`[${scenario.name}] esperava fallback warning mas nao recebeu.`)
      process.exit(1)
    }

    if (!scenario.expectFallback && hasFallbackWarning) {
      console.error(`[${scenario.name}] nao esperava fallback warning, mas recebeu.`)
      process.exit(1)
    }

    console.log(
      `[${scenario.name}] ok (${scenario.expectFallback ? 'fallback' : 'grounded'}).`,
    )
  }

  console.log('Validacao plan-trip concluida.')
}

runValidation().catch((error) => {
  console.error('Erro na validacao:', error)
  process.exit(1)
})
