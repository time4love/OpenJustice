jest.mock('../src/lib/prisma', () => ({
  prisma: (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).db,
}));
jest.mock('../src/context/researcherContext', () => (require('./thesis/tools') as typeof import('./thesis/tools')).researcherContextDouble);
jest.mock('../src/factories/LLMFactory', () => (require('./thesis/tools') as typeof import('./thesis/tools')).llmFactoryTripwire);

import { checkPublicationReadinessHandler } from '../src/mcp/tools/checkPublicationReadiness';
import { publishThesisHandler } from '../src/mcp/tools/publishThesis';
import { unpublishThesisHandler } from '../src/mcp/tools/unpublishThesis';
import * as evidencePredicates from '../src/services/evidencePredicates';
import * as publicationAssessor from '../src/services/publicationAssessor';
import type { PublicationAssessorOutput } from '../src/services/publicationAssessor';
import { WRITE_TRANSACTION } from '../src/walk/pageLog';
import { URL } from './helpers/corpusFixture';
import {
  db,
  defaultTransaction,
  resetDouble,
  rolledBack,
  store,
  windows,
  written,
  writtenViaTx,
  type Row,
} from './helpers/evidenceDouble';
import { ATTEMPT, AUTHOR, MENTION, NEXT_VERSION, THESIS, VERSION } from './thesis/fixtures';
import {
  CURRENCIES,
  DOCUMENT_EXAMINED,
  EVIDENCE_NOT_EVALUABLE,
  evidencePasses,
  gap,
  seedPublishable,
  trajectoriesAre,
} from './thesis/gateWorld';
import { mentionRow } from './thesis/rows';
import { actAs, forgetTheFirstCall, resetTools, seedThesis, tripped } from './thesis/tools';

// ---------------------------------------------------------------------------
// publish_thesis — THE PAID ACT, past the five refusals. docs/gf-thesis-flows.md T5 :772–:789, A4 :1510–:1514, §12
// :1141; the R49 sketch §b2, §f3 (R1, R10, R16). Thesis step 23 — the successor of plan §5's `thesisPublication`.
//
// IN THE UNIT PROJECT, which gates. The acceptance suite holds the five refusals with the model a tripwire and owes
// NOT_PUBLISHABLE here (R14): every arm past the assessor is held with the assessor STUBBED AT ITS ONE DRAW, `assess`.
//
//   the happy path       statement first · ONE draw · the pin's compare-and-set and ONE PUBLISHED attempt in ONE
//                        windowed transaction · `overObjection` from the verdict, never from check 17 · `opened`
//   the gate refusing    ONE REFUSED attempt, `refusedBy` the HARD ids in A6's order, no pin, each subject named
//   the appeals' names   a person named only in a CALL item fails check 16 (the researcher's ruling, Q1 (b))
//   the draw throwing    no attempt, no pin — the statement stays (D4)
//   THE RACE (R10)       the head moved / the pin set by another call → ONE REFUSED attempt `HEAD_VERSION`, committed
//   the WITHDRAWN head   publish → unpublish → publish the same version → NOT_PUBLISHABLE, "withdrawn" (R16)
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
  resetTools();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const STATEMENT = 'עניין ציבורי מובהק';
const RATIONALE = 'הטיעון לפרסום הגרסה הזו';

const output = (over: Partial<PublicationAssessorOutput> = {}): PublicationAssessorOutput => ({
  rationaleHasSubstance: true,
  substanceGaps: [],
  verdict: 'SUPPORTS',
  objection: '',
  names: [],
  allegationsFramed: true,
  allegationsNote: '',
  assessment: 'הנימוק בעל ממש ותואם את הטקסט.',
  ...over,
});

const publish = async (input: Readonly<Record<string, string>> = { thesisId: THESIS.id, rationale: RATIONALE }): Promise<Record<string, unknown>> => {
  actAs(AUTHOR);
  return JSON.parse(await publishThesisHandler({ thesisId: THESIS.id, rationale: RATIONALE, ...input })) as Record<string, unknown>;
};

/** VERSION's world, publishable save what a case breaks: the evidence half stubbed passing, no trajectory cited. */
const seedReady = async (over: Parameters<typeof seedPublishable>[0] = {}): Promise<void> => {
  await seedPublishable(over);
  jest.spyOn(evidencePredicates, 'publishableEvidence').mockResolvedValue(evidencePasses(VERSION));
  trajectoriesAre(CURRENCIES.PINNED_IS_LATEST);
};

const attempts = (): Row[] => written.filter((w) => w.model === 'publicationAttempt').map((w) => w.data);

