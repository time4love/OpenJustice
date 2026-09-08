import type { CaptureExtraction, CurrentExtraction } from '../lib/extractionDrift';
import { cdxDigestOf } from '../services/verifyAgainstCdx';
import { acceptedCaptures, resolved, rulesInForce, type Decision, type Rule, type WorkListRow } from './derivations';
import { gate0, gate1, gate1OwnText, gate2, gate4, gate5, type Classify } from './gates';
import type { StopGate } from './stop';

// ---------------------------------------------------------------------------
// THE ONE PLACE THE GATES ARE COMPOSED — docs/gf-interaction-flows.md A4's
// "order of evaluation, and the stop", built to test/walk/gateOrder.test.ts and
// rewalkOwnText.test.ts. The walk calls this once per capture between fetch and
// store; it returns the stop, or null when the capture may be acquired.
//
// THE ORDER. The DIGEST check first, on a FRESH fetch only, before any
// derivation or spend — bytes the archive's own index does not describe are
// never derived under any rules. Then RESOLVED: a human just ruled on this
// capture under the ruleset now in force, so no gate runs — and NOT the
// classifier, which is the walk's to call at acquisition. Then Gate 0, alone,
// nothing derived. Then Gate 1 against the predecessor, Gate 1' against the
// capture's own approved text (a STALE ACQUIRED row only), Gate 2 and Gate 4 —
// ALL evaluated, ALL reported, in that order, each with its own material. Then
// Gate 5, last, only when everything before it is quiet and the capture is
// NOVEL: the one paid gate.
//
// APPROVED TEXT IS TEXT A HUMAN ACCEPTED AT A STOP (A4 amended 2026-09-05).
// Gate 1' is asked only on a STALE ACQUIRED row that carries a CAPTURE_ACCEPTED
// under AUTHORITY. A capture acquired quietly, or derived under no rules before
// any marking — the legacy corpus — has no approved text of its own and is
// superseded by the re-walk without a stop. Read from the code before the
// amendment, the predicate would have stopped on every legacy row with
// CONTINUE the only answer. The walk hands `ownPrevious` for exactly the
// accepted rows; an accepted row derived without it is still a walk defect.
//
// WHERE THE GATES' INPUTS COME FROM (Q4, ruled 2026-09-05). `derive` is the
// walk's, lazy, called at most once here: it derives THIS capture under
// RULES_IN_FORCE at its timestamp, and RE-DERIVES THE PREDECESSOR from its
// UrlSnapshot's document under RULES_IN_FORCE at ITS timestamp — that one
// derivation supplies the predecessor's kept and removed sides AND its match
// counts. `RuleMatch` rows are the durable record the walk writes at
// acquisition (step 5) and `get_article_rules` reads as `lastMatched`; they are
// never a gate's input, though A4 writes "RuleMatch(r, p)" as if they were.
// Nothing stores a removed side. SEEN is folded by the walk through the same
// segment splitter the gates use. `novel` is read only where Gate 5 needs it, so
// a walk that supplies it lazily derives nothing for a Gate 0 or RESOLVED stop.
//
// A CAPTURE MAY HAVE NO PREDECESSOR PAST GATE 0 (ruled 2026-09-05): the first
// stored capture of a page is stale the moment a rule exists, its own acceptance
// keeps Gate 0 quiet, and Flow 3's re-walk starts there. With no predecessor
// Gates 1(P), 2 and 5 have nothing to compare against and are not asked; 1' and
// 4 are. A predecessor named but not derived is a walk defect.
//
// A WALK DEFECT THROWS from Gate 2 or Gate 4 whether or not another gate fired
// first: every gate in the group is evaluated, so the defect surfaces on the
// capture where it happened. The marking URL is the tool's to add (A6).
// ---------------------------------------------------------------------------

/** A rule's match count on one capture, from the derivation. */
export interface Matched {
  ruleId: string;
  matchedNodes: number;
}

