import type { DayPlan, PlaceCandidate, PlanTripResult } from '../shared-types'

type BuildPlanTripResultInput = {
  days: number
  places: PlaceCandidate[]
}

export function buildPlanTripResult(
  input: BuildPlanTripResultInput,
): PlanTripResult {
  if (input.places.length === 0) {
    return {
      days: [],
      warnings: ['No grounded places available for planning.'],
    }
  }

  const dayCount = Math.max(1, Math.min(input.days, input.places.length))
  const days = createEmptyDays(dayCount)

  input.places.forEach((place, index) => {
    days[index % dayCount].items.push(place)
  })

  const warnings =
    input.places.length < input.days
      ? ['Not enough grounded places to fill all requested days.']
      : undefined

  return {
    days,
    warnings,
  }
}

function createEmptyDays(dayCount: number): DayPlan[] {
  return Array.from({ length: dayCount }, (_, index) => ({
    day: index + 1,
    items: [],
  }))
}
