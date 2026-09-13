import { Prisma } from '@prisma/client';

// THE SHARED PRISMA DOUBLE, reached by `require` inside the factory — Jest hoists
// `jest.mock` above the `require` an `import` compiles to, so an imported binding
// is still unassigned when the factory runs.
jest.mock('../src/lib/prisma', () => ({
  prisma: (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).db,
}));

const mockResearcherId = jest.fn<string | null, []>();
jest.mock('../src/context/researcherContext', () => ({ getResearcherId: mockResearcherId }));

import { DIFF_VERSION } from '../src/lib/diffVersion';
import { flagged } from '../src/services/evidencePredicates';
import { requireFields, reviewEvidence } from '../src/services/reviewEvidence';
import { reviewEvidenceHandler } from '../src/mcp/tools/reviewEvidence';
import { db, resetDouble, store, windows, written, writtenViaTx, type Row } from './helpers/evidenceDouble';
import { AFTER, BEFORE, CAPTURE_NAME, DIFF_NAME } from './helpers/corpusFixture';

// ---------------------------------------------------------------------------
// `review_evidence` — evidence step 14, docs/gf-evidence-flows.md §6 (Flow E3),
// §9 and A4.
//
// ITS OWN FILE, BY MODULE. `test/reviews.test.ts` holds the containment rule and
// the LIST; this holds the WRITE. Ruled at round 1: one file through §7.3, split
// past ~1,200 lines by module rather than by section.
//
// FIXTURES, AND THEY STAND IN FOR A STAGING EXERCISE THAT CANNOT HAPPEN (§0a):
// no act in this tree creates a thesis, so nothing can be promoted, so no
// `Evidence` row exists on staging for a review to act on. The plan's "both
// decisions exercised" is OWED to thesis step 20 and recorded so, never faked.
//
// NO MODEL IS MOCKED, BECAUSE THERE IS NONE. A review is a judgement no pass may
// make: nothing here calls a model and no zod-validated model output is written.
// ---------------------------------------------------------------------------

const RESEARCHER = 'researcher-1';
const AFFIRMED = 'content-affirmed';
const CURRENT = 'content-current';

const provenance = (over: Row = {}): Row => ({
  contentVersionHash: CURRENT,
  beforeTextHash: BEFORE.textHash,
  afterTextHash: AFTER.textHash,
  diffVersion: DIFF_VERSION,
  ...over,
});

/**
 * A promoted DIFF row whose CURRENT has moved off what a human affirmed — the
 * shape BOTH `reviewEvidence`'s select and `flagged`'s read from `store.evidence`.
 */
const promoted = (over: Row = {}): Row => ({
  fileHash: DIFF_NAME,
  kind: 'DIFF',
  status: 'PROMOTED',
  affirmedContentVersionHash: AFFIRMED,
  snapshot: null,
  urlVersionDiff: {
    beforeSnapshot: { textHash: BEFORE.textHash, textExtractionVersion: 'v3-extractor' },
    afterSnapshot: { textHash: AFTER.textHash, textExtractionVersion: 'v3-extractor' },
    contentVersions: [
      provenance({ contentVersionHash: AFFIRMED, beforeTextHash: 'text-before-v2' }),
      provenance(),
    ],
  },
  ...over,
});

const review = (over: Partial<{ fileHash: string; decision: 'REAFFIRM' | 'WITHDRAW'; reason: string; expectedSequence: number }> = {}) =>
  reviewEvidence(
    {
      fileHash: over.fileHash ?? DIFF_NAME,
      decision: over.decision ?? 'REAFFIRM',
      ...(over.reason === undefined ? {} : { reason: over.reason }),
      expectedSequence: over.expectedSequence ?? 0,
    },
    RESEARCHER,
  );

/** A P2002 whose `meta.target` names the constraint given. */
const collision = (target: string[]): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: 'x',
    meta: { target },
  });

