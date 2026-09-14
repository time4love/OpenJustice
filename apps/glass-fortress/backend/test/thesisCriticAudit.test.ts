import { auditCritique, type CritiqueAuditInput } from '../src/services/thesisCriticAudit';
import type { ThesisCritique } from '../src/services/thesisCritic';
import { DIFF_NAME } from './helpers/corpusFixture';
import { OPEN_GAP, OPEN_GAP_DESCRIPTION_SPACED } from './thesis/fixtures';

// ---------------------------------------------------------------------------
// THE AUDIT OF THE CRITIQUE, RULE BY RULE — docs/gf-thesis-flows.md T4 :595–:601; the R48 sketch §d4's table.
//
// IN THE UNIT PROJECT, which gates. The audit is PURE, so every rule is held here over values — the acceptance suite
// never sees a critique (the model factory is a tripwire). Each describe is one row of §d4: the case, and beside it the
// negative control that must stay as it is; the decoy each must redden is planted from a file and recorded in the report.
// ---------------------------------------------------------------------------

const TEXT = 'משרד הבריאות הסיר את הפסקה.\nהוא המשיך להמליץ על החיסון כבטוח לכל הגילאים.';

const INPUT: Omit<CritiqueAuditInput, 'critique'> = {
  text: TEXT,
  records: [
    { label: '[1]', name: `0x${'11'.repeat(32)}`, kind: 'CAPTURE', url: 'https://example.gov.il/a', capture: '20220805053301', text: 'תופעות לוואי נדירות' },
    {
      label: '[2]',
      name: DIFF_NAME,
      kind: 'DIFF',
      url: 'https://example.gov.il/b',
      before: '20201209134003',
      after: '20210612183110',
      chunks: [
        { side: 'REMOVED', text: 'הקישור לדיווח על תופעות לוואי' },
        { side: 'ADDED', text: 'החיסון בטוח ויעיל' },
      ],
    },
  ],
  trajectories: [
    {
      label: '[T1·clx9traj]',
      id: 'clx9trajectory00000000001',
      resolves: true,
      url: 'https://example.gov.il/b',
      claimText: 'הקישור לדיווח',
      finalState: 'REMOVED',
      spans: [],
      caveat: 'caveat',
    },
    { label: '[T2·clx9gone]', id: 'clx9gone0000000000000002', resolves: false },
  ],
  gaps: [{ gapId: OPEN_GAP.gapId, description: OPEN_GAP.description, readsAs: 'DISMISSED', reason: 'לא רלוונטי' }],
};

const STRENGTH: ThesisCritique['strength'] = { grade: 'MODERATE', reasoning: 'נימוק' };

/** One counter-argument, audited. */
const argue = (over: Partial<ThesisCritique['counterArguments'][number]>) =>
  auditCritique({
    ...INPUT,
    critique: {
      counterArguments: [{ quote: 'משרד הבריאות הסיר את הפסקה.', challenge: 'אתגר', grounding: 'RECORD', source: '[2]', phrase: 'החיסון בטוח', ...over }],
      suggestedGaps: [],
      alternativeReadings: [],
      strength: STRENGTH,
    },
  }).counterArguments[0];

const suggest = (description: string) =>
  auditCritique({
    ...INPUT,
    critique: { counterArguments: [], suggestedGaps: [{ description, document: 'מסמך', holder: 'המשרד' }], alternativeReadings: [], strength: STRENGTH },
  }).suggestedGaps[0];

describe('R-Q quoteVerified — a whitespace-collapsed substring of the version text (T4 :596)', () => {
  it('a quote re-wrapped across the text\'s newline is VERIFIED — NORMALISE on both sides', () => {
    expect(argue({ quote: 'הסיר את הפסקה. הוא   המשיך' })?.quoteVerified).toBe(true);
  });

  it('a paraphrase is NOT verified — and is recorded, not dropped', () => {
    const audited = argue({ quote: 'המשרד מחק את הפסקה' });
    expect([audited?.quoteVerified, audited?.quote]).toEqual([false, 'המשרד מחק את הפסקה']);
  });

  it('negative control: a verbatim sentence is verified', () => {
    expect(argue({})?.quoteVerified).toBe(true);
  });
});

describe('R-Q0 — an EMPTY quote on the normalised form is not a quotation', () => {
  it('a whitespace-only quote is NOT verified', () => {
    expect(argue({ quote: '  \n ' })?.quoteVerified).toBe(false);
  });
});

