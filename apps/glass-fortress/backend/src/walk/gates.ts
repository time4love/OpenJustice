import { compareExtractions, type CaptureExtraction, type CurrentExtraction } from '../lib/extractionDrift';
import { segments } from '../lib/claimSurvival';
import { classifierInputChunks, diffChunkPair } from '../lib/diffChunking';
import { approvedBefore, rulesInForce, trusted, type Decision, type Rule } from './derivations';
import type { Gate } from './stop';

// ---------------------------------------------------------------------------
// A4 OF docs/gf-interaction-flows.md — THE GATES, AS PREDICATES. Built to
// test/walk/gate0–gate5.test.ts, never the other way.
//
// One module, every gate the same shape: null when quiet, `{ gate, material }`
// when it fires, the material exactly A5's per gate. None carries a number and
// no detector concludes anything: a gate detects and yields, and a human
// resolves the stop (Flow 2). I8 holds that nothing here compares against a
// number other than 0.
//
// THIS MODULE NEVER IMPORTS `chromeRulesetApply` (plan §8, the jsdom boundary).
// Every gate receives extractions already derived and rows already read; the
// walk derives, `evaluate.ts` composes, this file judges. Two rulings of
// 2026-09-02 make two of the gates THROW rather than answer: a rule in force
// with no match count for a capture it governs (Gate 2), and a removal under a
// selector that is no live rule (Gate 4). Both are defects in the instrument,
// and an instrument's defect must never read as a finding about the page.
// ---------------------------------------------------------------------------

/**
 * A gate that fired: which one, and A5's material for it. The label is one of
 * `Gate` — the stop's own set, spelled once in `stop.ts` — so a gate cannot
 * declare a label the stop shape does not accept, and a Fired is structurally
 * the StopGate that `evaluate.ts` collects. Each gate narrows the label in its
 * own interface below rather than as a literal type argument: I8 scans the code
 * for a digit beside `<` or `>`, and a scan that learned to skip type positions
 * would be a scan with a bypass in it (ruled 2026-09-05).
 */
export interface Fired<M> {
  gate: Gate;
  material: M;
}

/**
 * GATE 0 — NOT APPROVED_BEFORE(page, t): no capture a human has accepted governs
 * this timestamp. The bootstrap, a back-filled older capture and the first
 * capture after a RESET are one mechanism. Material is `{}`: nothing could be
 * derived, so there is nothing to show.
 */
export interface Gate0Fired extends Fired<Record<never, never>> {
  gate: 0;
}

export function gate0(decisions: readonly Decision[], t: string): Gate0Fired | null {
  return approvedBefore(decisions, t) ? null : { gate: 0, material: {} };
}

/** A5's Gate 1 material — the same shape against the predecessor and against own approved text. */
export interface Gate1Material {
  against: 'PREDECESSOR' | 'OWN_PREVIOUS_TEXT';
  /** Kept before, removed now — the dangerous direction; `ruleId` is a HINT from the selector that took it, null when no rule in force carries that selector. */
  nowRemoved: { text: string; ruleId: string | null }[];
  /** Removed before, kept now — furniture entering `text`, and so `textHash`. */
  nowKept: string[];
}

export interface Gate1Fired extends Fired<Gate1Material> {
  gate: 1;
}

/**
 * The one live rule carrying a selector, under RULES_IN_FORCE at the capture's
 * timestamp — unique by A2's invariant (one live rule per selector), which
 * approve_article_rules keeps. Null when the selector names no rule in force:
 * the attribution is a hint, and the researcher still looks.
 */
function ruleIdOf(selector: string | null, inForce: readonly Rule[]): string | null {
  return selector === null ? null : (inForce.find((r) => r.selector === selector)?.id ?? null);
}