/** The refusal's code, or undefined when the call succeeded — one narrowing, spelled once. */
const codeOf = (result: Awaited<ReturnType<typeof reviewEvidence>>): string | undefined =>
  'code' in result ? result.code : undefined;

/** The refusal's message, or '' when the call succeeded. */
const errorOf = (result: Awaited<ReturnType<typeof reviewEvidence>>): string =>
  'error' in result ? result.error : '';

const statusOf = (r: Awaited<ReturnType<typeof reviewEvidence>>): string | undefined =>
  'status' in r ? r.status : undefined;
const affirmedOf = (r: Awaited<ReturnType<typeof reviewEvidence>>): string | undefined =>
  'affirmedContentVersionHash' in r ? r.affirmedContentVersionHash : undefined;
const sequenceOf = (r: Awaited<ReturnType<typeof reviewEvidence>>): number | undefined =>
  'decisionSequence' in r ? r.decisionSequence : undefined;

const models = (): string[] => written.map((w) => `${w.model}.${w.op}`);
const decisionWritten = (): Row | undefined =>
  written.find((w) => w.model === 'evidenceDecision')?.data;

beforeEach(() => {
  jest.clearAllMocks();
  resetDouble();
  mockResearcherId.mockReturnValue(RESEARCHER);
  store.evidence = promoted();
  store.captures = [BEFORE, AFTER];
});

describe('review_evidence — the refusals, in the contract’s order', () => {
  // NO_RESEARCHER is the TOOL's, answered from memory before any query, and is
  // held in the tool's own cases: this service is handed a researcher id, so it
  // has no anonymous state to be in.

  it('REASON_REQUIRED on a blank WITHDRAW — and BEFORE ANY QUERY', async () => {
    const refused = await review({ decision: 'WITHDRAW', reason: '   ' });
    expect(codeOf(refused)).toBe('REASON_REQUIRED');
    // Second in the order because it needs no query at all.
    expect(db.evidence.findUnique).not.toHaveBeenCalled();
  });

  it('REASON_REQUIRED on a WITHDRAW with no reason at all', async () => {
    const refused = await review({ decision: 'WITHDRAW' });
    expect(codeOf(refused)).toBe('REASON_REQUIRED');
  });

  it('NOT_A_RECORD — the name resolves to nothing THE CORPUS holds', async () => {
    store.evidence = null;
    store.captures = [];
    store.diffs = [];
    const refused = await review({ fileHash: '0xnothing' });
    expect(codeOf(refused)).toBe('NOT_A_RECORD');
  });

  it('THE COMPUTED CORPUS PASS RUNS ONLY ON THAT FAILURE PATH', async () => {
    // A name WITH an evidence row is one indexed lookup; only a name without one
    // costs a pass over every record the corpus holds.
    await review();
    expect(db.trackedUrl.findMany).not.toHaveBeenCalled();
  });

  it('NOT_PROMOTED for a corpus record nobody promoted, and the message says WHICH', async () => {
    store.evidence = null;
    store.captures = [BEFORE, AFTER];
    store.diffs = [];
    const refused = await review({ fileHash: CAPTURE_NAME });
    expect(codeOf(refused)).toBe('NOT_PROMOTED');
    expect(errorOf(refused)).toContain('nobody has promoted');
  });

  it('NOT_PROMOTED for a WITHDRAWN row, and the message says WHICH — nothing moves it back', async () => {
    store.evidence = promoted({ status: 'WITHDRAWN' });
    const refused = await review();
    expect(codeOf(refused)).toBe('NOT_PROMOTED');
    expect(errorOf(refused)).toContain('was withdrawn');
    expect(written).toEqual([]);
  });

  it('AWAITING_DERIVATION on REAFFIRM — a human is not asked to judge a version that does not exist', async () => {
    store.evidence = promoted({
      urlVersionDiff: {
        beforeSnapshot: { textHash: BEFORE.textHash, textExtractionVersion: 'v3-extractor' },
        afterSnapshot: { textHash: AFTER.textHash, textExtractionVersion: 'v3-extractor' },
        contentVersions: [provenance({ contentVersionHash: AFFIRMED, beforeTextHash: 'text-before-v2' })],
      },
    });
    expect(codeOf(await review())).toBe('AWAITING_DERIVATION');
  });

  it('AWAITING_DERIVATION on WITHDRAW TOO — A4 lists it UNSCOPED', async () => {
    store.evidence = promoted({
      urlVersionDiff: {
        beforeSnapshot: { textHash: BEFORE.textHash, textExtractionVersion: 'v3-extractor' },
        afterSnapshot: { textHash: AFTER.textHash, textExtractionVersion: 'v3-extractor' },
        contentVersions: [provenance({ contentVersionHash: AFFIRMED, beforeTextHash: 'text-before-v2' })],
      },
    });
    const refused = await review({ decision: 'WITHDRAW', reason: 'it never supported the claim' });
    expect(codeOf(refused)).toBe('AWAITING_DERIVATION');
  });

  it('a DOCUMENT row refuses THE SAME CODE — one state, one word, on both surfaces', async () => {
    store.evidence = { fileHash: '0xcommitment', kind: 'DOCUMENT', status: 'PROMOTED', affirmedContentVersionHash: 'x', snapshot: null, urlVersionDiff: null };
    const refused = await review({ fileHash: '0xcommitment' });
    expect(codeOf(refused)).toBe('AWAITING_DERIVATION');
    expect(errorOf(refused)).toContain('step 28');
  });

  it('NOTHING_TO_REVIEW on REAFFIRM when affirmed IS current — through the PREDICATE', async () => {
    store.evidence = promoted({ affirmedContentVersionHash: CURRENT });
    const refused = await review();
    expect(codeOf(refused)).toBe('NOTHING_TO_REVIEW');
    expect(written).toEqual([]);
  });

  it('A WITHDRAW OF A CURRENT RECORD IS ALLOWED — §6, verbatim', async () => {
    // "NOTHING_TO_REVIEW (REAFFIRM only)": a researcher may decide the record
    // never supported the claim, whatever its content says now.
    store.evidence = promoted({ affirmedContentVersionHash: CURRENT });
    const done = await review({ decision: 'WITHDRAW', reason: 'it never supported the passage' });
    expect(statusOf(done)).toBe('WITHDRAWN');
  });
});

