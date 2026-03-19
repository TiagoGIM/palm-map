# Create Plan Trip Endpoint

## Goal

Implement the initial `plan-trip` endpoint skeleton in `apps/api`.

## Scope

- Create a small endpoint for `plan-trip`
- Read contracts from `packages/shared-types`
- Use retrieval fixtures from `packages/domain-retrieval`
- Return a minimal valid `PlanTripResult`
- Add basic request validation
- Add a simple and consistent error response
- Keep implementation small and easy to replace later

## Constraints

- Do not implement real retrieval
- Do not implement full planner logic
- Do not add external integrations
- Do not move domain logic into HTTP handlers
- Do not touch frontend
- Keep changes local to `apps/api`

## Expected Behavior

- Accept input matching `PlanTripInput`
- Use `destination` to read existing fixtures
- Return at least one `DayPlan` with items from fixtures
- If destination has no fixture data, return a simple error or warning-based empty result
- Do not invent places

## Validation

- Validate request shape at a basic level
- Ensure response matches `PlanTripResult`
- Keep error handling simple and consistent

## Files Allowed

- `apps/api/**`

## Files Forbidden

- `apps/web/**`
- `packages/shared-types/**`
- `packages/domain-memory/**`
- `packages/domain-trip/**`
- `agents/**`
- `infra/**`

## Execution Rules

- Read only:
  - root `README.md`
  - `docs/product/mvp.md`
  - `apps/api/AGENTS.md`
  - `packages/shared-types`
  - retrieval fixture file
- Keep implementation small and local
- Prefer a replaceable skeleton over a final architecture

## Output

- Show created or updated files
- Briefly explain the endpoint flow
- Mention any ambiguity without expanding scope
