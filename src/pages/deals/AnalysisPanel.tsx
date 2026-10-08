import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deals, keys, system } from '../../lib/queries'
import { analysisExplanation, analysisLabel, formatRelative } from '../../lib/format'
import { Badge, Button, errorMessage, useToast } from '../../components/ui'

/**
 * Hidden for now, not removed: the same six checks already run on every
 * relevant write and in the daily sweep, so the manual trigger is not needed
 * day to day. Flip to `true` to bring the button back -- the mutation and
 * its handling below are intact.
 */
const SHOW_RUN_CHECKS = false

export interface AnalysisPanelProps {
  dealId: string
}

/**
 * Tasks 3.5 and 3.6: the analysis state, the trigger, and whether anything is
 * listening.
 *
 * **One correction to the plan, deliberate.** Task 3.5 says `POST
 * /deals/{id}/analysis` "only marks the deal dirty" and that the button
 * therefore means *queued, never done*. The handler does not do that:
 * `run_detection` calls `detect_service.run` inline, commits, and answers
 * with counts of what it wrote. Six of the ten risk types are joins over
 * tables that already exist and need no model call, so the work genuinely
 * finishes inside the request.
 *
 * So the button is labelled for what it does -- it runs the deterministic
 * checks and reports results. Labelling it "queued" would be the same class
 * of dishonesty the plan is guarding against, pointed the other way: the user
 * would be told to wait for something that already happened.
 *
 * The dirty/debounce machinery is real, and it is what `GET .../analysis`
 * reports on: the worker marks deals dirty on relevant writes and sweeps them
 * on a debounce. That state is rendered below the button, and it is the half
 * that genuinely means *queued*.
 *
 * Task 3.6 is the other half. The deterministic detector runs in-process and
 * works with the worker stopped, but the model-backed stages do not -- so if
 * `ai-status` says the layer is disabled, that is said plainly rather than
 * leaving a user to infer it from a queue that never drains.
 */
export function AnalysisPanel({ dealId }: AnalysisPanelProps) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const state = useQuery({
    queryKey: keys.dealAnalysis(dealId),
    queryFn: () => deals.analysisState(dealId),
    // Polled, because this changes without the UI doing anything: the worker
    // claims dirty deals on its own 2s loop. 15s is slower than that on
    // purpose -- the state transitions are measured in the debounce window,
    // not in seconds, so a faster poll would only cost requests.
    refetchInterval: 15_000,
  })

  const ai = useQuery({
    queryKey: keys.aiStatus(),
    queryFn: system.aiStatus,
    refetchInterval: 60_000,
  })

  const run = useMutation({
    mutationFn: () => deals.runDetection(dealId),
    onSuccess: async (result) => {
      // The detector writes risks and recommendations and can resolve risks
      // that no longer hold, so the whole deal subtree is stale -- including
      // the header, whose `open_risks` count just moved.
      await queryClient.invalidateQueries({ queryKey: keys.deal(dealId) })
      await queryClient.invalidateQueries({ queryKey: keys.dealAnalysis(dealId) })

      const parts = [
        `${result.risks_detected} risk${result.risks_detected === 1 ? '' : 's'} detected`,
        `${result.recommendations_written} recommendation${result.recommendations_written === 1 ? '' : 's'} written`,
      ]
      if (result.risks_auto_resolved > 0) {
        parts.push(`${result.risks_auto_resolved} resolved`)
      }
      toast.success(parts.join(', ') + '.')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const aiDisabled = ai.data && !ai.data.config.enabled
  const badge = state.data ? analysisLabel(state.data.state) : null

  return (
    <div className="analysis-panel">
      <div className="analysis-panel__status">
        {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}

        <div className="analysis-panel__detail">
          {state.data && (
            <p>
              {analysisExplanation(
                state.data.state,
                state.data.debounce_seconds,
                state.data.sweep_hours,
              )}
            </p>
          )}
          {state.data?.swept_at && (
            <p className="ui-muted">
              Last checked {formatRelative(state.data.swept_at)}
            </p>
          )}
          {state.data && !state.data.swept_at && (
            <p className="ui-muted">This deal has not been checked yet.</p>
          )}
        </div>

        {SHOW_RUN_CHECKS && (
          <Button onClick={() => run.mutate()} loading={run.isPending}>
            Run checks
          </Button>
        )}
      </div>

      {aiDisabled && (
        <div className="ui-callout ui-callout--warn">
          <strong>AI features are turned off.</strong>{' '}
          {SHOW_RUN_CHECKS ? (
            <>&ldquo;Run checks&rdquo; still works, but facts</>
          ) : (
            <>The rule-based risk checks still run, but facts</>
          )}
          , meeting briefs and the assistant are unavailable until AI is enabled.
        </div>
      )}

    </div>
  )
}
