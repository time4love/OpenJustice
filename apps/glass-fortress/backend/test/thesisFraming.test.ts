jest.mock('../src/lib/prisma', () => ({
  prisma: (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).db,
}));
jest.mock('../src/context/researcherContext', () => ({
  getResearcherId: (): string | null => identity.researcherId,
}));
// THE ASSESSOR, MOCKED AT ITS BOUNDARY — §8 of the brief. No case spends a real
// call, and the count of draws is what case 17 and case 18 assert. The module's
// other exports are the REAL ones, so the schema this file feeds the audit is the
// schema the tool parses.
jest.mock('../src/services/framingAssessor', () => {
  const actual = jest.requireActual('../src/services/framingAssessor') as typeof import('../src/services/framingAssessor');
  return {
    ...actual,
    FramingAssessor: class {
      async assess(): Promise<unknown> {
        // WHAT HAD BEEN WRITTEN AT THE MOMENT OF THE DRAW — recorded here rather
        // than reconstructed afterwards, which is the only way the ORDER is
        // observed rather than assumed.
        const log = (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).written;
        draws.push(log.filter((w) => w.model === 'framingRound').map((w) => String(w.data['type'])));
        const next = queued.shift();
        if (next === undefined) throw new Error('the test queued no assessment for this draw');
        if (next instanceof Error) throw next;
        return next;
      }
    },
  };
});

import { Prisma } from '@prisma/client';
import { auditAssessment } from '../src/services/framingAudit';
import type { AssessedRecord, FramingAssessment } from '../src/services/framingAssessor';
import { assessFramingHandler } from '../src/mcp/tools/assessFraming';
import { chooseFramingHandler } from '../src/mcp/tools/chooseFraming';
import { db, resetDouble, store, written } from './helpers/evidenceDouble';
import { AFTER, BEFORE, URL, PAGE, DIFF_ROW, CURRENT_VERSION } from './helpers/corpusFixture';

// ---------------------------------------------------------------------------
// THE FRAMING'S ROUNDS, THE COMPUTED CONTENT, AND THE AUDIT — thesis step 19.
//
// PLAN §5's `thesisFraming` ROW, REWRITTEN: "step 19: rounds on a `Framing`,
// computed content, the audit, `choose_framing`; the session and `NO_EVIDENCE`
// go." Its predecessor went with the code it tested at evidence step 11a
// (refactor plan §4 rule 3 as amended :521–:525), so this is the successor, on
// clean ground.
//
// WHAT WENT WITH THE SESSION: `openThesisFraming`'s one-active-session refusal,
// the vault search on the question, `NO_EVIDENCE`, `attachThesisToFraming`,
// `linkThesisToFraming`'s derivation and `repairFramingLink`. `Framing.thesisId`
// is a plain column set by `open_framing` or `create_thesis` (A2 :1297), so
// there is nothing to derive and nothing to repair.
// WHAT MIGRATED AS AN ASSERTION about the new contract: THE EXCHANGE IS THE
// RECORD — both the proposal and the assessment are rows (cases 14–16).
//
// IN THE UNIT PROJECT, which is the only run that gates (step 18's record §7).
// `test/thesis/framing.test.ts` holds the four tools' REFUSALS in the acceptance
// project; the AUDIT is owed here, where a merge can be blocked by it.
// ---------------------------------------------------------------------------

const identity: { researcherId: string | null } = { researcherId: null };
const draws: string[][] = [];
const queued: (FramingAssessment | Error)[] = [];

const AUTHOR = 'researcher-author';
const FRAMING_ID = 'framing-1';

/** The proposal every case audits against — deliberately re-wrapped and double-spaced. */
const PROPOSAL = 'משרד הבריאות הסיר מהעמוד את\n  הפסקה על תופעות הלוואי,   והחזירה כעבור חודש';

const ELEMENTS = ['DUTY_HOLDER', 'KNOWLEDGE_POINT', 'DISCLOSURE_TIMELINE', 'DIVERGENCE'] as const;

