import type { TripState } from '../../packages/shared-types'

// Minimal D1 interface — matches the Cloudflare Workers D1Database binding.
// Only the subset of methods used here is declared.
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>
  run(): Promise<{ success: boolean }>
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement
  batch(statements: D1PreparedStatement[]): Promise<{ success: boolean }[]>
}

// ---------------------------------------------------------------------------
// Session persistence (D1)
// ---------------------------------------------------------------------------

/** Loads the stored TripState for a session, or null if not found. */
export async function loadSessionState(
  db: D1Database,
  sessionId: string,
): Promise<TripState | null> {
  const row = await db
    .prepare('SELECT trip_state FROM sessions WHERE session_id = ?')
    .bind(sessionId)
    .first<{ trip_state: string }>()

  if (!row) return null

  try {
    return JSON.parse(row.trip_state) as TripState
  } catch {
    return null
  }
}

/** Upserts the TripState for a session. */
export async function saveSessionState(
  db: D1Database,
  sessionId: string,
  tripState: TripState,
): Promise<void> {
  const json = JSON.stringify(tripState)
  await db
    .prepare(
      `INSERT INTO sessions (session_id, trip_state, created_at, updated_at)
       VALUES (?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(session_id) DO UPDATE SET
         trip_state = excluded.trip_state,
         updated_at = excluded.updated_at`,
    )
    .bind(sessionId, json)
    .run()
}

// ---------------------------------------------------------------------------
// In-memory preferences (legacy, kept for plan-trip flow)
// ---------------------------------------------------------------------------

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
  loadSessionState,
  saveSessionState,
}

export default domainMemoryModule
