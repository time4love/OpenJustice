jest.mock('../src/lib/prisma', () => (require('./document/world') as typeof import('./document/world')).prismaDouble);

import { decideOpening } from '../src/services/decideOpening';
import { openingsOf } from '../src/services/documentOpenings';
import { db, resetWorld, store, writes } from './document/world';

// ---------------------------------------------------------------------------
// DOCUMENT STEP 34, CHUNK 2 — THE OPENINGS. docs/gf-document-flows.md §7 :791–:801, A3 :1377–:1380 as CONFORMED 2026-09-26
// (the researcher, R84 Q2 and Q9), A4 :1443–:1446; plan step 34 :266–:268.
//
// `test/document/opening.test.ts` holds the PURE rule (the widest, the latest per thesis); this file holds what the
// LOADER decides before the rule is asked — which theses count (a version of them EVER published cites d) and which
// decisions are IN FORCE (made before that thesis's newest publication) — and `decide_opening`'s arms the contract file
// does not exercise. Over the document suite's own world (`test/document/world.ts`), which throws on any query shape it
// does not model.
// ---------------------------------------------------------------------------

const DOC = '0x' + 'c1'.repeat(32);
const SIBLING = '0x' + 'c2'.repeat(32);
const at = (day: number): Date => new Date(Date.UTC(2026, 8, day));

/** th_1's head `v1` cites DOC; nothing is published and nothing decided. */
function seed(): void {
  store.theses.push({ id: 'th_1', createdById: 'res_1', headVersionId: 'v1' });
  store.documents.push({ docId: '0x' + 'd1'.repeat(32), commitment: DOC, salt: Buffer.alloc(32), cid: null, bytes: '0x' + 'd1'.repeat(32), mimeType: 'application/pdf', byteLength: 1 });
  store.mentions.push({ versionId: 'v1', kind: 'DOCUMENT', name: DOC, thesisVersion: { thesisId: 'th_1' } });
}

const decision = (thesisId: string, sequence: number, opening: string, day: number) => ({
  id: `d-${thesisId}-${String(sequence)}`,
  thesisId,
  commitment: DOC,
  sequence,
  opening,
  researcherId: 'res_1',
  createdAt: at(day),
});
const attempt = (thesisId: string, versionId: string, day: number, outcome: 'PUBLISHED' | 'REFUSED') => ({
  id: `a-${versionId}-${String(day)}-${outcome}`,
  thesisId,
  versionId,
  outcome,
  createdAt: at(day),
});
const published = (thesisId: string, versionId: string, day: number) => attempt(thesisId, versionId, day, 'PUBLISHED');
const openedNow = async (commitment = DOC) => (await openingsOf([commitment])).get(commitment);

beforeEach(() => {
  resetWorld();
  seed();
});