const CAPTURE_RECORD: AssessedRecord = {
  label: '[1]',
  kind: 'CAPTURE',
  url: URL,
  capture: AFTER.waybackTimestamp,
  text: 'תופעות הלוואי השכיחות מופיעות לרוב יום או יומיים אחרי קבלת החיסון',
};

/** A pair whose chunks split AT A WORD BOUNDARY — the edge a real diff chunk has. */
const WORD_BOUNDARY_DIFF: AssessedRecord = {
  label: '[1]',
  kind: 'DIFF',
  url: URL,
  before: BEFORE.waybackTimestamp,
  after: AFTER.waybackTimestamp,
  chunks: [
    { side: 'REMOVED', text: 'משרד הבריאות הסיר את' },
    { side: 'REMOVED', text: 'הבטחת הבטיחות שלו' },
  ],
};

/** The same pair split MID-WORD. */
const MID_WORD_DIFF: AssessedRecord = {
  ...WORD_BOUNDARY_DIFF,
  chunks: [
    { side: 'REMOVED', text: 'משרד הבריאות הסיר את הבטחת הבט' },
    { side: 'REMOVED', text: 'יחות שלו' },
  ],
};

/** One REMOVED chunk carrying the phrase, and an ADDED chunk that does not. */
const REMOVED_SIDE_DIFF: AssessedRecord = {
  ...WORD_BOUNDARY_DIFF,
  chunks: [
    { side: 'REMOVED', text: 'הקישור לדיווח על תופעות לוואי' },
    { side: 'ADDED', text: 'החיסון נמצא יעיל ובטוח' },
  ],
};

const assessment = (over: Partial<FramingAssessment> = {}): FramingAssessment => ({
  candidateFramings: [],
  contradictions: [],
  unverifiedAssumptions: [],
  elements: [],
  recommendedFraming: 'מסגור מומלץ',
  reasoning: 'הנמקה',
  ...over,
});

const contradiction = (over: Partial<FramingAssessment['contradictions'][number]> = {}) => ({
  researcherClaim: 'הסיר מהעמוד את הפסקה על תופעות הלוואי',
  whatEvidenceShows: 'תופעות הלוואי השכיחות',
  record: '[1]',
  ...over,
});

const audit = (over: { records?: AssessedRecord[]; assessment?: FramingAssessment } = {}) =>
  auditAssessment({
    proposedFraming: PROPOSAL,
    elementShapes: ELEMENTS,
    records: over.records ?? [CAPTURE_RECORD],
    assessment: over.assessment ?? assessment(),
  });

beforeEach(() => {
  resetDouble();
  identity.researcherId = AUTHOR;
  draws.length = 0;
  queued.length = 0;
  seedFraming();
});

/** A framing of the author's, with no rounds yet, over the corpus fixture. */
function seedFraming(over: Record<string, unknown> = {}): void {
  store.framings = [
    {
      id: FRAMING_ID,
      question: 'האם הציבור קיבל את המידע בזמן אמת?',
      provision: 'NUREMBERG_1',
      researcherId: AUTHOR,
      thesisId: null,
      fromRunId: null,
      clusterIndex: null,
      createdAt: new Date('2026-09-12T09:00:00.000Z'),
      ...over,
    },
  ];
  store.framingRounds = [];
  // `text` IS SEEDED EXPLICITLY. The shared corpus fixture's capture rows carry no
  // `text` column, and the double answers `urlSnapshot.findUnique` from the stored
  // row as it is — so a capture's text arrives as `undefined` under a generated
  // type that says `string`. The CAPTURE arm of any tool that reads a capture's
  // text needs it seeded; reported, not chased.
  store.captures = [
    { ...BEFORE, trackedUrlId: PAGE.id, trackedUrl: PAGE, text: 'הטקסט הקודם של העמוד' },
    { ...AFTER, trackedUrlId: PAGE.id, trackedUrl: PAGE, text: CAPTURE_RECORD.kind === 'CAPTURE' ? CAPTURE_RECORD.text : '' },
  ];
  store.diffs = [{ ...DIFF_ROW, trackedUrlId: PAGE.id, contentVersions: [CURRENT_VERSION] }];
  store.contentVersions = [{ ...CURRENT_VERSION, diffId: DIFF_ROW.id }];
}

