jest.mock('../src/lib/prisma', () => (require('./document/world') as typeof import('./document/world')).prismaDouble);
jest.mock('../src/services/documentBucket', () => (require('./document/world') as typeof import('./document/world')).bucketDouble);
jest.mock('../src/factories/LLMFactory', () => (require('./document/world') as typeof import('./document/world')).llmDouble);

import { CURRENT_EXTRACTOR } from '../src/lib/documentExtractor';
import { readDocument } from '../src/services/readDocument';
import { resetWorld, seedArrival, seedDocument, seedResearcher, store } from './document/world';

// ---------------------------------------------------------------------------
// `read_document`'s `provenance.derivedUnder` IS UNCHANGED ON THE WIRE — document step 34 chunk 5-0.
//
// The researcher's Q-R1 (R86 Entry 4): "one row per derivation, (versionId, extractorVersion, at), at null only for rows
// derived before the table; derivedUnder dropped in the same migration". The COLUMN left; the wire field A4 :1426 names
// (`provenance: { extractor, extractorVersion, derivedUnder: string[], readFailed, derivedFrom, derivedAt }`) did not —
// SUPPRESSED by REVIEW (R86 Entry 4): the ruling changed storage and named no wire field. So the field is served from the
// rows, and these cases hold that a reader of `read_document` cannot tell the difference: the same keys in the same order,
// the same list in the same order, byte for byte — over the world the migration leaves behind (a first row at the
// version's `derivedAt`, a reproduction whose moment was never kept: NULL) and over one the writer makes from now on.
//
// IN THE GATING `unit` PROJECT, over the document world's double (`test/document/world.ts`), which holds the derivations
// as a TABLE of their own and returns them only when the loader includes them.
// ---------------------------------------------------------------------------

beforeAll(() => {
  // Each version's `textUrl` is signed with TOKEN_HMAC_SECRET on the public origin (A5 :1505) — readDocument.test's setup.
  process.env['TOKEN_HMAC_SECRET'] = 'token-hmac-secret-for-tests';
  process.env['FRONTEND_URL'] = 'https://gf.test';
});

const COMMITMENT = '0x' + 'c7'.repeat(32);
const DOC_ID = '0x' + 'd7'.repeat(32);
const OLDER = 'v1-an-older-extractor';
const DERIVED_AT = new Date(Date.UTC(2026, 8, 20, 9));

/** A held document with ONE version — derived under OLDER, reproduced under CURRENT_EXTRACTOR. */
function world(reproducedAt: Date | null, insertReversed = false): void {
  resetWorld();
  seedResearcher('res_1', 'researcher-one');
  seedDocument({ docId: DOC_ID, commitment: COMMITMENT, bytes: DOC_ID, mimeType: 'application/pdf', title: 'the circular' });
  seedArrival('res_1', COMMITMENT);
  store.versions.push({
    id: 'version-1',
    commitment: COMMITMENT,
    text: 'the circular’s text',
    contentVersionHash: '0x' + 'e7'.repeat(32),
    extractor: 'pdfjs',
    extractorVersion: OLDER,
    readFailed: false,
    derivedAt: DERIVED_AT,
    derivedFrom: 'AT_RECEIPT',
  });
  const first = { id: 'derivation-1', versionId: 'version-1', extractorVersion: OLDER, at: DERIVED_AT };
  const reproduced = { id: 'derivation-2', versionId: 'version-1', extractorVersion: CURRENT_EXTRACTOR, at: reproducedAt };
  // The table has no order of its own: a reader that served rows AS STORED would pass the first order and fail this one.
  store.derivations.push(...(insertReversed ? [reproduced, first] : [first, reproduced]));
}

/**
 * THE THREE-MEMBER WORLD (REVIEW's M1, R86 Entry 6): the producer at its `derivedAt`, a reproduction appended BEFORE the
 * table (its moment never kept — NULL, the migration's word), and a reproduction the writer recorded AFTER it, with its
 * moment. Reachable: every staging version the migration leaves with a NULL row gains a recorded one at the next
 * `CURRENT_EXTRACTOR` move. The column held them in the order they were appended — [producer, legacy, recorded].
 */
const LEGACY = 'v2-a-reproduction-before-the-table';