describe('the LOADER — which theses count, and which decisions are IN FORCE (A3 :1377–:1378 as conformed; A4 :1444)', () => {
  it('a decision on a thesis never published opens NOTHING — { opened: null, public: false }', async () => {
    store.openings.push(decision('th_1', 1, 'CONTENT', 20));
    expect(await openedNow()).toEqual({ opened: null, public: false });
  });

  it('IN FORCE FROM THE NEXT PUBLICATION: a decision made after the newest publication waits for the next one (N10)', async () => {
    store.openings.push(decision('th_1', 1, 'PASSAGE', 20));
    store.attempts.push(published('th_1', 'v1', 21));
    store.openings.push(decision('th_1', 2, 'CONTENT', 22));
    expect(await openedNow()).toEqual({ opened: 'PASSAGE', public: true });

    store.attempts.push(published('th_1', 'v1', 23));
    expect(await openedNow()).toEqual({ opened: 'CONTENT', public: true });
  });

  it('EVER published (Q2): the thesis unpublished — its pin cleared, a withdrawal on record — the opening STAYS; the loader reads no pin', async () => {
    store.openings.push(decision('th_1', 1, 'CONTENT', 20));
    store.attempts.push(published('th_1', 'v1', 21));
    // Unpublishing clears the pin and writes a Withdrawal (thesis T6); the PUBLISHED attempt is never removed, and
    // "ever published" is that attempt (thesis A3 :1402). The world holds no pin, so none can be read.
    store.theses[0] = { ...store.theses[0], publishedVersionId: null };
    expect(await openedNow()).toEqual({ opened: 'CONTENT', public: true });
  });

  it('a version that DROPS the citation closes nothing (§7 :797–:801): the ever-published version still cites d', async () => {
    store.openings.push(decision('th_1', 1, 'CONTENT', 20));
    store.attempts.push(published('th_1', 'v1', 21), published('th_1', 'v2', 22));
    expect(await openedNow()).toEqual({ opened: 'CONTENT', public: true });
  });

  it('two theses: the WIDER in force wins — and a thesis that cites d in no published version counts for nothing', async () => {
    store.theses.push({ id: 'th_2', createdById: 'res_2', headVersionId: 'w1' }, { id: 'th_3', createdById: 'res_3', headVersionId: 'x1' });
    store.mentions.push(
      { versionId: 'w1', kind: 'DOCUMENT', name: DOC, thesisVersion: { thesisId: 'th_2' } },
      { versionId: 'x1', kind: 'DOCUMENT', name: DOC, thesisVersion: { thesisId: 'th_3' } },
    );
    store.openings.push(decision('th_1', 1, 'PASSAGE', 20), decision('th_2', 1, 'CONTENT', 20), decision('th_3', 1, 'BYTES', 20));
    store.attempts.push(published('th_1', 'v1', 21), published('th_2', 'w1', 21));
    expect(await openedNow()).toEqual({ opened: 'CONTENT', public: true });
  });

  it('Q14 — in force at the next publication OF A VERSION CITING d: v2 DROPS d and is published, so BYTES decided before it is NOT in force; PASSAGE is (the T3 row)', async () => {
    store.openings.push(decision('th_1', 1, 'PASSAGE', 20));
    store.attempts.push(published('th_1', 'v1', 21));
    store.openings.push(decision('th_1', 2, 'BYTES', 22));
    // v2 is th_1's next version and does NOT cite DOC — no mention of it names DOC.
    store.theses[0] = { ...store.theses[0], headVersionId: 'v2' };
    store.attempts.push(published('th_1', 'v2', 23));
    expect(await openedNow()).toEqual({ opened: 'PASSAGE', public: true });
  });

  it('Q14, TWO DOCUMENTS IN ONE READ — a publication counts only for the document ITS version cites', async () => {
    store.openings.push(decision('th_1', 1, 'PASSAGE', 20));
    store.attempts.push(published('th_1', 'v1', 21));
    store.openings.push(decision('th_1', 2, 'BYTES', 22));
    // v2 cites the SIBLING only, and is published: it carried no mention of DOC, so it puts nothing of DOC in force.
    store.mentions.push({ versionId: 'v2', kind: 'DOCUMENT', name: SIBLING, thesisVersion: { thesisId: 'th_1' } });
    store.attempts.push(published('th_1', 'v2', 23));
    const both = await openingsOf([DOC, SIBLING]);
    expect([both.get(DOC), both.get(SIBLING)]).toEqual([{ opened: 'PASSAGE', public: true }, { opened: null, public: false }]);
  });

  it('M10 — a decision made after a PUBLISHED attempt and before a later REFUSED one is NOT in force: a refusal published nothing', async () => {
    store.openings.push(decision('th_1', 1, 'PASSAGE', 20));
    store.attempts.push(published('th_1', 'v1', 21));
    store.openings.push(decision('th_1', 2, 'CONTENT', 22));
    store.attempts.push(attempt('th_1', 'v1', 23, 'REFUSED'));
    expect(await openedNow()).toEqual({ opened: 'PASSAGE', public: true });
  });

  it('PER DOCUMENT: another document is not opened by this one (§7 :859–:860)', async () => {
    store.openings.push(decision('th_1', 1, 'BYTES', 20));
    store.attempts.push(published('th_1', 'v1', 21));
    expect(await openedNow(SIBLING)).toEqual({ opened: null, public: false });
  });
});