/**
 * The segments a capture carries on BOTH of its sides — a word that is a nav
 * item and a headline. A4, amended 2026-09-06: the sides are EXCLUSIVE sets,
 * kept*(x) = kept(x) \ removed(x) and removed*(x) = removed(x) \ kept(x), so
 * such a segment is in neither and cannot "change sides". Read from the code
 * before the amendment, the inclusive predicate fired on corona's `חיסונים` at
 * EVERY consecutive pair for as long as the word sat on both sides — a
 * permanent stop with CONTINUE the only answer. Built 2026-09-07.
 */
function onBothSides(kept: string, removed: string): string[] {
  const keptSet = new Set(segments(kept));
  return segments(removed).filter((s) => keptSet.has(s));
}

/**
 * The core shared by Gate 1 and Gate 1': the REUSED `compareExtractions`, whose
 * segment is A4's — a line, whitespace-normalised, carrying a letter or digit —
 * and whose sides are sets, narrowed here to A4's EXCLUSIVE sets: a segment on
 * both sides of either capture is subtracted from the drift, since
 * `removed*(c) ∩ kept*(p)` is exactly `(removed(c) ∩ kept(p))` less the segments
 * kept(c) or removed(p) also hold, and symmetrically for the other direction.
 * The reused module's inclusive contract (KEEP, test/extractionDrift.test.ts)
 * is untouched. `nowRemoved` is de-duplicated by text because A4 compares SETS:
 * a segment repeated on the removed side moved once.
 */
function changedSides(
  previous: CaptureExtraction,
  current: CurrentExtraction,
  inForce: readonly Rule[],
  against: Gate1Material['against'],
): Gate1Fired | null {
  const drift = compareExtractions(previous, current);
  if (drift.quiet) return null;
  const shared = new Set([
    ...onBothSides(previous.keptText, previous.removedText),
    ...onBothSides(current.keptText, current.removedText),
  ]);
  const nowRemoved = [...new Map(drift.nowRemoved.map((s) => [s.text, s])).values()]
    .filter((s) => !shared.has(s.text))
    .map((s) => ({ text: s.text, ruleId: ruleIdOf(s.selector, inForce) }));
  const nowKept = [...drift.nowKept].filter((text) => !shared.has(text));
  if (nowRemoved.length === 0 && nowKept.length === 0) return null;
  return { gate: 1, material: { against, nowRemoved, nowKept } };
}

/**
 * GATE 1 — (removed(c) ∩ kept(p)) ∪ (kept(c) ∩ removed(p)) ≠ ∅: a segment present
 * in both captures changed sides, either direction. An editorial edit leaves
 * the text in NEITHER side, so it never fires here; only a rule failure leaves
 * text present and on the other side of the line. `inForce` is
 * RULES_IN_FORCE(page, c.t), supplied by the walk.
 */
export function gate1(
  previous: CaptureExtraction,
  current: CurrentExtraction,
  inForce: readonly Rule[],
): Gate1Fired | null {
  return changedSides(previous, current, inForce, 'PREDECESSOR');
}

/**
 * GATE 1' — on a STALE ACQUIRED row only (Flow 3): removed(c_new) ∩
 * kept(c_previous_version) ≠ ∅, ONE direction. The previous version holds only
 * its stored `text`, its kept side; nothing was recorded of its removed side, so
 * `nowKept` is empty by construction. kept → removed here means the correction
 * ate text a human approved on this very capture.
 */
export function gate1OwnText(
  approved: { keptText: string },
  current: CurrentExtraction,
  inForce: readonly Rule[],
): Gate1Fired | null {
  return changedSides({ keptText: approved.keptText, removedText: '' }, current, inForce, 'OWN_PREVIOUS_TEXT');
}

/** A capture and the match count of every rule the walk applied to it — the derivation's `matchCounts`, keyed to the rule. */
export interface CaptureMatches {
  waybackTimestamp: string;
  matches: readonly { ruleId: string; matchedNodes: number }[];
}

export interface Gate2Material {
  rules: { ruleId: string; selector: string; matchedOnPredecessor: number }[];
}

export interface Gate2Fired extends Fired<Gate2Material> {
  gate: 2;
}

