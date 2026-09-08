// ---------------------------------------------------------------------------
// NO VERDICT EXPLANATION MAY PROMISE CITABILITY.
//
// MOVED HERE AT EVIDENCE STEP 11a from `onChainAttribution.test.ts`, which went
// with `check_on_chain_status` — deleted in this PR and rebuilt at step 12,
// re-scoped to captures (evidence A4). The `attributionSentence` cases were that
// tool's and died with it; this one is a property of `ON_CHAIN_EXPLANATIONS` in
// `src/lib/onChainVerdict.ts`, which stays and is rebased in 11b.
//
// FOUND, NOT ANTICIPATED. On 2026-08-30 `check_on_chain_status` returned
// `CONSISTENT` for an evidence record with the explanation "This record can be
// cited as on-chain evidence" — while the anchor audit called that same record
// UNATTRIBUTED and `confirm-anchors` called it TX_UNREADABLE. It said so to a
// session that had published a thesis citing it an hour earlier. The verdict was
// correct; the sentence asserted a second thing the verdict never asked.
//
// THIS WAS ALWAYS THE REAL GUARD, WHICH IS WHY IT OUTLIVES THE TOOL. It is a
// property of EVERY explanation, not of the one that was wrong — a later verdict
// promising citability would be the same defect wearing a different name, and
// step 12's rebuilt tool inherits the rule before it writes a sentence.
// ---------------------------------------------------------------------------

import { ON_CHAIN_EXPLANATIONS } from '../src/lib/onChainVerdict';

describe('no verdict explanation may promise citability', () => {
  it('finds the explanations at all — a silent zero would make this vacuous', () => {
    expect(Object.keys(ON_CHAIN_EXPLANATIONS).length).toBeGreaterThan(0);
  });

  it.each(Object.entries(ON_CHAIN_EXPLANATIONS))('%s does not claim the record is citable', (_v, text) => {
    expect(text.toLowerCase()).not.toContain('can be cited as on-chain evidence');
  });
});
