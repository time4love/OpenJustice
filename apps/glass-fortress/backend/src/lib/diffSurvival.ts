import { createHash } from 'crypto';
import { normaliseForPresence } from './htmlText';

/**
 * LEVEL 5'S INVARIANT, as one function.
 *
 * *A change the platform reports survives the documents.* A chunk said to be
 * REMOVED is absent from the after document; a chunk said to be ADDED was absent
 * from the before one. Anything else is the pipeline reporting its own blind spot
 * as an edit to the page.
 *
 * ONE IMPLEMENTATION, TWO CALLERS. `measureExtractionDivergence` already did this
 * as a measurement, and Level 5 is the same logic moved to write time. Copying it
 * would be one rule with two implementations — and here the two copies would be
 * *the definition of a contradiction*, so any drift between them would mean the
 * measurement and the enforcement disagreed about what the corpus contains.
 *
 * PURE. No Archive, no model, no network — a function of text already stored,
 * which is what makes it affordable at write time.
 */

/**
 * WHICH RULE PRODUCED A VERDICT.
 *
 * `survivalTextVersion` says which rule produced the TEXT; this says which rule
 * produced the JUDGEMENT, and the two go stale independently.
 *
 * WHY IT EXISTS, found the hard way. `sourceStateHash` commits to the check's
 * four INPUTS, so it detects a verdict whose data moved underneath it. It cannot
 * detect a verdict whose RULE moved: when zero-chunk diffs stopped being SURVIVES
 * and became UNCHECKABLE, 88 of 103 stored verdicts on staging became wrong while
 * the hash still matched, the audit still read CURRENT, and every count stayed
 * green. That is the exact failure this level was built to prevent, one level up
 * from the data it was watching.
 *
 * BUMP THIS whenever `checkDiffSurvival` can return a different verdict for
 * unchanged inputs. The audit then reports every earlier verdict STALE and the
 * backfill recomputes them — which is what makes a rule change reach the corpus
 * instead of quietly disagreeing with it.
 */
export const SURVIVAL_CHECK_VERSION = 'v2-zero-chunks-uncheckable';

/** Verdicts a diff can receive. */
export type SurvivalVerdict = 'SURVIVES' | 'CONTRADICTED' | 'UNCHECKABLE';

export interface ContradictedChunk {
  side: 'REMOVED' | 'ADDED';
  excerpt: string;
}

export interface SurvivalResult {
  verdict: SurvivalVerdict;
  chunksChecked: number;
  contradicted: ContradictedChunk[];
  /** Populated only for UNCHECKABLE — a verdict about the CHECK needs its reason. */
  reason?: string;
}

/**
 * The floor below which a fragment matches by accident across a whole document.
 *
 * CARRIED, NOT ENDORSED. This is the same length-as-significance assumption as
 * `MIN_CLAIM_LENGTH`, which the plan records as surviving in a second subsystem
 * and slates for removal at Level 6 — a short claim can be the load-bearing one.
 * It is named here rather than left as a bare `40` so that removing it is one
 * edit against a constant with a written justification, not a hunt for literals.
 */
export const PRESENCE_FLOOR_CHARS = 40;