/**
 * The match count a capture carries for a rule in force on it. Absent is a WALK
 * DEFECT, ruled 2026-09-02: the walk derives a count for every rule in force on
 * every capture it examines, so a missing one is not "matched nothing" and not
 * "nothing to check" — it THROWS, naming the rule and the timestamp, never reads
 * as 0 and never as quiet.
 */
function matchedNodes(capture: CaptureMatches, rule: Rule): number {
  const match = capture.matches.find((m) => m.ruleId === rule.id);
  if (match === undefined) {
    throw new Error(
      `Walk defect: rule ${rule.id} (${rule.selector}) is in force at ${capture.waybackTimestamp} and that capture carries no match count for it.`,
    );
  }
  return match.matchedNodes;
}

/**
 * GATE 2 — ∃ rule r in force at BOTH timestamps: matches(r, p) > 0 AND
 * matches(r, c) = 0. A rule that matched the predecessor and matches nothing
 * here is a rule the page may have stopped describing — or furniture that
 * legitimately left; the gate cannot tell which, so it stops. Silent before and
 * silent now is not a transition (Flow 2: "the rule does not fire again");
 * waking is not going silent; a rule created after p, ended at or before c, or
 * retired under AUTHORITY is not in force at both and is not asked. Every rule
 * in force at p is owed a count at p and every rule in force at c one at c,
 * whether or not it is asked — the defect surfaces where it happened.
 *
 * A SILENCE A HUMAN HAS ALREADY JUDGED DOES NOT FIRE AGAIN (A4, amended
 * 2026-09-08): `judged` is the set of rules whose silence on c was observed
 * before a CAPTURE_ACCEPTED for c under AUTHORITY — `judgedSilences` folds it
 * from the match rows and the log, and the walk hands it here — REQUIRED, no
 * default: a caller that forgot it would silently restore the old behaviour,
 * and a required argument refuses that the way `Derived.judgedSilent` does.
 * Read from the first re-walk driven from the chat: ending one rule un-resolved
 * every later capture, and the re-walk re-fired at 2021-06-12 the same ten
 * silences the first walk had already put to the researcher. The counts are
 * still owed for every rule in force, judged or not — the defect check runs
 * before the filter.
 */
export function gate2(
  rules: readonly Rule[],
  decisions: readonly Decision[],
  p: CaptureMatches,
  c: CaptureMatches,
  judged: ReadonlySet<string>,
): Gate2Fired | null {
  const atP = rulesInForce(rules, decisions, p.waybackTimestamp);
  const atC = rulesInForce(rules, decisions, c.waybackTimestamp);
  const onP = new Map(atP.map((r) => [r.id, matchedNodes(p, r)]));
  const onC = new Map(atC.map((r) => [r.id, matchedNodes(c, r)]));
  const silent = atC.flatMap((r) => {
    const before = onP.get(r.id);
    const now = onC.get(r.id);
    return before !== undefined && before > 0 && now === 0 && !judged.has(r.id)
      ? [{ ruleId: r.id, selector: r.selector, matchedOnPredecessor: before }]
      : [];
  });
  return silent.length === 0 ? null : { gate: 2, material: { rules: silent } };
}

export interface Gate4Material {
  /** One entry per never-seen segment PER CLAIMING RULE — trust is per rule. */
  removals: { text: string; ruleId: string; selector: string }[];
}

export interface Gate4Fired extends Fired<Gate4Material> {
  gate: 4;
}

/**
 * GATE 4 — ∃ segment s ∈ removed(c) removed by a REVIEWED rule AND s ∉ SEEN(page).
 * The answer to the blind spot: text appearing for the first time has no side
 * history, so every never-seen removal is shown to a human until they trust the
 * rule that took it — RULE_TRUSTED, folded from the log by the reused `trusted`.
 *
 * `removedSegments` arrives attributed per selector from the derivation; each is
 * split into segments by the SAME `segments` Gate 1 compares with (through
 * `compareExtractions`), de-duplicated per rule because A4 compares SETS — a
 * line repeated inside one rule's removal moved once — while a segment two
 * REVIEWED rules both remove is listed once PER RULE. SEEN is
 * the walk's, built through that same splitter, so the set is compared
 * normalised on both sides.
 *
 * Derivation runs under RULES_IN_FORCE, so every selector in `removedSegments`
 * names a live rule; one that does not is a WALK DEFECT and THROWS, naming the
 * selector and the timestamp — never `ruleId: null` (ruled 2026-09-02). Checked
 * for every attributed removal before any is judged, trusted ones included.
 */
