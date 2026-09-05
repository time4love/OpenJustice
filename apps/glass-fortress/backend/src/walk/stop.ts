import type { LoadedRow } from './rows';

// ---------------------------------------------------------------------------
// THE STOP ON A WORK-LIST ROW — docs/gf-interaction-flows.md A2: `stop` is
// `{ gates: [{ gate, material }, …] } | null`, written with PENDING_JUDGEMENT
// and returned VERBATIM, so nothing recomputes material. A PENDING row whose
// stop is null is awaiting evaluation, not a pending stop. Read in ONE place:
// get_article_rules returns it whole, list_captures returns its gate labels,
// and step 4's walk returns a pending one instead of walking.
// ---------------------------------------------------------------------------

export type Gate = 0 | 1 | 2 | 4 | 5 | 'DIGEST';

export interface StopGate {
  gate: Gate;
  material: unknown;
}

export interface Stop {
  gates: StopGate[];
}

const GATES: readonly unknown[] = [0, 1, 2, 4, 5, 'DIGEST'];

function isStopGate(value: unknown): value is StopGate {
  return (
    typeof value === 'object' && value !== null && 'gate' in value && GATES.includes(value.gate) && 'material' in value
  );
}

/**
 * The pending stop held on a row, or null when the row holds none. A row that
 * is PENDING_JUDGEMENT with a non-null stop that is not A2's shape is a walk
 * defect: it throws, naming the row, rather than reading as "no stop".
 */
export function pendingStopOf(row: LoadedRow): Stop | null {
  if (row.outcome !== 'PENDING_JUDGEMENT' || row.stop === null) return null;
  const candidate: unknown = row.stop;
  if (
    typeof candidate === 'object' &&
    candidate !== null &&
    'gates' in candidate &&
    Array.isArray(candidate.gates) &&
    candidate.gates.every(isStopGate)
  ) {
    return { gates: candidate.gates };
  }
  throw new Error(
    `The stop on capture ${row.waybackTimestamp} is not { gates: [{ gate, material }] }; a stop is written only by the walk, and this one was not.`,
  );
}