/** What the walk derived for one capture and its predecessor. */
export interface Derived {
  /** The predecessor's extraction; null exactly when the capture has no predecessor. */
  previous: CaptureExtraction | null;
  current: CurrentExtraction;
  /** Match counts per rule in force, on the predecessor (null with no predecessor) and on this capture. */
  matches: { p: Matched[] | null; c: Matched[] };
  /** SEEN for judging THIS capture: every other judged capture's removed side, plus its own when it is judged (A3, amended 2026-09-08). */
  seen: Set<string>;
  /** The rules whose silence on this capture a human has already judged — Gate 2 does not re-fire on them (A4, amended 2026-09-08). */
  judgedSilent: ReadonlySet<string>;
  /** The capture's own approved text — REQUIRED on an ACQUIRED row accepted under AUTHORITY, absent otherwise. */
  ownPrevious?: { keptText: string } | null;
}

export interface EvaluateInput {
  /** This capture's waybackTimestamp. */
  t: string;
  rules: readonly Rule[];
  decisions: readonly Decision[];
  row: WorkListRow;
  /** PREDECESSOR(row)'s waybackTimestamp; null when the capture has none. */
  predecessor: string | null;
  /** A fresh fetch's bytes and the index's digest for them; null when the bytes were held or come from the snapshot. */
  fetched: { bytes: Buffer; expectedDigest: string } | null;
  derive: () => Derived;
  /** textHash differs from the predecessor's — read only where Gate 5 needs it. */
  novel: boolean;
  classify: Classify;
}

/** A5's stop, before the tool adds the marking URL. */
export interface CaptureStop {
  capture: string;
  gates: StopGate[];
}

export async function evaluateCapture(input: EvaluateInput): Promise<CaptureStop | null> {
  const { t, rules, decisions, row } = input;
  const stop = (gates: StopGate[]): CaptureStop => ({ capture: t, gates });

  if (input.fetched !== null) {
    const got = cdxDigestOf(input.fetched.bytes);
    if (got !== input.fetched.expectedDigest) {
      return stop([{ gate: 'DIGEST', material: { expected: input.fetched.expectedDigest, got } }]);
    }
  }

  if (resolved(row, rules, decisions)) return null;

  const bootstrap = gate0(decisions, t);
  if (bootstrap !== null) return stop([bootstrap]);

  const derived = input.derive();
  const inForce = rulesInForce(rules, decisions, t);
  const fired: StopGate[] = [];

  if (input.predecessor !== null) {
    if (derived.previous === null || derived.matches.p === null) {
      throw new Error(`Walk defect: capture ${t} has predecessor ${input.predecessor} but was derived without it.`);
    }
    const moved = gate1(derived.previous, derived.current, inForce);
    if (moved !== null) fired.push(moved);
  }

  if (row.outcome === 'ACQUIRED' && acceptedCaptures(decisions).has(t)) {
    if (derived.ownPrevious === null || derived.ownPrevious === undefined) {
      throw new Error(`Walk defect: stale ACQUIRED capture ${t} was accepted but derived without its own approved text.`);
    }
    const eaten = gate1OwnText(derived.ownPrevious, derived.current, inForce);
    if (eaten !== null) fired.push(eaten);
  }

  if (input.predecessor !== null && derived.matches.p !== null) {
    const silent = gate2(
      rules,
      decisions,
      { waybackTimestamp: input.predecessor, matches: derived.matches.p },
      { waybackTimestamp: t, matches: derived.matches.c },
      derived.judgedSilent,
    );
    if (silent !== null) fired.push(silent);
  }

  const unseen = gate4(t, derived.current, inForce, decisions, derived.seen);
  if (unseen !== null) fired.push(unseen);

  if (fired.length > 0) return stop(fired);

  if (input.predecessor !== null && derived.previous !== null && input.novel) {
    const verdict = await gate5(derived.previous.keptText, derived.current.keptText, input.classify);
    if (verdict !== null) return stop([verdict]);
  }
  return null;
}