function threeMembers(insertReversed = false): void {
  world(null);
  store.derivations.length = 0;
  const rows = [
    { id: 'derivation-1', versionId: 'version-1', extractorVersion: OLDER, at: DERIVED_AT },
    { id: 'derivation-2', versionId: 'version-1', extractorVersion: LEGACY, at: null },
    { id: 'derivation-3', versionId: 'version-1', extractorVersion: CURRENT_EXTRACTOR, at: new Date(Date.UTC(2026, 8, 25, 12)) },
  ];
  store.derivations.push(...(insertReversed ? [...rows].reverse() : rows));
}

const THREE_AS_THE_COLUMN_SERVED = JSON.stringify({
  extractor: 'pdfjs',
  extractorVersion: OLDER,
  derivedUnder: [OLDER, LEGACY, CURRENT_EXTRACTOR],
  readFailed: false,
  derivedFrom: 'AT_RECEIPT',
  derivedAt: DERIVED_AT.toISOString(),
});

/** The provenance exactly as the `derivedUnder` column served it — keys in A4 :1426's order. */
const AS_THE_COLUMN_SERVED = JSON.stringify({
  extractor: 'pdfjs',
  extractorVersion: OLDER,
  derivedUnder: [OLDER, CURRENT_EXTRACTOR],
  readFailed: false,
  derivedFrom: 'AT_RECEIPT',
  derivedAt: DERIVED_AT.toISOString(),
});

async function provenance(): Promise<string> {
  const answer = await readDocument(COMMITMENT, 'res_1');
  if ('code' in answer) throw new Error(`read_document refused: ${answer.code}`);
  // THE FLOOR: one version, so the comparison below is over a served provenance and not over none.
  expect(answer.versions).toHaveLength(1);
  const served = answer.versions.at(0);
  if (served === undefined) throw new Error('read_document served no version');
  return JSON.stringify(served.provenance);
}

describe('read_document — `provenance.derivedUnder` served from the DocumentContentDerivation rows, byte-identical (A4 :1426)', () => {
  it('THE MIGRATED WORLD: a first row at derivedAt and a reproduction whose moment was never kept (NULL) — the column’s bytes exactly', async () => {
    world(null);
    expect(await provenance()).toBe(AS_THE_COLUMN_SERVED);
  });

  it('THE WRITER’S WORLD: a reproduction with its moment — the same bytes', async () => {
    world(new Date(Date.UTC(2026, 8, 25, 12)));
    expect(await provenance()).toBe(AS_THE_COLUMN_SERVED);
  });

  it('THE ORDER IS NEVER THE ORDER THE ROWS ARE STORED IN — the producer first, whether the reproduction’s moment was kept or not', async () => {
    world(null, true);
    expect(await provenance()).toBe(AS_THE_COLUMN_SERVED);
    world(new Date(Date.UTC(2026, 8, 25, 12)), true);
    expect(await provenance()).toBe(AS_THE_COLUMN_SERVED);
  });

  it('THREE MEMBERS (M1) — the producer, then the reproduction whose moment was never kept (it predates the table), then the one the writer recorded: [v1, v2, v3]', async () => {
    threeMembers();
    expect(await provenance()).toBe(THREE_AS_THE_COLUMN_SERVED);
    threeMembers(true);
    expect(await provenance()).toBe(THREE_AS_THE_COLUMN_SERVED);
  });

  it('and CURRENT(d) is the version with a row for CURRENT_EXTRACTOR — the membership read over the same rows (A3 :1368)', async () => {
    world(null);
    const answer = await readDocument(COMMITMENT, 'res_1');
    if ('code' in answer) throw new Error(`read_document refused: ${answer.code}`);
    expect(answer.current).toEqual({ contentVersionHash: '0x' + 'e7'.repeat(32) });
    // THE FLOOR: without the reproduction's row the same version is NOT current — the read is membership, not "any row".
    store.derivations.splice(store.derivations.findIndex((row) => row['extractorVersion'] === CURRENT_EXTRACTOR), 1);
    const awaiting = await readDocument(COMMITMENT, 'res_1');
    if ('code' in awaiting) throw new Error(`read_document refused: ${awaiting.code}`);
    expect(awaiting.current).toEqual({ awaiting: 'AWAITING_DERIVATION' });
  });
});
