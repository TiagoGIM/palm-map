import { handleConversationUpdate } from '../conversation-update'

async function run() {
  const baseInput = {
    message:
      'Quero viajar de Natal para Aracaju, sem correria, gosto de praia e comida local.',
  }

  const response = await handleConversationUpdate(baseInput)
  if (response.status !== 200) {
    throw new Error('Erro ao validar preferencias: ' + response.body.error.message)
  }
  console.log('Caso 1 (mesma rodada) -> response body:')
  console.log(JSON.stringify(response.body, null, 2))

  const secondInput = {
    message: 'Legal, vou manter tudo igual.',
    tripState: response.body.tripState,
  }

  const response2 = await handleConversationUpdate(secondInput)
  if (response2.status !== 200) {
    throw new Error('Erro ao validar preferências reaproveitadas: ' + response2.body.error.message)
  }
  console.log('Caso 2 (pref. reaproveitadas) -> response body:')
  console.log(JSON.stringify(response2.body, null, 2))
}

run().catch((error) => {
  console.error('Erro:', error)
  process.exit(1)
})
