// ---------------------------------------------------------------------------
// Check 8: the public-interest statement is present and non-trivial.
//
// CHECK 7'S GROUPS LEFT THIS FILE AT EVIDENCE STEP 11a — thesis plan §5's RETIRE
// half. They held a per-sentence rule about how a NAMED FIGURE may be written
// about, deterministic and per SENTENCE rather than per document, and they go
// with the figure: thesis flows T2 retires `KeyFigure` outright.
//
// Check 8 is STRUCTURAL — a dedicated field, not a phrase hunted for in a body —
// which is why it survives a design that replaces the body's format entirely.
// ---------------------------------------------------------------------------

import {
  checkPublicInterestStatement,
  MIN_PUBLIC_INTEREST_STATEMENT_LENGTH,
} from '../src/lib/publicationLanguage';

const FIGURE = 'נחמן אש';

function paragraph(...inline: ({ text: string } | { figure: string })[]) {
  return {
    type: 'paragraph',
    content: inline.map((i) =>
      'figure' in i
        ? { type: 'keyFigureMention', attrs: { id: i.figure, label: i.figure } }
        : { type: 'text', text: i.text },
    ),
  };
}

function doc(...content: unknown[]) {
  return { type: 'doc', content };
}

describe('checkPublicInterestStatement (check 8)', () => {
  it('fails when absent or blank', () => {
    expect(checkPublicInterestStatement(null).passed).toBe(false);
    expect(checkPublicInterestStatement('   ').passed).toBe(false);
  });

  it('fails a trivial statement and names the floor', () => {
    const r = checkPublicInterestStatement('חשוב לציבור.');
    expect(r.passed).toBe(false);
    expect(r.reason).toContain(String(MIN_PUBLIC_INTEREST_STATEMENT_LENGTH));
  });

  it('passes a real statement', () => {
    const r = checkPublicInterestStatement(
      'הציבור זכאי לדעת כיצד שונו הנחיות בטיחות רשמיות בזמן אמת, משום שעל בסיסן התקבלו החלטות רפואיות.',
    );
    expect(r.passed).toBe(true);
    expect(r.reason).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// FINDING 60: the gate refused a real thesis over a sentence whose entire
// purpose it satisfied.
//
// "…among them, ACCORDING TO THE REPORT, Dr Alroy-Preis and Dr Anis" does not
// assert that those officials were present. It asserts that a published report
// named them — a different, checkable proposition, and Rule 1 satisfied more
// precisely than a modal hedge, not less. The vocabulary already accepted
// attribution to DOCUMENTS; it simply had no phrase for a published REPORT.
// ---------------------------------------------------------------------------

// THE HEDGING GROUPS WENT WITH CHECK 7 AT EVIDENCE STEP 11a — thesis plan §5's
// RETIRE half of this file. They asserted a per-sentence rule about how a NAMED
// FIGURE may be written about, and thesis flows T2 retires the figure. Check 8,
// the public-interest statement, is the KEEP half and is above.