const roundsWritten = () => written.filter((w) => w.model === 'framingRound');

// ---------------------------------------------------------------------------
// A. quoteVerified — a whitespace-collapsed substring of the proposal (T1 :256)
// ---------------------------------------------------------------------------

describe('the audit · quoteVerified — the researcher is quoted, or the machine is marked', () => {
  it('1 · TRUE for a span copied from the proposal and re-wrapped — whitespace is collapsed on both sides', () => {
    const out = audit({
      assessment: assessment({
        contradictions: [contradiction({ researcherClaim: 'הסיר מהעמוד את\nהפסקה   על תופעות הלוואי' })],
      }),
    });
    expect(out.contradictions.map((c) => c.quoteVerified)).toEqual([true]);
  });

  // THE DEFECT'S OWN REPRODUCTION — docs/gf-framing-assessor-defects.md: four runs
  // on two corpora, five days apart, returned the researcher's claim with a cause
  // inserted that they never wrote.
  it('2 · FALSE when the assessor inserts a cause the researcher never wrote — the reproduced defect', () => {
    const out = audit({
      assessment: assessment({
        contradictions: [
          contradiction({ researcherClaim: 'הסיר מהעמוד את הפסקה על תופעות הלוואי בעקבות החשיפה' }),
        ],
      }),
    });
    expect(out.contradictions.map((c) => c.quoteVerified)).toEqual([false]);
  });

  it('3 · the misquoting contradiction is STILL RECORDED — shown, labelled, never dropped (T1 :294–:300)', () => {
    const out = audit({
      assessment: assessment({
        contradictions: [contradiction({ researcherClaim: 'טענה שהחוקר לא כתב מעולם' })],
      }),
    });
    expect(out.contradictions).toHaveLength(1);
    expect(out.contradictions.at(0)?.researcherClaim).toBe('טענה שהחוקר לא כתב מעולם');
    expect(out.contradictions.at(0)?.whatEvidenceShows).toBe('תופעות הלוואי השכיחות');
  });
});

// ---------------------------------------------------------------------------
// A'. AN EMPTY ASSERTION — the guard spans BOTH verdict fields, so it is neither
// describe's alone.
// ---------------------------------------------------------------------------

describe('the audit · an EMPTY assertion is not a verified one', () => {
  // AN EMPTY ASSERTION IS NOT A VERIFIED ONE — and this guard exists because its
  // NEIGHBOUR had one and these two did not. `''.includes('')` is true and the
  // schema types both fields `z.string()` with no minimum, so an assessor
  // returning an empty string parsed and was reported VERIFIED for an assertion
  // that says nothing (`memory/gf-vacuity-guard-on-one-field-not-its-neighbour`).
  it('3a · an EMPTY researcherClaim is NOT verbatim — an empty claim is not a quotation at all', () => {
    const out = audit({
      assessment: assessment({ contradictions: [contradiction({ researcherClaim: '' })] }),
    });
    expect(out.contradictions.map((c) => c.quoteVerified)).toEqual([false]);
  });

  it('3b · an EMPTY whatEvidenceShows is UNCHECKED, with its reason — nothing to search for, so no verdict was reached', () => {
    const out = audit({
      assessment: assessment({ contradictions: [contradiction({ whatEvidenceShows: '' })] }),
    });
    expect(out.contradictions.map((c) => c.phraseVerified)).toEqual(['UNCHECKED']);
    expect(out.contradictions.at(0)?.phraseVerifiedReason).toMatch(/empty/);
    // Never silently PRESENT, and the assertion is still on the record.
    expect(out.contradictions).toHaveLength(1);
  });

  // THE CASE THAT PROVES THE GUARD IS ON THE NORMALISED FORM. A `=== ''` test
  // would pass both cases above and let whitespace through.
  it('3c · a WHITESPACE-ONLY pair is empty too — the guard is on the NORMALISED form, not on === \'\'', () => {
    const out = audit({
      assessment: assessment({
        contradictions: [contradiction({ researcherClaim: '   ', whatEvidenceShows: ' \n\t ' })],
      }),
    });
    const only = out.contradictions.at(0);
    expect([only?.quoteVerified, only?.phraseVerified]).toEqual([false, 'UNCHECKED']);
  });
});

