-- Session state: stores the TripState JSON keyed by browser-generated session ID.
-- One row per session. Updated on every conversation turn.
CREATE TABLE IF NOT EXISTS sessions (
  session_id   TEXT    PRIMARY KEY,
  trip_state   TEXT    NOT NULL,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
