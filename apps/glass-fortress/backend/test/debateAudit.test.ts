import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditDebateAssertions } from '../src/services/debateAudit';
import type { AssessedContent } from '../src/services/promotionAssessor';

// ---------------------------------------------------------------------------
// THE DEBATE'S AUDIT — evidence A4 :1121 as ruled 2026-09-25 (R81 QA); thesis A4 :1476's ASSESSMENT body as conformed
// (R82 Entry 2, S3); document A7 :1581 — the verdict rule's FOURTH caller; document §3 :359–:365.
//
// PURE, so every case hands values and reads values. Nothing gates on a verdict here; what is held is that each verdict
// is the one the ONE rule gives, that the reason rides beside UNCHECKED alone, and that nothing is spelled twice.
// ---------------------------------------------------------------------------

const PASSAGES = [
  'בחוזר מיום 3.1.2021 נכתב   כי יש לשמור את ערוץ הדיווח פתוח #doc_0xabc',
  'ובפסקה נוספת: החוזר מורה על דיווח שבועי #doc_0xabc',
];
const TEXT = 'יש לשמור את ערוץ הדיווח פתוח לכל הפחות עד סוף הרבעון.\nדיווח שבועי יוגש למנכ״ל.';

const document = (reading: Extract<AssessedContent, { kind: 'DOCUMENT' }>['reading']): AssessedContent => ({
  kind: 'DOCUMENT',
  title: 'חוזר המנכ״ל',
  reading,
});
const HELD_TEXT = document({ form: 'TEXT', text: TEXT });

describe('auditDebateAssertions — the five fields of thesis A4 :1476, in its order', () => {
  it('a verbatim span and a phrase the text carries: quoteVerified true, PRESENT, and NO reason', () => {
    const [audited] = auditDebateAssertions(
      [{ researcherClaim: 'יש לשמור את ערוץ הדיווח פתוח', whatEvidenceShows: 'ערוץ הדיווח פתוח' }],
      PASSAGES,
      HELD_TEXT,
    );
    expect(audited).toEqual({
      researcherClaim: 'יש לשמור את ערוץ הדיווח פתוח',
      quoteVerified: true,
      whatEvidenceShows: 'ערוץ הדיווח פתוח',
      phraseVerified: 'PRESENT',
      phraseVerifiedReason: null,
    });
    expect(Object.keys(audited ?? {})).toEqual([
      'researcherClaim',
      'quoteVerified',
      'whatEvidenceShows',
      'phraseVerified',
      'phraseVerifiedReason',
    ]);
  });

  it('quoteVerified is a span of ANY citing passage, whitespace collapsed (evidence A4 :1121) — the SECOND one counts', () => {
    const audited = auditDebateAssertions(
      [
        { researcherClaim: 'החוזר מורה על דיווח שבועי', whatEvidenceShows: 'דיווח שבועי' },
        { researcherClaim: 'נכתב כי יש לשמור', whatEvidenceShows: 'לשמור' },
        { researcherClaim: 'החוזר אוסר על דיווח', whatEvidenceShows: 'דיווח' },
      ],
      PASSAGES,
      HELD_TEXT,
    );
    expect(audited.map((a) => a.quoteVerified)).toEqual([true, true, false]);
  });

  it('a phrase the text does not carry is ABSENT, with NO reason — a searched text that says nothing is not UNCHECKED', () => {
    const [audited] = auditDebateAssertions(
      [{ researcherClaim: 'יש לשמור את ערוץ הדיווח פתוח', whatEvidenceShows: 'הערוץ ייסגר מיד' }],
      PASSAGES,
      HELD_TEXT,
    );
    expect([audited?.phraseVerified, audited?.phraseVerifiedReason]).toEqual(['ABSENT', null]);
  });

  it('a document whose content is its BYTES — a file, or nothing a model reads — is UNCHECKED WITH ITS REASON (§3 :363)', () => {
    const bytes = [
      document({ form: 'FILE', file: { mimeType: 'image/png', base64: 'AAAA' } }),
      document({ form: 'UNREAD' }),
    ];
    for (const content of bytes) {
      const [audited] = auditDebateAssertions(
        [{ researcherClaim: 'יש לשמור את ערוץ הדיווח פתוח', whatEvidenceShows: 'ערוץ הדיווח פתוח' }],
        PASSAGES,
        content,
      );
      // Even a phrase the text version WOULD carry: there is no text version to search, so no verdict — never ABSENT.
      expect(audited?.phraseVerified).toBe('UNCHECKED');
      expect(audited?.phraseVerifiedReason).toMatch(/bytes/);
      // The quote half is the passage's and is checked all the same.
      expect(audited?.quoteVerified).toBe(true);
    }
  });

  it('THE EMPTINESS GUARD, CALLED: an empty or blank phrase is UNCHECKED with its reason; an empty claim is no quotation', () => {
    const audited = auditDebateAssertions(
      [
        { researcherClaim: '', whatEvidenceShows: 'ערוץ הדיווח' },
        { researcherClaim: 'יש לשמור', whatEvidenceShows: '   ' },
      ],
      PASSAGES,
      HELD_TEXT,
    );
    expect(audited.map((a) => [a.quoteVerified, a.phraseVerified])).toEqual([
      [false, 'PRESENT'],
      [true, 'UNCHECKED'],
    ]);
    expect(audited[1]?.phraseVerifiedReason).toMatch(/empty/);
  });

  it('a DIFF is searched CHUNK BY CHUNK through the one fold — a phrase straddling two chunks is ABSENT', () => {
    const diff: AssessedContent = {
      kind: 'DIFF',
      before: '20220628000000',
      after: '20220805000000',
      chunks: [
        { side: 'REMOVED', text: 'תופעות הלוואי' },
        { side: 'ADDED', text: 'השכיחות ביותר' },
      ],
    };
    const audited = auditDebateAssertions(
      [
        { researcherClaim: 'יש לשמור', whatEvidenceShows: 'תופעות הלוואי' },
        { researcherClaim: 'יש לשמור', whatEvidenceShows: 'הלוואי השכיחות' },
      ],
      PASSAGES,
      diff,
    );
    expect(audited.map((a) => a.phraseVerified)).toEqual(['PRESENT', 'ABSENT']);
  });

  it('an assessor that named NO assertion is audited to [] — an empty list is a real answer, not an old row', () => {
    expect(auditDebateAssertions([], PASSAGES, HELD_TEXT)).toEqual([]);
  });
});