describe('R-P phraseVerified over a RECORD — the ONE verdict rule, each chunk apart, both sides (T4 :597–:599)', () => {
  it('a phrase a REMOVED chunk carries is PRESENT', () => {
    expect(argue({ phrase: 'לדיווח על   תופעות' })).toMatchObject({ phraseVerified: 'PRESENT', phraseVerifiedReason: null });
  });

  it('a phrase STRADDLING two chunks is ABSENT — no chunk says it', () => {
    expect(argue({ phrase: 'תופעות לוואי החיסון' })?.phraseVerified).toBe('ABSENT');
  });

  it('negative control: a phrase inside one chunk of the ADDED side is PRESENT; a capture\'s text is searched whole', () => {
    expect([argue({ phrase: 'בטוח ויעיל' })?.phraseVerified, argue({ source: '[1]', phrase: 'לוואי נדירות' })?.phraseVerified]).toEqual([
      'PRESENT',
      'PRESENT',
    ]);
  });
});

describe('R-P over an ABSENCE — the same verdict, recorded as it falls', () => {
  it('a claimed absence whose phrase IS in the record is recorded PRESENT beside grounding ABSENCE — shown contradicted, never corrected', () => {
    expect(argue({ grounding: 'ABSENCE', phrase: 'החיסון בטוח' })).toMatchObject({ grounding: 'ABSENCE', phraseVerified: 'PRESENT' });
  });

  it('negative control: an absence that holds is ABSENT', () => {
    expect(argue({ grounding: 'ABSENCE', phrase: 'פרוטוקול הוועדה' })?.phraseVerified).toBe('ABSENT');
  });
});

describe('R-P0 — an EMPTY phrase on the normalised form is UNCHECKED, with its reason', () => {
  it('a whitespace-only phrase is UNCHECKED — "an empty assertion is not a verified one"', () => {
    const audited = argue({ phrase: ' \t' });
    expect(audited?.phraseVerified).toBe('UNCHECKED');
    expect(audited?.phraseVerifiedReason).toContain('empty');
  });
});

describe('R-PU / R-PA — a source the call did not hand, and an absence named in no record', () => {
  it('a label the call did not hand is UNCHECKED, naming it', () => {
    const audited = argue({ source: '[9]' });
    expect(audited?.phraseVerified).toBe('UNCHECKED');
    expect(audited?.phraseVerifiedReason).toContain('[9]');
  });

  it('an absence with no source is UNCHECKED, said as unchecked', () => {
    const audited = argue({ grounding: 'ABSENCE', source: '' });
    expect(audited?.phraseVerified).toBe('UNCHECKED');
    expect(audited?.phraseVerifiedReason).toContain('named in no record');
  });

  it('a RECORD grounding naming no source is UNCHECKED too — never silently PRESENT', () => {
    expect(argue({ source: '  ' })?.phraseVerified).toBe('UNCHECKED');
  });
});

describe('R-PT — a TRAJECTORY source: its claimText, matched on the ORDINAL (R48 §6-R28; FINDING 78)', () => {
  it('[T1] and [T1·clx9traj] both resolve the first trajectory, and its claim is searched', () => {
    expect([argue({ source: '[T1]', phrase: 'הקישור' })?.phraseVerified, argue({ source: '[T1·clx9traj]', phrase: 'בטוח' })?.phraseVerified]).toEqual([
      'PRESENT',
      'ABSENT',
    ]);
  });

  it('a trajectory no pass holds is UNCHECKED, said; a hash-only label resolves nothing', () => {
    expect(argue({ source: '[T2·clx9gone]', phrase: 'הקישור' })?.phraseVerifiedReason).toContain('no detection pass');
    expect(argue({ source: '[Tclx9traj]', phrase: 'הקישור' })?.phraseVerified).toBe('UNCHECKED');
  });
});

describe('R-G / R-D — each suggested gap gains its id, and a decided one is KEPT and marked (T4 :641–:642)', () => {
  it('the id is gapId(description) — the shell vector over the spaced description — and it reads as the list says', () => {
    expect(suggest(OPEN_GAP_DESCRIPTION_SPACED)).toMatchObject({ gapId: OPEN_GAP.gapId, gapIdReason: null, onTheList: 'DISMISSED' });
  });

  it('negative control: a new gap is on no list', () => {
    expect(suggest('מסמך אחר לגמרי')?.onTheList).toBeNull();
  });

  it('a blank description names no gap — kept, with its reason, never the id of the empty string (R48 D11)', () => {
    expect(suggest('   ')).toMatchObject({ gapId: null, onTheList: null, gapIdReason: expect.stringContaining('no description') as unknown });
  });
});

describe("R-S — the strength is the critic's, and says so", () => {
  it('is recorded with `by: the critic`', () => {
    expect(auditCritique({ ...INPUT, critique: { counterArguments: [], suggestedGaps: [], alternativeReadings: ['קריאה'], strength: STRENGTH } })).toMatchObject({
      strength: { grade: 'MODERATE', reasoning: 'נימוק', by: 'the critic' },
      alternativeReadings: ['קריאה'],
    });
  });
});