/** Stored as a JSON array of strings; a malformed value checks as no chunks. */
export function parseChunks(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * A chunk and the sentences within it.
 *
 * GRANULARITY IS NOT A DETAIL. Whole-chunk matching found 2 contradictions of 81
 * and missed the case this work exists for; sentence granularity found 7. The
 * chunk itself comes first so an exact whole-chunk contradiction is reported as
 * such rather than as one of its fragments.
 */
export function segmentsOf(chunk: string): string[] {
  const parts = chunk
    .split(/\n+|(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return [chunk, ...parts];
}

/**
 * What the verdict was computed against — ALL FOUR INPUTS, not just the captures.
 *
 * §3's `sourceStateHash` discipline: staleness becomes COMPUTABLE rather than
 * assumed. Level 4 will change what counts as chrome and therefore what text a
 * diff compares; without this, that change silently invalidates every Level 5
 * verdict while all the counts stay green.
 *
 * THE CAPTURE HASHES ALONE WERE NOT ENOUGH, and that was found by reading the
 * callers rather than the checker. `rediffFromSnapshots` rewrites a diff's
 * `rawDeletedText` / `rawAddedText` — the checker's other two inputs — while the
 * captures it re-derives them from do not move. Committing only to the captures
 * would leave a verdict computed against chunks that no longer exist, reporting
 * itself as current. A source-state hash has to cover every input the verdict was
 * derived from, or it certifies freshness it cannot see.
 *
 * The two capture hashes are used rather than the capture text: they are already
 * SHA-256 of exactly that text, so this is the same commitment at a fraction of
 * the cost. The two chunk payloads are hashed here for the same reason — and
 * hashing them, rather than joining them raw, is what makes the delimiter
 * unforgeable: every one of the four components is then fixed-length hex, so no
 * content can contain a separator and shift the framing.
 */
export function survivalSourceStateHash(input: {
  beforeTextHash: string;
  afterTextHash: string;
  rawDeletedText: string;
  rawAddedText: string;
}): string {
  const sha = (value: string): string =>
    createHash('sha256').update(value, 'utf8').digest('hex');
  const parts = [
    input.beforeTextHash,
    input.afterTextHash,
    sha(input.rawDeletedText),
    sha(input.rawAddedText),
  ];
  return sha(parts.join('|'));
}

/**
 * Does this diff's own report survive the documents it spans?
 *
 * `beforeVersion` / `afterVersion` are the snapshots' extraction versions. When
 * they DISAGREE the result is `UNCHECKABLE`, not a verdict: the two sides were
 * produced by different rules, so a presence test across them compares text that
 * was never comparable. That is a verdict about the CHECK, which §3 requires be
 * recorded rather than collapsed into a pass or a failure — and it is the reason
 * `UNCHECKABLE` remains reachable now that a diff cannot exist without both
 * captures.
 */
export function checkDiffSurvival(input: {
  rawDeletedText: string;
  rawAddedText: string;
  beforeText: string;
  afterText: string;
  beforeVersion: string;
  afterVersion: string;
}): SurvivalResult {
  if (input.beforeVersion !== input.afterVersion) {
    return {
      verdict: 'UNCHECKABLE',
      chunksChecked: 0,
      contradicted: [],
      reason:
        `The two captures were extracted under different rules ` +
        `(${input.beforeVersion} vs ${input.afterVersion}), so a presence test across them ` +
        `compares text that was never comparable.`,
    };
  }

  const beforeNormalised = normaliseForPresence(input.beforeText);
  const afterNormalised = normaliseForPresence(input.afterText);

  const contradicted: ContradictedChunk[] = [];
  let chunksChecked = 0;

  for (const [side, json, haystack] of [
    ['REMOVED', input.rawDeletedText, afterNormalised],
    ['ADDED', input.rawAddedText, beforeNormalised],
  ] as const) {
    for (const chunk of parseChunks(json)) {
      chunksChecked += 1;
      for (const segment of segmentsOf(chunk)) {
        const needle = normaliseForPresence(segment);
        if (needle.length < PRESENCE_FLOOR_CHARS) continue;
        if (haystack.includes(needle)) {
          contradicted.push({ side, excerpt: needle.slice(0, 120) });
          // One contradiction per chunk: the finding is that this chunk's removal
          // is not supported, and listing every sentence inside it would inflate
          // the count without adding a fact.
          break;
        }
      }
    }
  }

  // A CHECK THAT INSPECTED NOTHING DID NOT PASS.
  //
  // With no chunks there is no reported change, so `contradicted` is empty and
  // the verdict would fall through to SURVIVES — a pass earned by having nothing
  // to examine. That is the same sentence as "UNCHECKED is not SURVIVES", one
  // level down, and it is the shape §3 exists to prevent: an unavailable result
  // counting as a result.
  //
  // It also inflates the only number anyone reads. On the corpus that surfaced
  // this, 20 of 22 diffs reported zero chunks; as SURVIVES they made the audit
  // claim 20 verifications that never happened.
  //
  // UNCHECKABLE, not a fourth verdict: this is a statement about the CHECK, which
  // is exactly what that member already means. The REASON distinguishes it from
  // the mixed-version case — see `diffSurvivalView`, which re-derives it from
  // stored state so no column is needed to carry it.
  if (chunksChecked === 0) {
    return {
      verdict: 'UNCHECKABLE',
      chunksChecked: 0,
      contradicted: [],
      reason:
        'This diff reports no changes, so there was nothing to check against the documents. ' +
        'That is not the same as a reported change the documents support.',
    };
  }

  return {
    verdict: contradicted.length > 0 ? 'CONTRADICTED' : 'SURVIVES',
    chunksChecked,
    contradicted,
  };
}