/** Move the thesis in the store — as another call's commit would, in the instant before this call's transaction. */
const moveThesis = (over: Row): void => {
  store.theses = store.theses.map((t) => ({ ...t, ...over }));
  store.thesis = store.theses.at(0) ?? null;
};

describe('publish_thesis — the happy path: ONE draw, then the pin and ONE PUBLISHED attempt in ONE transaction (T5 :780–:789)', () => {
  it('stores the statement BEFORE the draw, spends ONCE, and commits the compare-and-set and the attempt — the assessment VERBATIM — through one windowed transaction', async () => {
    await seedReady({ statement: null });
    const OUTPUT = output();
    let writtenAtTheDraw: string[] = [];
    const draw = jest.spyOn(publicationAssessor, 'assess').mockImplementation(() => {
      writtenAtTheDraw = written.map((w) => `${w.model}.${w.op}`);
      return Promise.resolve(OUTPUT);
    });

    const out = await publish({ publicInterestStatement: STATEMENT });

    expect(draw).toHaveBeenCalledTimes(1);
    expect(writtenAtTheDraw).toEqual(['thesis.update']);
    expect(written.map((w) => `${w.model}.${w.op}`)).toEqual(['thesis.update', 'thesis.updateMany', 'publicationAttempt.create']);
    expect(written.at(0)?.data).toEqual({ publicInterestStatement: STATEMENT });
    expect(writtenViaTx).toEqual(written.slice(1));
    expect([windows, rolledBack]).toEqual([[WRITE_TRANSACTION], []]);

    const [attempt] = attempts();
    const publishedAt = attempt?.['createdAt'];
    expect(publishedAt).toBeInstanceOf(Date);
    expect(written.at(1)?.data).toEqual({ publishedVersionId: VERSION.id, publishedAt, publishedById: AUTHOR });
    expect(attempt).toEqual({
      thesisId: THESIS.id,
      versionId: VERSION.id,
      rationale: RATIONALE,
      assessment: OUTPUT,
      verdict: 'SUPPORTS',
      outcome: 'PUBLISHED',
      refusedBy: [],
      researcherId: AUTHOR,
      createdAt: publishedAt,
    });
    expect(out).toEqual({
      thesisId: THESIS.id,
      publishedVersionId: VERSION.id,
      contentHash: VERSION.contentHash,
      publishedAt: (publishedAt as Date).toISOString(),
      overObjection: false,
      opened: [URL],
    });
    expect(store.thesis).toMatchObject({ publishedVersionId: VERSION.id, publishedById: AUTHOR, publicInterestStatement: STATEMENT });
    expect(tripped).toEqual([]);
  });

  it.each([
    ['DISPUTES — published over the objection', output({ verdict: 'DISPUTES', objection: 'אי-התאמה' }), true, 'DISPUTES'],
    ['SUPPORTS', output(), false, 'SUPPORTS'],
    ['only check 17 FAILS — advisory, never an objection and never a refusal', output({ allegationsFramed: false, allegationsNote: 'המשרד הסתיר' }), false, 'SUPPORTS'],
  ])('overObjection on %s', async (_title, assessed, overObjection, verdict) => {
    await seedReady();
    jest.spyOn(publicationAssessor, 'assess').mockResolvedValue(assessed);
    const out = await publish();
    expect(out).toMatchObject({ publishedVersionId: VERSION.id, overObjection });
    expect(attempts()).toEqual([expect.objectContaining({ outcome: 'PUBLISHED', refusedBy: [], verdict, assessment: assessed })]);
  });

  it('a BLANK public-interest statement is NOT GIVEN — no thesis.update, and the stored statement is kept (the ruling on R49 chunk 3, M3)', async () => {
    await seedReady({ statement: STATEMENT });
    jest.spyOn(publicationAssessor, 'assess').mockResolvedValue(output());

    expect(await publish({ publicInterestStatement: ' ' })).toMatchObject({ publishedVersionId: VERSION.id });
    expect(written.map((w) => `${w.model}.${w.op}`)).toEqual(['thesis.updateMany', 'publicationAttempt.create']);
    expect(store.thesis).toMatchObject({ publicInterestStatement: STATEMENT });
  });

  it('`opened` is [] when a version EVER published — another thesis, earlier — already opened the page', async () => {
    await seedReady();
    store.mentions = [...store.mentions, { ...mentionRow(MENTION, true), id: 'mention-elsewhere', versionId: 'version-elsewhere' }];
    store.attempts = [{ ...ATTEMPT, id: 'attempt-elsewhere', thesisId: 'thesis-elsewhere', versionId: 'version-elsewhere' }];
    jest.spyOn(publicationAssessor, 'assess').mockResolvedValue(output());
    expect(await publish()).toMatchObject({ publishedVersionId: VERSION.id, opened: [] });
  });

  it('a thesis with NO head THROWS before any write or draw (D3)', async () => {
    seedThesis({ headVersionId: null });
    const draw = jest.spyOn(publicationAssessor, 'assess');
    await expect(publish({ publicInterestStatement: STATEMENT })).rejects.toThrow(/no head version/);
    expect([draw.mock.calls.length, written, tripped]).toEqual([0, [], []]);
  });
});

