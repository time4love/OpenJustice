// ---------------------------------------------------------------------------
// LEVEL 4 — WHAT APPROVING DOES, DECLARED AS DATA.
//
// `docs/gf-factual-layer-rebuild-dev-plan.md`, Level 4: approval means different
// things in different modes, and "a researcher who believes they are approving a
// ruleset while actually approving a capture write is the confusion this exists
// to prevent."
//
// THE POLICY SUPPLIES ONE THING, NOT TWO. A caller that provided both "what to
// say" and "what to do" could let them drift, and this repository has already
// paid for that: `check_on_chain_status` returned a correct verdict beside a
// sentence asserting a second thing the verdict never asked, to the session that
// had published a thesis an hour earlier. A caller-authored confirmation string
// next to a caller-authored effect is that failure with a UI on it.
//
// So the sentence is RENDERED from the declaration. `renderApprovalEffect` is
// the only place words are chosen, and every field it reads is structured — a
// write kind from a closed set, a row count, a boolean. A new mode cannot
// introduce a description that lies, because it never writes one.
//
// NOT A POLYMORPHIC `ApprovalPolicy` WITH `apply()`, YET. The plan sketches one,
// and it becomes right when there are two implementations of it: the live scan's
// policy arrives with `ScanRun` in step 2b. Building the dispatch now, with one
// caller, would be generality invented ahead of its second case — while the
// EFFECT declaration is the half that must not drift, and is used today.
// ---------------------------------------------------------------------------

/**
 * The kinds of write an approval can perform. A CLOSED SET, deliberately.
 *
 * Free text here would be the authored sentence coming back in through a
 * different door. Adding a kind means adding its words to the renderer below,
 * in the same change, where they can be read next to every other kind's.
 */
export type EffectWriteKind =
  /** The ruleset itself, versioned and attributed. */
  | 'ARTICLE_RULESET'
  /** Stored captures re-derived under new rules. Bytes are untouched. */
  | 'REDERIVED_CAPTURES'
  /** A capture written: the bytes as served, plus everything derived from them. */
  | 'CAPTURE_SNAPSHOT';

export interface EffectWrite {
  kind: EffectWriteKind;
  /**
   * How many rows this write touches.
   *
   * COUNTED, NOT ESTIMATED. "Approve all following" is the moment thousands of
   * paid classifier calls become inevitable, and a number the researcher was
   * shown must be one the system actually measured.
   */
  rows: number;
}

/** Whether "and all following" exists for a policy, and what bounds it. */
export type BatchPolicy =
  /** Each approval is its own act. Level 4: a correction cannot be batched. */
  | { kind: 'NONE' }
  /** Bounded consent — approval runs until the page stops resembling the approved set. */
  | { kind: 'BOUNDED'; boundedBy: string };

export interface ApprovalEffect {
  writes: readonly EffectWrite[];
  reversible: boolean;
  /** How it is undone. Null only when `reversible` is false. */
  reversedBy: string | null;
  /**
   * Whether undoing it requires a destructive-database session.
   *
   * THE FIELD THAT MUST BE SAID OUT LOUD, and the reason `effect` is data rather
   * than prose. "Reversible in principle, but removing a written snapshot needs
   * a cleanup session with its own protocol and a postmortem behind it" is true,
   * is unobvious, and is exactly what a confirmation exists to carry — and it
   * can only carry it if the declaration holds it. Nothing in step 3 sets this;
   * the live scan's policy will.
   */
  requiresCleanupSessionToUndo: boolean;
  batch: BatchPolicy;
}

const WRITE_WORDS: Record<EffectWriteKind, (rows: number) => string> = {
  ARTICLE_RULESET: () => 'save the ruleset as a new version',
  REDERIVED_CAPTURES: (rows) =>
    rows === 1 ? 're-derive the text of 1 stored capture' : `re-derive the text of ${String(rows)} stored captures`,
  CAPTURE_SNAPSHOT: (rows) =>
    rows === 1 ? 'write 1 capture — its bytes and everything derived from them' : `write ${String(rows)} captures — their bytes and everything derived from them`,
};

/**
 * The confirmation sentence, and the ONLY place one is composed.
 *
 * Deterministic and total: every field of the declaration reaches the reader, so
 * a policy cannot quietly omit the half a researcher would have wanted.
 */
export function renderApprovalEffect(effect: ApprovalEffect): string {
  const writes = effect.writes.map((w) => WRITE_WORDS[w.kind](w.rows));
  const what = writes.length === 0 ? 'write nothing' : writes.join(', and ');

  const undo = effect.reversible
    ? effect.requiresCleanupSessionToUndo
      ? `Reversible — ${effect.reversedBy ?? 'unspecified'} — but UNDOING IT REQUIRES A DESTRUCTIVE-DATABASE SESSION.`
      : `Reversible: ${effect.reversedBy ?? 'unspecified'}.`
    : 'NOT REVERSIBLE.';

  const batch =
    effect.batch.kind === 'NONE'
      ? 'Each approval is its own act — there is no "and all following" here.'
      : `"And all following" is available, bounded by ${effect.batch.boundedBy}.`;

  return `Approving will ${what}. ${undo} ${batch}`;
}

/**
 * What committing a calibration does.
 *
 * ONE PATH FOR MODES 1 AND 3, which is why `storedCaptures` is a count rather
 * than a mode: a page with captures gets them re-derived, a page with none gets
 * a no-op, and the declaration says which happened without anything having to
 * be told which mode it is in.
 *
 * `CAPTURE_SNAPSHOT` never appears here. Calibration writes no capture, and that
 * is the difference the researcher is entitled to see stated rather than
 * inferred.
 */
export function calibrationEffect(storedCaptures: number): ApprovalEffect {
  const writes: EffectWrite[] = [{ kind: 'ARTICLE_RULESET', rows: 1 }];
  if (storedCaptures > 0) writes.push({ kind: 'REDERIVED_CAPTURES', rows: storedCaptures });
  return {
    writes,
    reversible: true,
    reversedBy: 'mark again and commit; the documents are stored whole and are re-derived from bytes already held',
    requiresCleanupSessionToUndo: false,
    batch: { kind: 'NONE' },
  };
}