describe('decide_opening — the arms the contract file does not exercise (A4 :1443–:1446)', () => {
  const ask = (over: Partial<Parameters<typeof decideOpening>[0]> = {}, researcher: string | null = 'res_1') =>
    decideOpening({ thesisId: 'th_1', commitment: DOC, opening: 'CONTENT', expectedSequence: 0, ...over }, researcher);

  it('NO_RESEARCHER without an identity; NOT_AUTHOR for another researcher and for a thesis that does not exist — nothing written', async () => {
    expect(await ask({}, null)).toMatchObject({ code: 'NO_RESEARCHER' });
    expect(await ask({}, 'res_2')).toMatchObject({ code: 'NOT_AUTHOR' });
    expect(await ask({ thesisId: 'th_none' })).toMatchObject({ code: 'NOT_AUTHOR' });
    expect(writes).toEqual([]);
  });

  it('ONE windowed transaction, the decision written THROUGH it at last + 1, and it says it is in force from publish_thesis', async () => {
    const answer = await ask();
    expect(answer).toEqual({ thesisId: 'th_1', commitment: DOC, opening: 'CONTENT', sequence: 1, inForceFrom: 'publish_thesis' });
    expect(writes).toEqual([
      { via: 'global', op: '$transaction' },
      { via: 'transaction', op: 'documentOpeningDecision.create' },
    ]);
    expect(db.$transaction.mock.calls.at(0)?.[1]).toEqual({ maxWait: 10_000, timeout: 60_000 });
  });

  it('STALE_SEQUENCE — an expectedSequence the log is not at writes nothing; the next one is last + 1', async () => {
    await ask();
    writes.length = 0;
    expect(await ask({ opening: 'BYTES', expectedSequence: 0 })).toMatchObject({ code: 'STALE_SEQUENCE' });
    expect(await ask({ opening: 'BYTES', expectedSequence: 5 })).toMatchObject({ code: 'STALE_SEQUENCE' });
    expect(writes.filter((w) => w.op === 'documentOpeningDecision.create')).toEqual([]);
    expect(await ask({ opening: 'BYTES', expectedSequence: 1 })).toMatchObject({ sequence: 2 });
  });

  it('STALE_SEQUENCE on the RACE — the unique key (thesisId, commitment, sequence) raised by a concurrent write', async () => {
    // Another call wrote sequence 1 between this call's read and its insert: the read INSIDE the transaction saw an empty
    // log, so the compare-and-set passed and the INSERT met the key. The transaction's client is a distinct object
    // (the world's R76 rule), so it is that client's read which is made to see the empty log.
    const real = db.$transaction.getMockImplementation();
    if (real === undefined) throw new Error('the world models $transaction');
    db.$transaction.mockImplementationOnce((fn, options) =>
      real((tx: unknown) => {
        const client = tx as { documentOpeningDecision: Record<string, unknown> };
        return fn({ ...client, documentOpeningDecision: { ...client.documentOpeningDecision, findMany: () => Promise.resolve([]) } });
      }, options),
    );
    store.openings.push(decision('th_1', 1, 'PASSAGE', 20));
    expect(await ask()).toMatchObject({ code: 'STALE_SEQUENCE', error: expect.stringContaining('another decision was written at the same moment') });
  });

  it('M8 — NOT_CITED reads the HEAD: a PUBLISHED version cites d, the head does not — refused (A4 :1445)', async () => {
    store.attempts.push(published('th_1', 'v1', 21));
    store.theses[0] = { ...store.theses[0], headVersionId: 'v2' };
    expect(await ask()).toMatchObject({ code: 'NOT_CITED' });
    expect(writes).toEqual([]);
  });

  it('M9 — the SAME opening again after a publication is WRITTEN at sequence + 1, never CANNOT_NARROW: equal is not below (A4 :1446)', async () => {
    await ask({ opening: 'CONTENT' });
    store.attempts.push({ ...published('th_1', 'v1', 21), createdAt: new Date(Date.now() + 1000) });
    expect(await openedNow()).toEqual({ opened: 'CONTENT', public: true });
    expect(await ask({ opening: 'CONTENT', expectedSequence: 1 })).toMatchObject({ opening: 'CONTENT', sequence: 2 });
  });

  it('NARROWING BEFORE ANY PUBLICATION IS ALLOWED — OPENED(d) is undefined, so nothing is below it (the S3 reading of A4 :1446)', async () => {
    await ask({ opening: 'BYTES' });
    expect(await ask({ opening: 'PASSAGE', expectedSequence: 1 })).toMatchObject({ opening: 'PASSAGE', sequence: 2 });
  });
});
