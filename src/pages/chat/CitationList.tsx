import { useId, useState } from 'react'
import type { ChatCitation } from '../../lib/types'
import { SOURCE_KIND_LABELS } from '../../lib/verification'
import { Badge, Button } from '../../components/ui'

export interface CitationListProps {
  citations: ChatCitation[]
  onOpen: (citation: ChatCitation) => void
}

/**
 * Task 10.5: the citations under an answer.
 *
 * Every assistant message that asserts something carries these, and they are
 * the reason the answer is worth anything -- the same rule as every other
 * screen: nothing is asserted without a path back to what backs it.
 *
 * The `handle` is shown because the answer text refers to it, so a reader can
 * match a sentence to its source rather than guessing which of four citations
 * supports which claim.
 *
 * Collapsed by default behind a "Sources (n)" toggle. Listed open, a long
 * answer's sources pushed the conversation apart; the count still says the
 * answer is backed, and one click shows by what.
 */
export function CitationList({ citations, onOpen }: CitationListProps) {
  const [open, setOpen] = useState(false)
  const listId = useId()

  return (
    <div className="chat__citations">
      <button
        type="button"
        className={`chat__citations-toggle${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="chat__citations-label">Sources</span>
        <span className="chat__citations-count">{citations.length}</span>
        <svg className="chat__citations-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <ul id={listId} className="chat__citation-list" hidden={!open}>
        {citations.map((citation) => {
          const kind = SOURCE_KIND_LABELS[citation.source_kind]
          return (
            <li key={citation.handle} className="chat__citation">
              <Badge tone="neutral" title={kind?.explanation}>
                {kind?.label ?? citation.source_kind}
              </Badge>
              <span className="chat__citation-handle">{citation.handle}</span>
              <span className="chat__citation-snippet">{citation.snippet}</span>
              {/* Only a document span can be shown in context -- a `record`
                  citation is already its whole value, and `derived` cites
                  nothing by definition. */}
              {citation.chunk_id && (
                <Button size="sm" variant="ghost" onClick={() => onOpen(citation)}>
                  In context
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