export function gate4(
  t: string,
  current: CurrentExtraction,
  inForce: readonly Rule[],
  decisions: readonly Decision[],
  seen: ReadonlySet<string>,
): Gate4Fired | null {
  const claimed = current.removedSegments.map((removed) => {
    const rule = inForce.find((r) => r.selector === removed.selector);
    if (rule === undefined) {
      throw new Error(
        `Walk defect: capture ${t} has text removed under selector ${removed.selector}, which is no rule in force at ${t}.`,
      );
    }
    return { rule, text: removed.text };
  });
  const removals = claimed
    .filter(({ rule }) => trusted(rule, decisions) === 'REVIEWED')
    .flatMap(({ rule, text }) =>
      [...new Set(segments(text))]
        .filter((segment) => !seen.has(segment))
        .map((segment) => ({ text: segment, ruleId: rule.id, selector: rule.selector })),
    );
  return removals.length === 0 ? null : { gate: 4, material: { removals } };
}

/** What the classifier is handed: the reused chunking's selection, both sides. */
export interface ClassifierDiff {
  removed: string[];
  added: string[];
}

/** The classifier's editorial answer — `editorial` and `editorialReason` of the reused output, read by the walk. */
export interface EditorialVerdict {
  editorial: boolean;
  reason: string;
}

/**
 * The one function the walk builds from `ForensicAgent.analyzeChange` and
 * INJECTS here, so this module reaches no model and the paid call is a seam.
 */
export type Classify = (diff: ClassifierDiff) => Promise<EditorialVerdict>;

/**
 * What Gate 5 hands the classifier for two texts: `classifierInputChunks` over
 * `diffChunkPair` — the one differ and the one selection Level 5 uses. Exported
 * so the step-4 measurement instrument prints EXACTLY this for the researcher to
 * label, and the labels are made on what the model will see.
 */
export function classifierDiffOf(previousText: string, currentText: string): ClassifierDiff {
  const chunks = diffChunkPair(previousText, currentText);
  return { removed: classifierInputChunks(chunks.removed), added: classifierInputChunks(chunks.added) };
}

export interface Gate5Material {
  /** Inline, always: a stop holds an unstored capture, so there is no diff row to name. */
  diff: ClassifierDiff;
  editorial: false;
  reason: string;
}

export interface Gate5Fired extends Fired<Gate5Material> {
  gate: 5;
}

/**
 * GATE 5 — classify(diff(text(p), text(c))).editorial = false. Evaluated LAST and
 * only on a NOVEL capture, by `evaluate.ts`; the one paid gate, and the call was
 * going to be made on that diff anyway. New furniture the rules have never met
 * enters `text`, the capture looks novel, and a not-editorial verdict is that
 * pollution's symptom. A model verdict only ever calls a human.
 *
 * The input is exactly what Level 5 hands the classifier: `classifierInputChunks`
 * over `diffChunkPair`, the one differ and the one selection. One call. A
 * rejection propagates — a classifier that fails halts the walk loudly, because
 * a gate that read a failure as quiet would acquire a capture under a verdict
 * nobody gave.
 */
export async function gate5(
  previousText: string,
  currentText: string,
  classify: Classify,
): Promise<Gate5Fired | null> {
  const diff = classifierDiffOf(previousText, currentText);
  const verdict = await classify(diff);
  return verdict.editorial ? null : { gate: 5, material: { diff, editorial: false, reason: verdict.reason } };
}
