import { attributionSentence } from '../src/mcp/tools/checkOnChainStatus';
import { ON_CHAIN_EXPLANATIONS } from '../src/lib/onChainVerdict';

// ---------------------------------------------------------------------------
// CONSISTENCY IS NOT ATTRIBUTION, AND NO EXPLANATION MAY BLUR THEM.
//
// FOUND, NOT ANTICIPATED. On 2026-08-30 `check_on_chain_status` returned
// `CONSISTENT` for an evidence record with the explanation "This record can be
// cited as on-chain evidence" — while the anchor audit called that same record
// UNATTRIBUTED and `confirm-anchors` called it TX_UNREADABLE. It said so to a
// session that had published a thesis citing it an hour earlier. The verdict was
// correct; the sentence asserted a second thing the verdict never asked.
//
// `CONSISTENT` means the hash is registered somewhere and the row carries some
// transaction hash. Whether THAT transaction registered THIS hash is the
// question that can fail, and it lives in `anchoredHash` / `anchorCheck`.
//
// THE FIRST CASE IS THE REAL GUARD. It is a property of every explanation, not
// of the one that was wrong — a later verdict that promises citability would be
// the same defect wearing a different name.
//
// THE SILENCE CASE MATTERS AS MUCH AS THE WRONG ONE. "Never asked" and "asked,
// terminally unanswerable" license opposite decisions about whether to cite a
// record, and this repository has already paid for collapsing that distinction:
// UNAVAILABLE is a verdict about a CHECK, never about DATA.
// ---------------------------------------------------------------------------

const HASH = `0x${'a'.repeat(64)}`;
const OTHER = `0x${'b'.repeat(64)}`;

describe('no verdict explanation may promise citability', () => {
  it.each(Object.entries(ON_CHAIN_EXPLANATIONS))('%s does not claim the record is citable', (_v, text) => {
    expect(text.toLowerCase()).not.toContain('can be cited as on-chain evidence');
  });
});

describe('attributionSentence names which of four states holds', () => {
  it('confirmed — the recorded transaction was observed registering this hash', () => {
    const s = attributionSentence({ anchoredHash: HASH, anchorCheck: 'CONFIRMED', confirmed: true }, HASH);
    expect(s).toContain('ATTRIBUTION CONFIRMED');
  });

  it('mismatch — observed registering a different hash, and it names which', () => {
    const s = attributionSentence({ anchoredHash: OTHER, anchorCheck: 'MISANCHORED', confirmed: false }, HASH);
    expect(s).toContain('ATTRIBUTION MISMATCH');
    expect(s).toContain(OTHER);
    expect(s).toContain('Do not cite it for this hash');
  });

  it('terminal — asked and unanswerable is an ANSWER, and must not read as a gap', () => {
    const s = attributionSentence({ anchoredHash: null, anchorCheck: 'TX_UNREADABLE', confirmed: false }, HASH);
    expect(s).toContain('terminal');
    expect(s).toContain('TX_UNREADABLE');
    expect(s).toContain('Do not cite this as a verified anchor');
    // Must NOT send the caller to a command that cannot change the answer.
    expect(s).not.toContain('Run forensics:confirm-anchors');
  });

  it('never observed — no verdict recorded, and the remedy is actionable here', () => {
    const s = attributionSentence({ anchoredHash: null, anchorCheck: null, confirmed: false }, HASH);
    expect(s).toContain('NEVER OBSERVED');
    expect(s).toContain('Run forensics:confirm-anchors');
  });

  it('the terminal and never-observed sentences are different — the distinction is the point', () => {
    const terminal = attributionSentence({ anchoredHash: null, anchorCheck: 'TX_UNREADABLE', confirmed: false }, HASH);
    const never = attributionSentence({ anchoredHash: null, anchorCheck: null, confirmed: false }, HASH);
    expect(terminal).not.toEqual(never);
  });
});
