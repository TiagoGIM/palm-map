import { useState } from 'react'
import { useConversation } from './hooks/useConversation'
import { AppBar } from './ui/navigation/AppBar'
import { ConversationFeed } from './ui/components/ConversationFeed'
import { DatasetManagerSheet } from './ui/components/DatasetManagerSheet'
import { MessageInput } from './ui/components/MessageInput'
import { TripOverviewSheet } from './ui/components/TripOverviewSheet'
import { TripStatePanel } from './ui/components/TripStatePanel'

export function App() {
  const [isDatasetManagerOpen, setDatasetManagerOpen] = useState(false)

  const {
    feedScrollRef,
    tripState,
    draftMessage,
    setDraftMessage,
    messages,
    error,
    isSubmitting,
    nextQuestionBanner,
    currentTripLegs,
    conversationMeta,
    isTripOverviewOpen,
    setTripOverviewOpen,
    planNodes,
    handleSubmit,
    handleSaveSuggestionOption,
    handleDraftKeyDown,
  } = useConversation()

  return (
    <main className="app-shell">
      <AppBar title="Palm Map">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDatasetManagerOpen(true)}
            className="rounded-sm px-2 py-1 text-xs text-onsurface/70 hover:bg-onsurface/10"
          >
            Datasets
          </button>
          <span className="text-xs text-onsurface/70">Conversational MVP</span>
        </div>
      </AppBar>

      {tripState ? (
        <TripStatePanel
          tripState={tripState}
          nextQuestionBanner={nextQuestionBanner}
          conversationMeta={conversationMeta}
          currentTripLegs={currentTripLegs}
          planNodes={planNodes}
          onOpenOverview={() => setTripOverviewOpen(true)}
        />
      ) : null}

      <ConversationFeed
        messages={messages}
        isSubmitting={isSubmitting}
        scrollRef={feedScrollRef}
        onSaveSuggestion={(rank) => void handleSaveSuggestionOption(rank)}
      />

      <MessageInput
        value={draftMessage}
        onChange={setDraftMessage}
        onSubmit={() => void handleSubmit()}
        onKeyDown={handleDraftKeyDown}
        isSubmitting={isSubmitting}
        error={error}
      />

      <TripOverviewSheet
        open={isTripOverviewOpen}
        onClose={() => setTripOverviewOpen(false)}
        tripState={tripState}
        tripLegs={currentTripLegs}
      />

      <DatasetManagerSheet
        open={isDatasetManagerOpen}
        onClose={() => setDatasetManagerOpen(false)}
      />
    </main>
  )
}