describe('publish_thesis — NOT_PUBLISHABLE: the attempt recorded, refused, the pin untouched (A4 :1513; §12 :1141)', () => {
  it('the gate refusing → ONE REFUSED attempt through the transaction, `refusedBy` the HARD ids in A6 order (never 17), no pin — the error naming each subject', async () => {
    await seedReady({ gaps: [gap(1, 'OPEN')] });
    const NAME = 'ישראל ישראלי';
    const assessed = output({ names: [{ name: NAME, where: 'TEXT', quote: `${NAME} הורה` }], allegationsFramed: false, allegationsNote: 'x' });
    jest.spyOn(publicationAssessor, 'assess').mockResolvedValue(assessed);

    const out = await publish();

    expect(out).toEqual({ code: 'NOT_PUBLISHABLE', error: expect.any(String) as unknown });
    const error = String(out['error']);
    expect([error.includes('GAPS_DECIDED'), error.includes(gap(1, 'OPEN').gapId), error.includes('NAMES_NO_PERSON'), error.includes(NAME)]).toEqual([
      true,
      true,
      true,
      true,
    ]);
    // THE POINTER TO THE GATE (L2): the refusal sends the researcher to the read that shows every check.
    expect(error).toContain('check_publication_readiness');
    expect(written.map((w) => `${w.model}.${w.op}`)).toEqual(['publicationAttempt.create']);
    expect([writtenViaTx, windows, rolledBack]).toEqual([written, [WRITE_TRANSACTION], []]);
    expect(attempts()).toEqual([
      expect.objectContaining({ outcome: 'REFUSED', refusedBy: ['GAPS_DECIDED', 'NAMES_NO_PERSON'], verdict: 'SUPPORTS', assessment: assessed }),
    ]);
    expect(store.thesis).toMatchObject({ publishedVersionId: null, publishedAt: null, publishedById: null });
  });

  it('a DISPUTES assessment that names a person → REFUSED, and the assessment stored VERBATIM — the objection AND the names the researcher must answer', async () => {
    await seedReady();
    const NAME = 'ישראל ישראלי';
    const assessed = output({
      verdict: 'DISPUTES',
      objection: 'הנימוק מסייג את מה שהטקסט קובע כעובדה',
      names: [{ name: NAME, where: 'TEXT', quote: `${NAME} הורה` }],
    });
    jest.spyOn(publicationAssessor, 'assess').mockResolvedValue(assessed);

    expect(await publish()).toMatchObject({ code: 'NOT_PUBLISHABLE' });
    expect(attempts()).toEqual([
      expect.objectContaining({ outcome: 'REFUSED', refusedBy: ['NAMES_NO_PERSON'], verdict: 'DISPUTES', assessment: assessed }),
    ]);
  });

  it('a person named ONLY in a CALL item fails check 16 — the assessor is handed the appeals that would publish (ruling Q1 (b))', async () => {
    const NAME = 'משה כהן';
    const callItem = { whatIsNeeded: 'מצגת הנתונים', whoWouldHaveSeenIt: NAME, unit: 'אגף האפידמיולוגיה', window: '2021' };
    await seedReady({ gaps: [gap(1, 'CALLED', { callItem })] });
    // THE STUB READS WHAT IT IS HANDED: a name is found only where the material carries it.
    jest.spyOn(publicationAssessor, 'assess').mockImplementation((material) =>
      Promise.resolve(
        output({ names: JSON.stringify(material.call).includes(NAME) ? [{ name: NAME, where: 'CALL', quote: NAME }] : [] }),
      ),
    );

    const out = await publish();

    expect(out).toMatchObject({ code: 'NOT_PUBLISHABLE' });
    expect(attempts()).toEqual([expect.objectContaining({ outcome: 'REFUSED', refusedBy: ['NAMES_NO_PERSON'] })]);
  });

  it('an evidence half that cannot be graded → REFUSED with `refusedBy: []`, the error naming the ungraded citation (D9)', async () => {
    await seedReady();
    jest.spyOn(evidencePredicates, 'publishableEvidence').mockResolvedValue(EVIDENCE_NOT_EVALUABLE);
    jest.spyOn(publicationAssessor, 'assess').mockResolvedValue(output());
    const out = await publish();
    expect(out).toMatchObject({ code: 'NOT_PUBLISHABLE' });
    expect(String(out['error'])).toContain(DOCUMENT_EXAMINED.fileHash);
    expect(attempts()).toEqual([expect.objectContaining({ outcome: 'REFUSED', refusedBy: [] })]);
  });

  it('the assessor THROWING → no attempt and no pin; the statement written before the draw stays (D4)', async () => {
    await seedReady({ statement: null });
    jest.spyOn(publicationAssessor, 'assess').mockRejectedValue(new Error('the provider failed'));
    await expect(publish({ publicInterestStatement: STATEMENT })).rejects.toThrow('the provider failed');
    expect(written.map((w) => `${w.model}.${w.op}`)).toEqual(['thesis.update']);
    expect(store.thesis).toMatchObject({ publicInterestStatement: STATEMENT, publishedVersionId: null });
  });
});

