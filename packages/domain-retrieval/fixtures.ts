import type { PlaceCandidate } from '../shared-types'

export const placeFixturesByDestination: { recife: PlaceCandidate[] } = {
  recife: [
    {
      name: 'Marco Zero',
      location: 'Recife Antigo, Recife, PE',
      source: 'mock-guide:recife-v1',
      confidence: 0.96,
    },
    {
      name: 'Praia de Boa Viagem',
      location: 'Boa Viagem, Recife, PE',
      source: 'mock-guide:recife-v1',
      confidence: 0.95,
    },
    {
      name: 'Parque Dona Lindu',
      location: 'Boa Viagem, Recife, PE',
      source: 'mock-guide:recife-v1',
      confidence: 0.88,
    },
    {
      name: 'Instituto Ricardo Brennand',
      location: 'Várzea, Recife, PE',
      source: 'mock-guide:recife-v1',
      confidence: 0.94,
    },
    {
      name: 'Oficina Ceramica Francisco Brennand',
      location: 'Várzea, Recife, PE',
      source: 'mock-guide:recife-v1',
      confidence: 0.9,
    },
    {
      name: 'Cais do Sertao',
      location: 'Recife Antigo, Recife, PE',
      source: 'mock-guide:recife-v1',
      confidence: 0.91,
    },
    {
      name: 'Paco do Frevo',
      location: 'Recife Antigo, Recife, PE',
      source: 'mock-guide:recife-v1',
      confidence: 0.9,
    },
  ],
}

const domainRetrievalModule = {
  placeFixturesByDestination,
}

export default domainRetrievalModule
