async function run() {
  const { handleConversationUpdate } = await import('../conversation-update')
  const baseInput = {
    message:
      'Quero viajar de Natal para Aracaju, sem correria, gosto de praia e comida local.',
  }

  const response = await handleConversationUpdate(baseInput)
  console.log('Caso 1 (mesma rodada) -> response body:')
  console.log(JSON.stringify(response, null, 2))

  const secondInput = {
    message: 'Legal, vou manter tudo igual.',
    tripState: response.body.tripState,
  }

  const response2 = await handleConversationUpdate(secondInput)
  console.log('Caso 2 (pref. reaproveitadas) -> response body:')
  console.log(JSON.stringify(response2, null, 2))
}

run().catch((error) => {
  console.error('Erro:', error)
  process.exit(1)
})