/**
 * What a second spelling of the rule needs in a module's code: a verdict value written as a string, or a text search.
 * The words in a COMMENT are prose (the docblocks name the three values), so only a QUOTED value counts — in any of the
 * three quotes — and a search is `.includes(` or `.replace(`, the two halves of `normaliseClaim(...).includes(...)`.
 */
function secondSpellingIn(code: string): string[] {
  return [
    ...[...code.matchAll(/(['"`])(PRESENT|ABSENT|UNCHECKED)\1/g)].map((m) => m[0]),
    ...[...code.matchAll(/\.(includes|replace)\s*\(/g)].map((m) => m[0]),
  ];
}

describe('ONE SPELLING — the debate audit CALLS the framing audit’s guard and the one rule, and spells neither', () => {
  const source = readFileSync(join(__dirname, '..', 'src', 'services', 'debateAudit.ts'), 'utf8');

  it('imports `auditAssertion` from framingAudit, and nothing but the TYPE `Verdict` from the rule’s own modules', () => {
    expect(source).toMatch(/import \{ auditAssertion, type AuditedRecord \} from '\.\/framingAudit';/);
    // EVERY LINE naming either module, whatever the import's spelling — named, aliased, a namespace, `require`: a type
    // import of `Verdict` is a name, not a rule, and anything else would be the means of a second spelling.
    const naming = source.split('\n').filter((line) => /lib\/(verdict|normalise)\b/.test(line));
    expect(naming).toEqual(["import type { Verdict } from '../lib/verdict';"]);
    // And no load a static reading cannot see.
    expect(source).not.toMatch(/\brequire\s*\(|\bimport\s*\(/);
  });

  // R82 Entry 3, MEDIUM 3: an INLINE second spelling needs no import at all — `text.replace(/\s+/g, ' ').includes(…)`
  // returning 'PRESENT' passed every behavioural case once guarded past the empty-phrase edge (REVIEW's M1b).
  it('computes no verdict itself — no quoted PRESENT / ABSENT / UNCHECKED, no `.includes(`, no `.replace(`', () => {
    expect(secondSpellingIn(source)).toEqual([]);
  });

  it('DETECTS M1b, the inline spelling guarded past the empty edge, in every quote — and the prose of a comment passes', () => {
    const m1b = (quote: string) =>
      'const phrase = assertion.whatEvidenceShows.replace(/\\s+/g, " ").trim();\n' +
      `const found = phrase === "" ? ${quote}UNCHECKED${quote} : text.replace(/\\s+/g, " ").includes(phrase) ? ${quote}PRESENT${quote} : ${quote}ABSENT${quote};`;
    for (const quote of ["'", '"', '`']) {
      expect(secondSpellingIn(m1b(quote))).toEqual([
        `${quote}UNCHECKED${quote}`,
        `${quote}PRESENT${quote}`,
        `${quote}ABSENT${quote}`,
        '.replace(',
        '.replace(',
        '.includes(',
      ]);
    }
    expect(secondSpellingIn('/** UNCHECKED beside bytes; null beside PRESENT and ABSENT. */')).toEqual([]);
  });
});
