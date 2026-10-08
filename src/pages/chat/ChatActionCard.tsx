import { useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { chat } from '../../lib/queries'
import type { ChatAction } from '../../lib/types'
import { errorMessage } from '../../lib/errorMessage'
import { Badge, Button, SelectField, TextField, useToast } from '../../components/ui'

const PRIORITIES = ['low', 'medium', 'high', 'urgent']
const MEETING_TYPES = [
  'discovery',
  'demo',
  'technical_review',
  'security_review',
  'negotiation',
  'check_in',
  'other',
]

function label(value: string): string {
  return value.replace(/_/g, ' ')
}

function formatWhen(iso: string | null): string {
  if (!iso) return 'No time set'
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
}

function formatDay(day: string | null): string {
  if (!day) return 'No due date'
  // A bare date is a calendar day, not an instant: parse it as local so it
  // does not shift a day in timezones west of UTC.
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** ISO with offset -> the `YYYY-MM-DDTHH:MM` a datetime-local input wants. */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

/**
 * A task or meeting the assistant drafted, with Create / Edit / Cancel.
 *
 * Nothing exists until Create: the assistant's draft tools write nothing, and
 * this card is the human decision the backend waits for. While the answer is
 * still streaming the draft has no saved message to hang off, so the buttons
 * wait (`messageId` null) until the persisted message replaces it.
 */
export function ChatActionCard({
  action,
  sessionId,
  messageId,
}: {
  action: ChatAction
  sessionId: string
  messageId: string | null
}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(action.fields.title)
  const [dueDate, setDueDate] = useState(action.kind === 'task' ? action.fields.due_date ?? '' : '')
  const [priority, setPriority] = useState(action.kind === 'task' ? action.fields.priority : 'medium')
  const [when, setWhen] = useState(
    action.kind === 'meeting' ? toLocalInput(action.fields.scheduled_at) : '',
  )
  const [meetingType, setMeetingType] = useState(
    action.kind === 'meeting' ? action.fields.meeting_type : 'other',
  )

  const refresh = () =>
    // A created task or meeting appears on several screens (deal, tasks,
    // meetings, dashboard), so refresh broadly rather than guess the keys.
    queryClient.invalidateQueries()

  const create = useMutation({
    mutationFn: () => {
      const edits: Record<string, unknown> | undefined = editing
        ? action.kind === 'task'
          ? { title: title.trim(), due_date: dueDate || null, priority }
          : {
              title: title.trim(),
              meeting_type: meetingType,
              // datetime-local is wall-clock time with no offset; sending it
              // bare would be stored as UTC. `Date` reads it as local time.
              scheduled_at: when ? new Date(when).toISOString() : null,
            }
        : undefined
      return chat.applyAction(sessionId, messageId!, action.id, edits)
    },
    onSuccess: async () => {
      setEditing(false)
      await refresh()
      toast.success(action.kind === 'task' ? 'Task created.' : 'Meeting created.')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const cancel = useMutation({
    mutationFn: () => chat.cancelAction(sessionId, messageId!, action.id),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
  })

  const pending = messageId === null
  const busy = create.isPending || cancel.isPending
  const kindLabel = action.kind === 'task' ? 'Task' : 'Meeting'

  return (
    <div className={`chat-action chat-action--${action.status}`}>
      <div className="chat-action__head">
        <span className="chat-action__kind">{kindLabel}</span>
        {action.deal_name && <span className="chat-action__deal">{action.deal_name}</span>}
        {action.status === 'created' && <Badge tone="ok">Created</Badge>}
        {action.status === 'cancelled' && <Badge tone="neutral">Cancelled</Badge>}
        {action.status === 'proposed' && <Badge tone="accent">Draft</Badge>}
      </div>

      {editing ? (
        <div className="chat-action__form">
          <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} />
          {action.kind === 'task' ? (
            <>
              <TextField
                label="Due date"
                optional
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
              <SelectField label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {label(p)}
                  </option>
                ))}
              </SelectField>
            </>
          ) : (
            <>
              <TextField
                label="When"
                optional
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
              <SelectField label="Type" value={meetingType} onChange={(e) => setMeetingType(e.target.value)}>
                {MEETING_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {label(t)}
                  </option>
                ))}
              </SelectField>
            </>
          )}
        </div>
      ) : (
        <div className="chat-action__body">
          <p className="chat-action__title">{action.fields.title}</p>
          {action.kind === 'task' ? (
            <p className="chat-action__meta">
              {formatDay(action.fields.due_date)} &middot; {label(action.fields.priority)} priority
              {action.fields.description && (
                <span className="chat-action__desc">{action.fields.description}</span>
              )}
            </p>
          ) : (
            <p className="chat-action__meta">
              {formatWhen(action.fields.scheduled_at)} &middot; {label(action.fields.meeting_type)}
              {action.fields.attendees.length > 0 && (
                <span className="chat-action__desc">
                  With{' '}
                  {action.fields.attendees
                    .map((a) => a.contact_name ?? `${a.raw_name} (not a known contact)`)
                    .join(', ')}
                </span>
              )}
            </p>
          )}
        </div>
      )}

      {action.status === 'proposed' && (
        <div className="chat-action__actions">
          <Button
            size="sm"
            variant="primary"
            onClick={() => create.mutate()}
            loading={create.isPending}
            disabled={pending || busy || (editing && !title.trim())}
            title={pending ? 'Available once the answer finishes' : undefined}
          >
            {editing ? 'Save & create' : 'Create'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)} disabled={pending || busy}>
            {editing ? 'Discard edits' : 'Edit'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => cancel.mutate()}
            loading={cancel.isPending}
            disabled={pending || busy}
          >
            Cancel
          </Button>
        </div>
      )}

      {action.status === 'created' && action.created_id && (
        <div className="chat-action__actions">
          {action.kind === 'meeting' ? (
            <Link to={`/deals/${action.deal_id}/meetings/${action.created_id}`}>Open meeting</Link>
          ) : (
            <Link to="/tasks">View in tasks</Link>
          )}
        </div>
      )}
    </div>
  )
}
