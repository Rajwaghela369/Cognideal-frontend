import { useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../lib/api'
import { chat, keys, meetings, tasks } from '../../lib/queries'
import {
  MEETING_STATUSES,
  MEETING_TYPES,
  PRIORITIES,
  TASK_STATUSES,
  type ChatAction,
  type MeetingStatus,
  type MeetingType,
  type Priority,
  type TaskStatus,
} from '../../lib/types'
import { errorMessage } from '../../lib/errorMessage'
import { Badge, Button, SelectField, TextAreaField, TextField, useToast } from '../../components/ui'

function label(value: string): string {
  return value.replace(/_/g, ' ')
}

function formatWhen(iso: string | null | undefined): string {
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

function formatDay(day: string | null | undefined): string {
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
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

/** datetime-local is wall-clock time with no offset; sent bare it would be
 *  stored as UTC. `Date` reads it as local time. */
function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null
}

/** What the card shows and edits, whether it came from the draft or from the
 *  real row the draft became. */
interface TaskValues {
  title: string
  description: string
  due_date: string
  priority: string
  status: string
}

interface MeetingValues {
  title: string
  meeting_type: string
  scheduled_at: string | null
  status: string
}

/**
 * A task or meeting the assistant drafted, from proposal to the real row.
 *
 * - **Draft**: Create / Edit / Cancel. Nothing exists until Create -- the
 *   assistant's draft tools write nothing. Editing changes what Create makes.
 * - **Created**: the card reads the *live* task or meeting, not the draft's
 *   snapshot, so it shows edits made anywhere; Edit saves straight to that row
 *   through the normal task / meeting update endpoints.
 *
 * While the answer is still streaming the draft has no saved message to hang
 * off, so its buttons wait (`messageId` null) until the persisted message
 * replaces it.
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
  const created = action.status === 'created' && action.created_id !== null
  const createdId = action.created_id ?? ''

  // The real row, once created.
  const liveTask = useQuery({
    queryKey: keys.task(createdId),
    queryFn: () => tasks.get(createdId),
    enabled: created && action.kind === 'task',
    retry: false,
  })
  const liveMeeting = useQuery({
    queryKey: keys.meeting(action.deal_id, createdId),
    queryFn: () => meetings.get(action.deal_id, createdId),
    enabled: created && action.kind === 'meeting',
    retry: false,
  })
  const live = action.kind === 'task' ? liveTask : liveMeeting
  const deleted = created && live.error instanceof ApiError && live.error.status === 404

  const task: TaskValues | null =
    action.kind !== 'task'
      ? null
      : liveTask.data
        ? {
            title: liveTask.data.title,
            description: liveTask.data.description ?? '',
            due_date: liveTask.data.due_date ?? '',
            priority: liveTask.data.priority,
            status: liveTask.data.status,
          }
        : {
            title: action.fields.title,
            description: action.fields.description ?? '',
            due_date: action.fields.due_date ?? '',
            priority: action.fields.priority,
            status: 'open',
          }

  const meeting: MeetingValues | null =
    action.kind !== 'meeting'
      ? null
      : liveMeeting.data
        ? {
            title: liveMeeting.data.title,
            meeting_type: liveMeeting.data.meeting_type,
            scheduled_at: liveMeeting.data.scheduled_at,
            status: liveMeeting.data.status,
          }
        : {
            title: action.fields.title,
            meeting_type: action.fields.meeting_type,
            scheduled_at: action.fields.scheduled_at,
            status: 'scheduled',
          }

  // The edit form. Seeded from what the card shows each time it opens.
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState('medium')
  const [when, setWhen] = useState('')
  const [meetingType, setMeetingType] = useState('other')
  const [status, setStatus] = useState('')

  const startEditing = () => {
    if (task) {
      setTitle(task.title)
      setDescription(task.description)
      setDueDate(task.due_date)
      setPriority(task.priority)
      setStatus(task.status)
    } else if (meeting) {
      setTitle(meeting.title)
      setWhen(toLocalInput(meeting.scheduled_at))
      setMeetingType(meeting.meeting_type)
      setStatus(meeting.status)
    }
    setEditing(true)
  }

  const refresh = () =>
    // A task or meeting appears on several screens (deal, tasks, meetings,
    // dashboard), so refresh broadly rather than guess the keys.
    queryClient.invalidateQueries()

  // Draft -> row.
  const create = useMutation({
    mutationFn: () => {
      const edits: Record<string, unknown> | undefined = editing
        ? action.kind === 'task'
          ? {
              title: title.trim(),
              description: description.trim() || null,
              due_date: dueDate || null,
              priority,
            }
          : { title: title.trim(), meeting_type: meetingType, scheduled_at: fromLocalInput(when) }
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

  // Edit the row a draft already became.
  const save = useMutation({
    mutationFn: async () => {
      if (action.kind === 'task') {
        await tasks.update(createdId, {
          title: title.trim(),
          description: description.trim() || null,
          due_date: dueDate || null,
          priority: priority as Priority,
          status: status as TaskStatus,
        })
      } else {
        await meetings.update(action.deal_id, createdId, {
          title: title.trim(),
          meeting_type: meetingType as MeetingType,
          scheduled_at: fromLocalInput(when),
          status: status as MeetingStatus,
        })
      }
    },
    onSuccess: async () => {
      setEditing(false)
      await refresh()
      toast.success(action.kind === 'task' ? 'Task updated.' : 'Meeting updated.')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const cancel = useMutation({
    mutationFn: () => chat.cancelAction(sessionId, messageId!, action.id),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
  })

  const pending = messageId === null
  const busy = create.isPending || save.isPending || cancel.isPending
  const kindLabel = action.kind === 'task' ? 'Task' : 'Meeting'
  const canEdit = action.status === 'proposed' || (created && !deleted)

  return (
    <div className={`chat-action chat-action--${deleted ? 'cancelled' : action.status}`}>
      <div className="chat-action__head">
        <span className="chat-action__kind">{kindLabel}</span>
        {action.deal_name && <span className="chat-action__deal">{action.deal_name}</span>}
        {action.status === 'proposed' && <Badge tone="accent">Draft</Badge>}
        {created && !deleted && <Badge tone="ok">Created</Badge>}
        {deleted && <Badge tone="neutral">Deleted</Badge>}
        {action.status === 'cancelled' && <Badge tone="neutral">Cancelled</Badge>}
      </div>

      {editing ? (
        <div className="chat-action__form">
          <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} />
          {action.kind === 'task' ? (
            <>
              <div className="chat-action__row">
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
                {created && (
                  <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
                    {TASK_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {label(s)}
                      </option>
                    ))}
                  </SelectField>
                )}
              </div>
              <TextAreaField
                label="Description"
                optional
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </>
          ) : (
            <div className="chat-action__row">
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
              {created && (
                <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
                  {MEETING_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {label(s)}
                    </option>
                  ))}
                </SelectField>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="chat-action__body">
          {deleted ? (
            <p className="chat-action__meta">
              This {kindLabel.toLowerCase()} was created and has since been deleted.
            </p>
          ) : task ? (
            <>
              <p className="chat-action__title">{task.title}</p>
              <p className="chat-action__meta">
                {formatDay(task.due_date)} &middot; {label(task.priority)} priority
                {created && <> &middot; {label(task.status)}</>}
                {task.description && <span className="chat-action__desc">{task.description}</span>}
              </p>
            </>
          ) : meeting ? (
            <>
              <p className="chat-action__title">{meeting.title}</p>
              <p className="chat-action__meta">
                {formatWhen(meeting.scheduled_at)} &middot; {label(meeting.meeting_type)}
                {created && <> &middot; {label(meeting.status)}</>}
                {action.kind === 'meeting' && action.fields.attendees.length > 0 && (
                  <span className="chat-action__desc">
                    With{' '}
                    {action.fields.attendees
                      .map((a) => a.contact_name ?? `${a.raw_name} (not a known contact)`)
                      .join(', ')}
                  </span>
                )}
              </p>
            </>
          ) : null}
        </div>
      )}

      {canEdit && (
        <div className="chat-action__actions">
          {editing ? (
            <>
              <Button
                size="sm"
                variant="primary"
                onClick={() => (created ? save.mutate() : create.mutate())}
                loading={created ? save.isPending : create.isPending}
                disabled={busy || !title.trim()}
              >
                {created ? 'Save changes' : 'Save & create'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
                Discard edits
              </Button>
            </>
          ) : action.status === 'proposed' ? (
            <>
              <Button
                size="sm"
                variant="primary"
                onClick={() => create.mutate()}
                loading={create.isPending}
                disabled={pending || busy}
                title={pending ? 'Available once the answer finishes' : undefined}
              >
                Create
              </Button>
              <Button size="sm" variant="ghost" onClick={startEditing} disabled={pending || busy}>
                Edit
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
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={startEditing} disabled={busy || live.isPending}>
                Edit
              </Button>
              {action.kind === 'meeting' ? (
                <Link to={`/deals/${action.deal_id}/meetings/${createdId}`}>Open meeting</Link>
              ) : (
                <Link to="/tasks">View in tasks</Link>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
