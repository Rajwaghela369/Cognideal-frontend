import type { ChatUsage } from '../../lib/types'

function resetTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? 'midnight'
    : date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/**
 * How much of today's chat allowance is used, as a bar only.
 *
 * Deliberately shows no numbers -- not the limit, not the count. The bar's
 * fill and colour say "plenty left", "running low" and "used up"; the exact
 * figures stay a server setting.
 */
export function ChatUsageBar({ usage }: { usage: ChatUsage }) {
  // A limit of 0 means unlimited: nothing to show.
  if (!usage.limit) return null

  const share = Math.min(usage.used / usage.limit, 1)
  const percent = Math.round(share * 100)
  const tone = share >= 1 ? 'full' : share >= 0.8 ? 'low' : 'ok'
  const caption =
    tone === 'full'
      ? `Used up for today. Available again at ${resetTime(usage.resets_at)}.`
      : tone === 'low'
        ? `Running low. Resets at ${resetTime(usage.resets_at)}.`
        : `Resets at ${resetTime(usage.resets_at)}.`

  return (
    <div className={`chat-usage chat-usage--${tone}`}>
      <div className="chat-usage__head">
        <span className="chat-usage__label">Today&rsquo;s chat usage</span>
        <span className="chat-usage__caption">{caption}</span>
      </div>
      <div
        className="chat-usage__track"
        role="progressbar"
        aria-label="Today's chat usage"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={tone === 'full' ? 'Used up for today' : tone === 'low' ? 'Running low' : 'Available'}
      >
        <div className="chat-usage__fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
