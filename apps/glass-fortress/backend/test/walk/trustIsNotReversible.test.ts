import { relative } from 'node:path';
import { SRC, tsFiles, readCode } from './scan';

// ---------------------------------------------------------------------------
// TRUST IS ONE-WAY, AND EVERY SURFACE THAT SAYS SO MUST SAY THE SAME THING.
//
// `trusted()` returns TRUSTED when ANY `RULE_TRUSTED` decision exists for a rule
// and no decision type ever removes it (`src/walk/derivations.ts`). There is no
// untrust. That is a CONSTRAINT ON THE RESEARCHER — how freely they trust
// depends on whether the door closes behind them — so a surface that calls it
// reversible does not merely mislead, it changes a decision.
//
// WRITTEN BECAUSE THE RULE WAS STATED THREE TIMES AND DRIFTED TWICE (2026-09-12).
// `docs/gf-interaction-flows.md` said it correctly under "A RULE IS REVIEWED
// UNTIL A HUMAN TRUSTS IT" — naming the route and the caveat — and the stop
// script in the same document abbreviated it to a bare "reversible by a later
// decision". `resolve_scan_stop`'s tool description said "There is no untrust
// decision" while its own input schema's `resolution` gloss said the opposite,
// so one connector surface carried BOTH — which is what the live session
// reported, declining to pick one. The dominant defect shape of this repository
// is one rule with many implementations; a scan is the only thing that holds a
// sentence.
//
// CODE ONLY (a comment mentioning the phrase is not a surface) and with a DECOY,
// so a scan that matches nothing is caught as the vacuity this repo has paid for.
// ---------------------------------------------------------------------------

/** A surface claiming trust can be undone, in any of the spellings that have appeared. */
const CLAIMS_REVERSIBLE = /reversible by a later|can be untrusted|untrust(?:ed|ing)? (?:it|the rule|a rule)|undo the trust/i;

describe('no surface says a trusted rule can be untrusted', () => {
  it('holds across every module under src/', () => {
    const offenders = tsFiles(SRC)
      .map((file) => ({ file: relative(SRC, file), code: readCode(file) }))
      .filter(({ code }) => CLAIMS_REVERSIBLE.test(code))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it('catches the claim when it is there — the decoy', () => {
    const decoy = `const d = 'Gate 1 still catches its text if it changes sides; reversible by a later decision';`;
    expect(CLAIMS_REVERSIBLE.test(decoy)).toBe(true);
  });

  it('does not fire on the TRUE statement of the rule', () => {
    const truth = `const t = 'there is NO UNTRUST DECISION, the way back being END or retiring the rule and marking the element afresh';`;
    expect(CLAIMS_REVERSIBLE.test(truth)).toBe(false);
  });
});