describe('publish_thesis — THE RACE: the compare-and-set loses, and the refused attempt still commits (R10, §9-4 (c))', () => {
  it.each([
    ['the head MOVED to another version', { headVersionId: NEXT_VERSION.id }, NEXT_VERSION.id, null],
    ['the pin already SET by another call', { publishedVersionId: VERSION.id, publishedAt: new Date(), publishedById: AUTHOR }, 'already published', VERSION.id],
  ])('%s → ONE REFUSED attempt `HEAD_VERSION`, committed through the one transaction; the pin as the other call left it', async (_title, moved: Row, named, pinAfter) => {
    await seedReady();
    const draw = jest.spyOn(publicationAssessor, 'assess').mockResolvedValue(output());
    // ANOTHER CALL COMMITS in the instant between this call's evaluation and its transaction.
    db.$transaction.mockImplementationOnce((fn: unknown, options?: unknown) => {
      moveThesis(moved);
      return defaultTransaction(fn, options);
    });

    const out = await publish();

    expect(out).toEqual({ code: 'NOT_PUBLISHABLE', error: expect.stringContaining(named) as unknown });
    expect(draw).toHaveBeenCalledTimes(1);
    expect(written.map((w) => `${w.model}.${w.op}`)).toEqual(['publicationAttempt.create']);
    expect([writtenViaTx, windows, rolledBack]).toEqual([written, [WRITE_TRANSACTION], []]);
    expect(attempts()).toEqual([expect.objectContaining({ outcome: 'REFUSED', refusedBy: ['HEAD_VERSION'], verdict: 'SUPPORTS' })]);
    expect(store.thesis?.['publishedVersionId']).toBe(pinAfter);
  });
});

describe('publish_thesis — a version named by a Withdrawal is not published again (R16, the researcher\'s M1 (a))', () => {
  it('publish → unpublish → publish the SAME head → NOT_PUBLISHABLE "withdrawn", ONE more REFUSED attempt `HEAD_VERSION`; the pin stays null; readiness reports check 1 FAIL and writes nothing', async () => {
    await seedReady();
    jest.spyOn(publicationAssessor, 'assess').mockResolvedValue(output());

    expect(await publish()).toMatchObject({ publishedVersionId: VERSION.id });
    actAs(AUTHOR);
    expect(JSON.parse(await unpublishThesisHandler({ thesisId: THESIS.id, reason: 'נמצאה טעות' }))).toMatchObject({ withdrawnVersionId: VERSION.id });
    expect(store.withdrawals).toEqual([expect.objectContaining({ versionId: VERSION.id })]);
    forgetTheFirstCall();

    const out = await publish();

    expect(out).toEqual({ code: 'NOT_PUBLISHABLE', error: expect.stringContaining('withdrawn') as unknown });
    expect(written.map((w) => `${w.model}.${w.op}`)).toEqual(['publicationAttempt.create']);
    expect(attempts()).toEqual([expect.objectContaining({ outcome: 'REFUSED', refusedBy: ['HEAD_VERSION'] })]);
    expect(store.attempts.map((a) => a['outcome'])).toEqual(['PUBLISHED', 'REFUSED']);
    expect(store.thesis).toMatchObject({ publishedVersionId: null, publishedAt: null, publishedById: null });

    forgetTheFirstCall();
    const readiness = JSON.parse(await checkPublicationReadinessHandler({ thesisId: THESIS.id })) as { checks: { id: string; verdict: string }[] };
    expect(readiness.checks.find((row) => row.id === 'HEAD_VERSION')?.verdict).toBe('FAIL');
    expect(written).toEqual([]);
  });
});