// ---------------------------------------------------------------------------
// B. phraseVerified — the ONE verdict rule over the record's CURRENT content
// ---------------------------------------------------------------------------

describe('the audit · phraseVerified — the ONE verdict rule over the record’s current content', () => {
  it('4 · PRESENT for a phrase the capture’s current text carries', () => {
    const out = audit({
      assessment: assessment({ contradictions: [contradiction({ whatEvidenceShows: 'מופיעות לרוב יום או יומיים' })] }),
    });
    expect(out.contradictions.map((c) => c.phraseVerified)).toEqual(['PRESENT']);
  });

  // THE STOCK-PHRASE DEFECT, as the fixture. Three independent model calls
  // attributed `קלות וחולפות בלבד` to a page that states ONSET, not duration —
  // "the exact distinction the thesis turns on".
  it('5 · ABSENT for the stock Hebrew collocation the page never said — onset, not duration', () => {
    const out = audit({
      assessment: assessment({ contradictions: [contradiction({ whatEvidenceShows: 'קלות וחולפות בלבד' })] }),
    });
    expect(out.contradictions.map((c) => c.phraseVerified)).toEqual(['ABSENT']);
  });

  it('6 · UNCHECKED, WITH ITS REASON, for an assertion naming a record this call never supplied', () => {
    const out = audit({
      assessment: assessment({ contradictions: [contradiction({ record: '[9]' })] }),
    });
    expect(out.contradictions.map((c) => c.phraseVerified)).toEqual(['UNCHECKED']);
    expect(out.contradictions.at(0)?.phraseVerifiedReason).toMatch(/\[9\]/);
    // Never silently PRESENT, and never dropped either.
    expect(out.contradictions).toHaveLength(1);
  });

  // 7 is the CALL, proven in the report by breaking `verdict` at its definition in
  // lib/verdict.ts and watching case 5 redden. Held here as the property a second
  // spelling would have to reproduce: whitespace differing on both sides.
  it('7 · it CALLS the verdict rule — whitespace differing on either side does not change the verdict', () => {
    const spaced: AssessedRecord = { ...CAPTURE_RECORD, text: 'תופעות\n\nהלוואי   השכיחות מופיעות' };
    const out = audit({
      records: [spaced],
      assessment: assessment({ contradictions: [contradiction({ whatEvidenceShows: 'תופעות  הלוואי השכיחות' })] }),
    });
    expect(out.contradictions.map((c) => c.phraseVerified)).toEqual(['PRESENT']);
  });

  // EACH CHUNK IS SEARCHED SEPARATELY, so a phrase no single chunk carries is
  // ABSENT for EVERY split. Two fixtures, because each catches one wrong join:
  // a NON-EMPTY separator manufactures a word boundary and a BARE CONCATENATION
  // destroys one, so neither fixture can see the other's defect.
  it('8 · ABSENT for a phrase straddling a WORD-BOUNDARY chunk edge — EXCLUDES join(\'\') , catches any non-empty separator', () => {
    const out = audit({
      records: [WORD_BOUNDARY_DIFF],
      assessment: assessment({ contradictions: [contradiction({ whatEvidenceShows: 'הסיר את הבטחת הבטיחות' })] }),
    });
    expect(out.contradictions.map((c) => c.phraseVerified)).toEqual(['ABSENT']);
  });

  it('9 · ABSENT for a phrase straddling a MID-WORD chunk edge — EXCLUDES every non-empty separator, catches join(\'\')', () => {
    const out = audit({
      records: [MID_WORD_DIFF],
      assessment: assessment({ contradictions: [contradiction({ whatEvidenceShows: 'הבטחת הבטיחות' })] }),
    });
    expect(out.contradictions.map((c) => c.phraseVerified)).toEqual(['ABSENT']);
  });

  // BOTH SIDES ARE SEARCHED. Evidence A1 :911 defines a DIFF's contentVersionHash
  // over `[ { side: 'REMOVED'|'ADDED', text } … ]` — "the differ's raw segments in
  // the differ's output order". That IS the record's current content, both sides
  // in it. A phrase a REMOVED chunk carries is something the record SHOWS: the
  // page once said it, and it was taken away.
  it('10 · PRESENT for a phrase carried by a REMOVED chunk and by no ADDED one (evidence A1 :911)', () => {
    const out = audit({
      records: [REMOVED_SIDE_DIFF],
      assessment: assessment({ contradictions: [contradiction({ whatEvidenceShows: 'הקישור לדיווח על תופעות לוואי' })] }),
    });
    expect(out.contradictions.map((c) => c.phraseVerified)).toEqual(['PRESENT']);
  });
});