describe('review_evidence — STALE_SEQUENCE, both halves', () => {
  it('HALF A: a stale expected number refuses, and NOTHING IS WRITTEN', async () => {
    store.decisions = [{ fileHash: DIFF_NAME, sequence: 3 }];
    const refused = await review({ expectedSequence: 1 });
    expect(codeOf(refused)).toBe('STALE_SEQUENCE');
    expect(errorOf(refused)).toContain('sequence 3');
    expect(written).toEqual([]);
  });

  it('A NUMBER HIGHER THAN THE TRUTH REFUSES, AND OPENS NO GAP', async () => {
    // `last + 1` is computed from the READ, never from `expectedSequence` — so
    // even a caller who guessed past the end cannot leave a hole in the log.
    store.decisions = [{ fileHash: DIFF_NAME, sequence: 1 }];
    const refused = await review({ expectedSequence: 9 });
    expect(codeOf(refused)).toBe('STALE_SEQUENCE');
    expect(store.decisions.map((d) => d['sequence'])).toEqual([1]);
  });

  it('HALF B: the RACE — P2002 on this constraint becomes STALE_SEQUENCE', async () => {
    // Two callers who both read the same `last` both insert `last + 1`; the loser
    // meets the unique index, which is the only place the race is visible.
    store.collideOnDecisionCreate = collision(['EvidenceDecision_fileHash_sequence_key']);
    const refused = await review();
    expect(codeOf(refused)).toBe('STALE_SEQUENCE');
    // The transaction rolled back whole: the update never ran.
    expect(models()).not.toContain('evidence.update');
    // AND THE MESSAGE DOES NOT NAME A SEQUENCE: the value this caller read is the
    // one the race invalidated, so where the log is now is a re-read away.
    expect(errorOf(refused)).toContain('not known until you read again');
    expect(errorOf(refused)).not.toMatch(/is at sequence/);
  });

  it('HALF B reads meta.target as a FIELD LIST too, not only as a constraint name', async () => {
    store.collideOnDecisionCreate = collision(['fileHash', 'sequence']);
    expect(codeOf(await review())).toBe('STALE_SEQUENCE');
  });

  it('A P2002 FROM ANOTHER CONSTRAINT PROPAGATES — the code alone is not this one', async () => {
    // P2002 is *a* unique violation, not *this* one. Swallowing another
    // constraint's into "the log moved" would be a wrong answer built out of a
    // right catch.
    store.collideOnDecisionCreate = collision(['Evidence_snapshotId_key']);
    await expect(review()).rejects.toMatchObject({ code: 'P2002' });
  });

  it('a P2002 naming only ONE of the two columns is NOT this constraint', async () => {
    store.collideOnDecisionCreate = collision(['fileHash']);
    await expect(review()).rejects.toMatchObject({ code: 'P2002' });
  });
});

