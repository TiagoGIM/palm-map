import type { TripLeg, TripState } from '../../../../packages/shared-types'
import { Sheet } from '../overlays/Sheet'

type TripOverviewSheetProps = {
  open: boolean
  onClose: () => void
  tripState?: TripState
  tripLegs?: TripLeg[]
}

export function TripOverviewSheet({ open, onClose, tripState, tripLegs }: TripOverviewSheetProps) {
  const savedCities = tripState?.savedPlacesByCity?.filter(
    (entry) => entry.city && entry.places.length > 0,
  )

  const likesCount = tripState?.preferences.likes.length ?? 0
  const dislikesCount = tripState?.preferences.dislikes.length ?? 0
  const preferencesCount = likesCount + dislikesCount

  return (
    <Sheet open={open} onClose={onClose} title="Minha Trip">
      <div className="trip-overview">
        <section className="trip-overview__section">
          <p className="trip-overview__section-title">Resumo da viagem</p>
          <div className="trip-overview__summary-grid">
            <div>
              <span className="trip-overview__label">Origem</span>
              <p className="trip-overview__value">{tripState?.origin ?? '—'}</p>
            </div>
            <div>
              <span className="trip-overview__label">Destino</span>
              <p className="trip-overview__value">{tripState?.destination ?? '—'}</p>
            </div>
            <div>
              <span className="trip-overview__label">Dias totais</span>
              <p className="trip-overview__value">
                {tripState?.daysTotal ? `${tripState.daysTotal} dias` : '—'}
              </p>
            </div>
          </div>
        </section>

        <section className="trip-overview__section">
          <div className="trip-overview__section-heading">
            <p className="trip-overview__section-title">Trechos</p>
            {tripLegs && tripLegs.length > 0 ? (
              <span className="trip-overview__hint">
                {tripLegs.length} {tripLegs.length === 1 ? 'trecho' : 'trechos'}
              </span>
            ) : null}
          </div>
          {tripLegs && tripLegs.length > 0 ? (
            <ul className="trip-overview__leg-list">
              {tripLegs.map((leg) => (
                <li key={`overview-leg-${leg.order}`} className="trip-overview__leg-item">
                  <strong>
                    {leg.order}. {leg.fromCity} → {leg.toCity}
                  </strong>
                  {leg.stayDaysAtDestination ? (
                    <span className="trip-overview__leg-meta">
                      {leg.stayDaysAtDestination} dias
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="trip-overview__empty">Aguardando o plano para exibir os trechos.</p>
          )}
        </section>

        <section className="trip-overview__section">
          <p className="trip-overview__section-title">Lugares salvos</p>
          {savedCities && savedCities.length > 0 ? (
            <ul className="trip-overview__saved-list">
              {savedCities.map((entry) => (
                <li key={`saved-city-${entry.city}`}>
                  <p className="trip-overview__saved-city">{entry.city}</p>
                  <ul className="trip-overview__saved-place-list">
                    {entry.places.map((place, index) => (
                      <li
                        key={`${entry.city}-${index}-${place.placeName ?? 'saved'}`}
                        className="trip-overview__saved-place"
                      >
                        <span className="trip-overview__saved-name">
                          {place.placeName ?? 'Lugar salvo'}
                        </span>
                        <span className="trip-overview__saved-source">
                          {place.source === 'retrieval' ? 'retrieval' : 'salvo por você'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : (
            <p className="trip-overview__empty">Nenhum lugar salvo até agora.</p>
          )}
        </section>

        <section className="trip-overview__section">
          <p className="trip-overview__section-title">Preferências</p>
          {preferencesCount > 0 ? (
            <div className="trip-overview__preferences">
              {tripState?.preferences.likes.map((like) => (
                <span key={`pref-like-${like}`} className="state-chip">
                  {like}
                </span>
              ))}
              {tripState?.preferences.dislikes.map((dislike) => (
                <span key={`pref-dislike-${dislike}`} className="state-chip state-chip--muted">
                  {dislike}
                </span>
              ))}
            </div>
          ) : (
            <p className="trip-overview__empty">Sem preferências explícitas registradas.</p>
          )}
        </section>
      </div>
    </Sheet>
  )
}
