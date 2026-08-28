// ---------------------------------------------------------------------------
// LEVEL 5, MADE VISIBLE.
//
// The platform stores, for every diff, whether the archived documents actually
// support the change it reports. Until this component that verdict existed only
// in the database and in a script's output — and A VERDICT NOBODY CAN SEE
// CHANGES NO DECISION.
//
// THE STATE THIS EXISTS FOR IS `UNCHECKED`. `survivalVerdict` is nullable
// because rows written before the check existed do exist, and NULL MEANS NEVER
// CHECKED, WHICH IS NOT THE SAME AS PASSING. So an unchecked diff renders as its
// own visible state and never as silence: silence is what a passing diff would
// look like, and the two must not be the same pixels.
//
// ONE COMPONENT, because the app renders diffs in two places — the full history
// timeline and the live scan view — and a verdict added to one of them is how
// Level 2's admission gate came to cover one path out of four.
// ---------------------------------------------------------------------------

export type SurvivalState =
  | 'UNCHECKED'
  | 'STALE'
  | 'SURVIVES'
  | 'CONTRADICTED'
  | 'UNCHECKABLE';

export interface SurvivalView {
  state: SurvivalState;
  chunksChecked: number | null;
  contradictedCount: number;
  checkedAt: string | null;
}

export interface SurvivalLabels {
  chip: Record<SurvivalState, string>;
  /** Shown in the card body for every state that is not a pass. */
  note: Record<Exclude<SurvivalState, 'SURVIVES'>, string>;
  notPromotable: string;
}

/**
 * Tokens per state.
 *
 * `SURVIVES` is the only emerald one, and it is deliberately the quietest thing
 * on the card: it means a presence test found nothing wrong, not that the change
 * has been proven. `UNCHECKED` is slate rather than emerald or amber — it is not
 * a warning about the data, it is the absence of an answer.
 */
const TOKENS: Record<SurvivalState, string> = {
  CONTRADICTED: 'bg-rose-100 text-rose-800 border-rose-300',
  STALE: 'bg-amber-50 text-amber-800 border-amber-300',
  UNCHECKABLE: 'bg-amber-50 text-amber-800 border-amber-300',
  UNCHECKED: 'bg-slate-100 text-slate-600 border-slate-300',
  SURVIVES: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const DOTS: Record<SurvivalState, string> = {
  CONTRADICTED: 'bg-rose-600',
  STALE: 'bg-amber-500',
  UNCHECKABLE: 'bg-amber-500',
  UNCHECKED: 'bg-slate-400',
  SURVIVES: 'bg-emerald-500',
};

export function SurvivalChip({
  survival,
  labels,
}: {
  survival: SurvivalView;
  labels: SurvivalLabels;
}) {
  return (
    <span
      className={`shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-semibold ${TOKENS[survival.state]}`}
      dir="auto"
    >
      <span className={`w-1.5 h-1.5 rounded-full ${DOTS[survival.state]}`} />
      {labels.chip[survival.state]}
      {survival.state === 'CONTRADICTED' && survival.chunksChecked !== null && (
        // The denominator travels with the count. "2 refuted" alone invites the
        // reader to supply their own idea of how many were examined.
        <span className="font-mono font-normal opacity-80">
          {survival.contradictedCount}/{survival.chunksChecked}
        </span>
      )}
    </span>
  );
}

/**
 * The explanation, in the card body, for every state that is not a pass.
 *
 * Renders nothing for `SURVIVES` — there the chip is the whole message. For the
 * other four the chip is a label and this is what it means, because a reader who
 * does not know what CONTRADICTED implies will treat a red badge as severity
 * rather than as "this change did not happen".
 */
export function SurvivalNotice({
  survival,
  labels,
}: {
  survival: SurvivalView;
  labels: SurvivalLabels;
}) {
  if (survival.state === 'SURVIVES') return null;

  const contradicted = survival.state === 'CONTRADICTED';

  return (
    <div
      className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${
        contradicted
          ? 'border-rose-300 bg-rose-50 text-rose-900'
          : survival.state === 'UNCHECKED'
            ? 'border-slate-300 bg-slate-50 text-slate-600'
            : 'border-amber-300 bg-amber-50 text-amber-900'
      }`}
      dir="auto"
    >
      <p>{labels.note[survival.state]}</p>
      {contradicted && (
        // Stated on the card itself. A diff the documents refute is a record of a
        // pipeline defect, not of a change to the page, and nothing built on it
        // can be sound.
        <p className="mt-1 font-semibold">{labels.notPromotable}</p>
      )}
    </div>
  );
}