describe('review_evidence — REAFFIRM writes two rows, in ONE transaction, and nothing else', () => {
  it('the decision and the update, under the shared window, and NOTHING ELSE', async () => {
    const done = await review();
    expect(models()).toEqual(['evidenceDecision.create', 'evidence.update']);
    expect(windows).toEqual([{ maxWait: 10_000, timeout: 60_000 }]);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(sequenceOf(done)).toBe(1);
  });

  it('BOTH ROWS GO THROUGH THE TRANSACTION’S OWN CLIENT, in order', async () => {
    // "ONE transaction" is §3b's central clause and nothing held it: a double
    // that hands the SAME client to the callback cannot tell `tx.evidence.update`
    // from `prisma.evidence.update`. The double now hands a DISTINCT client, and
    // this is what a write beside the transaction would fail.
    await review();
    expect(writtenViaTx.map((w) => `${w.model}.${w.op}`)).toEqual([
      'evidenceDecision.create',
      'evidence.update',
    ]);
    // And nothing was written outside it.
    expect(writtenViaTx).toEqual(written);
  });

  it('a WITHDRAW’s two rows go through it too', async () => {
    await review({ decision: 'WITHDRAW', reason: 'the passage is gone' });
    expect(writtenViaTx.map((w) => w.model)).toEqual(['evidenceDecision', 'evidence']);
  });

  it('THE DECISION NAMES BOTH HASHES — what was stood behind AND what replaced it', async () => {
    await review();
    expect(decisionWritten()).toMatchObject({
      fileHash: DIFF_NAME,
      sequence: 1,
      type: 'REAFFIRM',
      researcherId: RESEARCHER,
      fromVersionHash: AFFIRMED,
      toVersionHash: CURRENT,
    });
  });

  it('`affirmed` moves to CURRENT and `status` is UNTOUCHED', async () => {
    const done = await review();
    const update = written.find((w) => w.model === 'evidence')?.data;
    expect(update).toEqual({ affirmedContentVersionHash: CURRENT });
    expect(affirmedOf(done)).toBe(CURRENT);
    expect(statusOf(done)).toBe('PROMOTED');
  });

  it('numbers the decision after the LAST one, never after the expected one', async () => {
    store.decisions = [{ fileHash: DIFF_NAME, sequence: 4 }];
    const done = await review({ expectedSequence: 4 });
    expect(decisionWritten()?.['sequence']).toBe(5);
    expect(sequenceOf(done)).toBe(5);
  });

  it('NO CITATION IS RE-PINNED — no ThesisMention write, ever', async () => {
    // §6: the citations are NOT re-pinned by this act. Re-pinning is the thesis
    // flows' act, done by the thesis's author, WHO MAY NOT BE THE REVIEWER.
    await review();
    expect(models().some((m) => m.startsWith('thesisMention'))).toBe(false);
  });

  it('NO DEBATE, NO VERSION, NO CHAIN — only the two evidence tables are touched', async () => {
    await review();
    expect([...new Set(written.map((w) => w.model))].sort()).toEqual(['evidence', 'evidenceDecision']);
  });
});