// ---------------------------------------------------------------------------
// C. filled — supplied AND ACQUIRED (T1 :263–:265)
// ---------------------------------------------------------------------------

describe('the audit · filled — an element is filled by a record the researcher supplied', () => {
  const two: AssessedRecord[] = [CAPTURE_RECORD, { ...WORD_BOUNDARY_DIFF, label: '[2]' }];

  it('11 · TRUE when every record the element names was supplied, and both are carried', () => {
    const out = audit({
      records: two,
      assessment: assessment({ elements: [{ element: 'DUTY_HOLDER', records: ['[1]', '[2]'] }] }),
    });
    const duty = out.elements.find((e) => e.element === 'DUTY_HOLDER');
    expect([duty?.filled, duty?.records]).toEqual([true, ['[1]', '[2]']]);
  });

  it('12 · FALSE when it names a record this call did NOT supply — "filled by a record nobody holds is UNFILLED"', () => {
    const out = audit({
      records: two,
      assessment: assessment({ elements: [{ element: 'DUTY_HOLDER', records: ['[1]', '[9]'] }] }),
    });
    const duty = out.elements.find((e) => e.element === 'DUTY_HOLDER');
    expect([duty?.filled, duty?.records]).toEqual([false, ['[1]']]);
  });

  it('13 · FALSE, and NOT an error, for an element the assessor named no record for — the honest output (T1 :277–:285)', () => {
    const out = audit({ assessment: assessment({ elements: [] }) });
    // EVERY element of the provision is reported, including the ones the assessor
    // omitted entirely: an element missing from the output is still MISSING, and a
    // report that listed only what the model mentioned would examine nothing and
    // say so as though it were a pass.
    expect(out.elements.map((e) => e.element)).toEqual([...ELEMENTS]);
    expect(out.elements.every((e) => !e.filled)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// D. The two rounds — the exchange IS the record
// ---------------------------------------------------------------------------

describe('assess_framing · the two rounds', () => {
  const call = async (over: Record<string, unknown> = {}) =>
    assessFramingHandler({
      framingId: FRAMING_ID,
      proposedFraming: PROPOSAL,
      elements: [{ element: 'DUTY_HOLDER', records: ['[1]'] }],
      records: [{ url: URL, capture: AFTER.waybackTimestamp }],
      trajectoryIds: [],
      ...over,
    } as Parameters<typeof assessFramingHandler>[0]);

  it('14 · PROPOSED carries the proposal VERBATIM, before any model has read it (T1 :247–:248)', async () => {
    queued.push(assessment());
    await call();
    const proposed = roundsWritten().at(0);
    expect(proposed?.data['type']).toBe('PROPOSED');
    // BYTE-IDENTICAL: the double spaces and the line break survive. A tool that
    // tidied the researcher's words would put a paraphrase on the record.
    expect((proposed?.data['content'] as { framing: string }).framing).toBe(PROPOSAL);
    expect((proposed?.data['content'] as { elements: unknown }).elements).toEqual([
      { element: 'DUTY_HOLDER', records: ['[1]'] },
    ]);
  });

  it('15 · ASSESSED carries a verdict beside EVERY assertion — two contradictions and four elements, not just the first', async () => {
    queued.push(
      assessment({
        contradictions: [
          contradiction({ whatEvidenceShows: 'מופיעות לרוב יום או יומיים' }),
          contradiction({ researcherClaim: 'טענה שלא נכתבה', whatEvidenceShows: 'קלות וחולפות בלבד' }),
        ],
        elements: [{ element: 'DUTY_HOLDER', records: ['[1]'] }],
      }),
    );
    await call();
    const content = roundsWritten().at(1)?.data['content'] as {
      contradictions: { quoteVerified: boolean; phraseVerified: string }[];
      elements: { filled: boolean }[];
    };
    expect(content.contradictions.map((c) => [c.quoteVerified, c.phraseVerified])).toEqual([
      [true, 'PRESENT'],
      [false, 'ABSENT'],
    ]);
    expect(content.elements.map((e) => e.filled)).toEqual([true, false, false, false]);
  });

  it('16 · ASSESSED records the model and the prompt version that produced it (A2 :1308)', async () => {
    queued.push(assessment());
    await call();
    const content = roundsWritten().at(1)?.data['content'] as { model: unknown; promptVersion: unknown };
    expect(typeof content.model).toBe('string');
    expect(content.promptVersion).toBe('v1-provision-elements-verbatim-claim');
  });

  // ---------------------------------------------------------------------------
  // E. The paid call, and the retry
  // ---------------------------------------------------------------------------

  it('17 · EXACTLY ONE assessor call per assess_framing', async () => {
    queued.push(assessment());
    await call();
    expect(draws).toHaveLength(1);
  });

  // THE RETRY IS THE ONE PATH THAT COULD DRAW TWICE, and case 17 cannot see it:
  // it pins the count in a world where no unique violation occurs. Here the
  // ASSESSED insert loses the race on `(framingId, sequence)` and recomputes.
  it('18 · THE RETRY DRAWS NOTHING — the round lands, the assessor was called ONCE in total, and no code is returned', async () => {
    queued.push(assessment());
    store.collideOnFramingRoundCreate = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.22.0',
      meta: { target: ['framingId', 'sequence'] },
    });
    const out = JSON.parse(await call()) as Record<string, unknown>;

    expect(draws).toHaveLength(1);
    expect('code' in out).toBe(false);
    // The PROPOSED write lost the race and was recomputed; both rounds are on the
    // record, and their sequences are distinct.
    const sequences = roundsWritten().map((w) => w.data['sequence']);
    expect(sequences).toEqual([1, 2]);
  });

  it('19 · the draw sits BETWEEN the two writes, and no transaction is opened', async () => {
    queued.push(assessment());
    await call();
    // AT THE MOMENT OF THE DRAW exactly one round existed, and it was PROPOSED:
    // the researcher's words were on the record before any model read them, and
    // the assessment was not yet.
    expect(draws).toEqual([['PROPOSED']]);
    expect(roundsWritten().map((w) => String(w.data['type']))).toEqual(['PROPOSED', 'ASSESSED']);
    // Prisma's interactive-transaction window is 5 s by default and a model call
    // inside one rolls the whole round back (memory/gf-prisma-transaction-window).
    // Asked of the DELEGATE rather than of a counter this file would have to keep:
    // the double's own `$transaction` is the thing a tool would have had to call.
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('20 · when the draw throws, the framing holds PROPOSED and no ASSESSED — and choose_framing then refuses NOT_ASSESSED', async () => {
    queued.push(new Error('the model is unavailable'));
    await expect(call()).rejects.toThrow('the model is unavailable');
    expect(roundsWritten().map((w) => w.data['type'])).toEqual(['PROPOSED']);

    const refusal = JSON.parse(
      await chooseFramingHandler({ framingId: FRAMING_ID, claim: 'טענה', provision: 'NUREMBERG_1', elements: [] }),
    ) as { code?: string };
    expect(refusal.code).toBe('NOT_ASSESSED');
  });
});
