import { describe, it, expect, vi } from 'vitest'
import { loadSessionState, saveSessionState } from '../../../packages/domain-memory'
import type { D1Database } from '../../../packages/domain-memory'
import type { TripState } from '../../../packages/shared-types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDb(firstResult: unknown): D1Database {
  const statement = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(firstResult),
    run: vi.fn().mockResolvedValue({ success: true }),
    all: vi.fn().mockResolvedValue({ results: [] }),
  }
  return {
    prepare: vi.fn().mockReturnValue(statement),
    batch: vi.fn().mockResolvedValue([{ success: true }]),
  }
}

const sampleTripState: TripState = {
  origin: 'Recife',
  destination: 'Salvador',
  daysTotal: 7,
  stops: [],
  savedPlacesByCity: [],
  preferences: { likes: [], dislikes: [] },
}

// ---------------------------------------------------------------------------
// loadSessionState
// ---------------------------------------------------------------------------

describe('loadSessionState', () => {
  it('returns deserialized TripState when row exists', async () => {
    const db = makeDb({ trip_state: JSON.stringify(sampleTripState) })
    const result = await loadSessionState(db, 'session-abc')
    expect(result).toEqual(sampleTripState)
  })

  it('returns null when row does not exist', async () => {
    const db = makeDb(null)
    const result = await loadSessionState(db, 'session-missing')
    expect(result).toBeNull()
  })

  it('returns null when stored JSON is corrupted', async () => {
    const db = makeDb({ trip_state: '{not valid json}}' })
    const result = await loadSessionState(db, 'session-corrupted')
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// saveSessionState
// ---------------------------------------------------------------------------

describe('saveSessionState', () => {
  it('calls prepare + bind + run with the correct session id and serialized state', async () => {
    const statement = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ success: true }),
      first: vi.fn(),
      all: vi.fn(),
    }
    const db: D1Database = {
      prepare: vi.fn().mockReturnValue(statement),
      batch: vi.fn(),
    }

    await saveSessionState(db, 'session-xyz', sampleTripState)

    expect(db.prepare).toHaveBeenCalledOnce()
    const prepareArg = (db.prepare as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(prepareArg).toContain('INSERT INTO sessions')
    expect(prepareArg).toContain('ON CONFLICT')

    expect(statement.bind).toHaveBeenCalledWith('session-xyz', JSON.stringify(sampleTripState))
    expect(statement.run).toHaveBeenCalledOnce()
  })
})