describe('review_evidence — WITHDRAW keeps everything and moves one thing', () => {
  const withdraw = () => review({ decision: 'WITHDRAW', reason: 'the new version drops the passage' });

  it('writes the reason, and the decision names NO version hash', async () => {
    await withdraw();
    const decision = decisionWritten();
    expect(decision).toMatchObject({ type: 'WITHDRAW', reason: 'the new version drops the passage' });
    // "A `toVersionHash` on a withdrawal would assert a version somebody stood
    // behind."
    expect(decision?.['toVersionHash']).toBeUndefined();
    expect(decision?.['fromVersionHash']).toBeUndefined();
  });

  it('moves `status` and DOES NOT MOVE `affirmed` — and the return says so', async () => {
    const done = await withdraw();
    expect(written.find((w) => w.model === 'evidence')?.data).toEqual({ status: 'WITHDRAWN' });
    expect(statusOf(done)).toBe('WITHDRAWN');
    expect(affirmedOf(done)).toBe(AFFIRMED);
  });

  it('THE RETURN READS THE UPDATE’S OWN SELECT, never a second read', async () => {
    // A re-read could answer from a row someone else moved between the two.
    await withdraw();
    expect(db.evidence.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe('review_evidence — ANY researcher reviews ANY record', () => {
  it('a SECOND researcher may review — there is no NOT_AUTHOR here', async () => {
    // §6 :536: re-pinning is "the thesis flows' act, done by the thesis's author,
    // WHO MAY NOT BE THE REVIEWER". A review writes no thesis row.
    const done = await reviewEvidence(
      { fileHash: DIFF_NAME, decision: 'REAFFIRM', expectedSequence: 0 },
      'someone-else',
    );
    expect('decisionSequence' in done).toBe(true);
    expect(decisionWritten()?.['researcherId']).toBe('someone-else');
  });

  it('the reviewer need not be `promotedById`', async () => {
    store.evidence = promoted({ promotedById: 'the-promoter' });
    const done = await reviewEvidence(
      { fileHash: DIFF_NAME, decision: 'WITHDRAW', reason: 'superseded by the narrower records', expectedSequence: 0 },
      'a-colleague',
    );
    expect(statusOf(done)).toBe('WITHDRAWN');
  });
});

describe('the writer’s guard — a defect in the caller, never a refusal', () => {
  it('fires on a REAFFIRM with no version hash, through the public path', async () => {
    // A malformed row whose affirmed hash is blank: A2 makes both hashes REQUIRED
    // on a REAFFIRM and the database CHECK enforces it — this is the same rule on
    // the caller's side, BEFORE the first insert.
    store.evidence = promoted({ affirmedContentVersionHash: '' });
    await expect(review()).rejects.toThrow(/REAFFIRM decision requires fromVersionHash/);
    expect(written).toEqual([]);
  });

  it('fires on a WITHDRAW with no reason — the arm REASON_REQUIRED stands in front of', () => {
    expect(() =>
      requireFields({ fileHash: DIFF_NAME, sequence: 1, type: 'WITHDRAW', researcherId: RESEARCHER }),
    ).toThrow(/WITHDRAW decision requires reason/);
  });

  it('a blank string is not supplied — as `pageLog` spells it', () => {
    expect(() =>
      requireFields({ fileHash: DIFF_NAME, sequence: 1, type: 'WITHDRAW', researcherId: RESEARCHER, reason: '  ' }),
    ).toThrow(/requires reason/);
  });

  it('passes a whole decision of either type', () => {
    expect(() =>
      requireFields({ fileHash: DIFF_NAME, sequence: 1, type: 'REAFFIRM', researcherId: RESEARCHER, fromVersionHash: 'a', toVersionHash: 'b' }),
    ).not.toThrow();
    expect(() =>
      requireFields({ fileHash: DIFF_NAME, sequence: 1, type: 'WITHDRAW', researcherId: RESEARCHER, reason: 'why' }),
    ).not.toThrow();
  });
});

describe('THE FLAGGED CASE — a WITHDRAW is what flags a published citation', () => {
  it('after a WITHDRAW, `flagged` reports WITHDRAWN — and NOTHING was written to the mention', async () => {
    // §6: "every thesis whose head or published version mentions it is FLAGGED".
    // DERIVED ON READ by the step-12 predicate, never written here: "a platform
    // that silently unpublished would be rewriting its public record; one that
    // stayed silent would be misleading its readers."
    store.mention = {
      name: DIFF_NAME,
      contentVersionHash: AFFIRMED,
      thesisVersion: { isPublished: { id: 'thesis-1' } },
    };

    const before = await flagged('mention-1');
    expect(before.reasons).not.toContain('WITHDRAWN');

    await review({ decision: 'WITHDRAW', reason: 'the current version no longer supports it' });

    const after = await flagged('mention-1');
    expect(after.flagged).toBe(true);
    expect(after.reasons).toContain('WITHDRAWN');
    // THE CITATION ITSELF IS UNTOUCHED: the mention still pins the old version,
    // and the researcher re-pins by issuing a new thesis version.
    expect(models().some((m) => m.startsWith('thesisMention'))).toBe(false);
    expect(store.mention['contentVersionHash']).toBe(AFFIRMED);
  });

  it('the two arms this tree can evaluate are named in every answer, SHED absent', async () => {
    store.mention = {
      name: DIFF_NAME,
      contentVersionHash: AFFIRMED,
      thesisVersion: { isPublished: { id: 'thesis-1' } },
    };
    const report = await flagged('mention-1');
    expect(report.armsEvaluated).toEqual(['WITHDRAWN', 'NOT_CITATION_CURRENT']);
  });
});


describe('review_evidence — the tool: attributed, from memory, before any query', () => {
  const parse = (json: string): Row => JSON.parse(json) as Row;

  it('NO_RESEARCHER FIRST, AND NOTHING IS READ', async () => {
    mockResearcherId.mockReturnValue(null);
    const refused = parse(
      await reviewEvidenceHandler({ fileHash: DIFF_NAME, decision: 'REAFFIRM', expectedSequence: 0 }),
    );
    expect(refused['code']).toBe('NO_RESEARCHER');
    expect(db.evidence.findUnique).not.toHaveBeenCalled();
    expect(written).toEqual([]);
  });

  it('ATTRIBUTES THE DECISION TO THE CALLER IN CONTEXT, never to a parameter', async () => {
    // The researcher is never an input: it comes from the MCP context, which is
    // what makes every decision on the log attributable.
    mockResearcherId.mockReturnValue('a-colleague');
    const done = parse(
      await reviewEvidenceHandler({ fileHash: DIFF_NAME, decision: 'REAFFIRM', expectedSequence: 0 }),
    );
    expect(done['decisionSequence']).toBe(1);
    expect(decisionWritten()?.['researcherId']).toBe('a-colleague');
  });

  it('carries a refusal through as { error, code }, never as a throw', async () => {
    const refused = parse(
      await reviewEvidenceHandler({ fileHash: DIFF_NAME, decision: 'WITHDRAW', reason: ' ', expectedSequence: 0 }),
    );
    expect(refused['code']).toBe('REASON_REQUIRED');
    expect(typeof refused['error']).toBe('string');
  });
});
