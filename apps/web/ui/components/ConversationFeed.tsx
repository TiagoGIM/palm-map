import type { RefObject } from 'react'
import type { ConversationMessage } from '../../../../packages/shared-types'
import { Button } from '../primitives/Button'
import { Card } from '../primitives/Card'

type Props = {
  messages: ConversationMessage[]
  isSubmitting: boolean
  scrollRef: RefObject<HTMLElement | null>
  onSaveSuggestion: (rank: number) => void
}

export function ConversationFeed({ messages, isSubmitting, scrollRef, onSaveSuggestion }: Props) {
  return (
    <section aria-label="Conversa" className="conversation-feed" ref={scrollRef}>
      {messages.map((message) => (
        <Card
          key={message.id}
          className={message.role === 'user' ? 'message-card-user' : 'message-card-system'}
        >
          <p className="message-role">{message.role === 'user' ? 'Voce' : 'Palm Map'}</p>
          <p className="message-text">{message.text}</p>

          {message.nextQuestion ? (
            <p className="next-question">Proxima pergunta: {message.nextQuestion}</p>
          ) : null}

          {message.suggestedRoute ? (
            <section aria-label="Rota sugerida" className="route-box">
              <p className="route-title">Estrutura da viagem</p>
              <ul className="route-list">
                {message.suggestedRoute.nodes.map((node, index) => (
                  <li key={`${message.id}-${node.role}-${node.city}-${index}`}>
                    <strong>{node.city}</strong> ({node.role})
                    {node.stayDays ? ` - ${node.stayDays} dias` : ''}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {message.groundedSuggestions ? (
            <section aria-label="Sugestoes grounded" className="grounded-box">
              <p className="route-title">
                Sugestoes em {message.groundedSuggestions.city}
                {message.groundedSuggestions.regionHint
                  ? ` - ${message.groundedSuggestions.regionHint}`
                  : ''}
              </p>
              <ul className="grounded-list">
                {message.groundedSuggestions.items.map((item) => (
                  <li key={`${message.id}-${item.chunkId}`} className="grounded-item">
                    <p className="grounded-item-title">
                      {item.rank}. {item.title}
                    </p>
                    <p className="grounded-item-meta">
                      {item.category} • {item.region} • score {item.score}
                    </p>
                    <p className="grounded-item-summary">{item.summary}</p>
                    <Button
                      variant="tonal"
                      className="grounded-save-button"
                      disabled={isSubmitting}
                      onClick={() => onSaveSuggestion(item.rank)}
                    >
                      Salvar opcao {item.rank}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </Card>
      ))}

      {isSubmitting ? (
        <Card className="message-card-system">
          <p className="message-role">Palm Map</p>
          <p className="message-text text-onsurface/50">Atualizando...</p>
        </Card>
      ) : null}
    </section>
  )
}
