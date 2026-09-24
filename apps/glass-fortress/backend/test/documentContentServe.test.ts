jest.mock('../src/lib/prisma', () => (require('./document/world') as typeof import('./document/world')).prismaDouble);
jest.mock('../src/services/documentBucket', () => (require('./document/world') as typeof import('./document/world')).bucketDouble);
jest.mock('../src/factories/LLMFactory', () => (require('./document/world') as typeof import('./document/world')).llmDouble);

import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { mintTextLink, TEXT_LINK_SECONDS, verifyTextLink } from '../src/lib/documentTextLink';
import { documentContentRouter } from '../src/routes/documentContentRoutes';
import { serveDocumentContent } from '../src/services/documentContentServe';
import { resetWorld, seedArrival, seedDocument, seedResearcher, seedVersion, store } from './document/world';
import { SRC } from './walk/scan';

// ---------------------------------------------------------------------------
// A5 :1504-:1506 AS RULED 2026-09-24 (Q1 of step 30's close) — `GET /api/documents/:commitment/content`, THE SIGNED
// ARM, built at #579 as `read_document`'s `textUrl` (A4 :1425), and the PUBLIC BRANCH that refuses until step 34.
//
// `read_document` mints a short-lived signature — HMAC with TOKEN_HMAC_SECRET over a fixed `document-text:` label
// first, then the commitment, the version hash and the expiry — and with a valid one this route serves THAT version's
// text and reads no caller identity. Without one it behaves as the public branch: NOT_PUBLIC for every document while
// no `DocumentOpeningDecision` exists, and a planted opening row THROWS naming step 34 (as `readDocument.ts`'s
// `list_documents` does) — OPENED(d) is step 34's to read, and it is not read here.
// ---------------------------------------------------------------------------

const SECRET = 'token-hmac-secret-for-tests';
const COMMITMENT = '0x' + 'c1'.repeat(32);
const OLDER = '0x' + 'e0'.repeat(32);
const CURRENT_HASH = '0x' + 'e1'.repeat(32);
const NOW = Date.UTC(2026, 8, 24, 12);

const app = express();
app.use('/api/documents', documentContentRouter);

beforeAll(() => {
  process.env['TOKEN_HMAC_SECRET'] = SECRET;
  process.env['FRONTEND_URL'] = 'https://gf.test';
});

beforeEach(() => {
  resetWorld();
  seedResearcher('res_1', 'researcher-one');
  seedDocument({ docId: '0x' + 'd1'.repeat(32), commitment: COMMITMENT, bytes: '0x' + 'd1'.repeat(32), title: 'the circular' });
  seedArrival('res_1', COMMITMENT);
  seedVersion({ commitment: COMMITMENT, text: 'the older text', contentVersionHash: OLDER, derivedUnder: ['old'] });
  seedVersion({ commitment: COMMITMENT, text: 'the current text', contentVersionHash: CURRENT_HASH, derivedUnder: ['seed'] });
});

/** The link's query, as `read_document` minted it. */
function queryOf(url: string): { commitment: string; version: string; expires: string; sig: string } {
  const link = new URL(url);
  const commitment = link.pathname.split('/').at(3) ?? '';
  return { commitment, version: link.searchParams.get('version') ?? '', expires: link.searchParams.get('expires') ?? '', sig: link.searchParams.get('sig') ?? '' };
}

describe('the SIGNATURE — HMAC(TOKEN_HMAC_SECRET) over `document-text:` first, then commitment, version, expiry', () => {
  it('a minted link is the content route’s path on the public origin, expiring in TEN MINUTES', () => {
    const link = mintTextLink(COMMITMENT, CURRENT_HASH, NOW);
    expect(TEXT_LINK_SECONDS).toBe(600);
    expect(link.url.startsWith(`https://gf.test/api/documents/${COMMITMENT}/content?`)).toBe(true);
    expect(link.expiresAt.getTime()).toBe(NOW + 600 * 1000);
    expect(verifyTextLink(queryOf(link.url), NOW)).toBe(true);
  });

  it('the MAC is over the LABEL first — the same fields with no label, or under another label, do not verify', () => {
    const link = queryOf(mintTextLink(COMMITMENT, CURRENT_HASH, NOW).url);
    const unlabelled = createHmac('sha256', SECRET).update(`${COMMITMENT}:${CURRENT_HASH}:${link.expires}`).digest('hex');
    expect(verifyTextLink({ ...link, sig: unlabelled }, NOW)).toBe(false);
    const labelled = createHmac('sha256', SECRET).update(`document-text:${COMMITMENT}:${CURRENT_HASH}:${link.expires}`).digest('hex');
    expect(labelled).toBe(link.sig);
  });

  it.each([
    ['another commitment', { commitment: '0x' + 'c2'.repeat(32) }],
    ['another version', { version: OLDER }],
    ['a later expiry', { expires: String(Math.floor(NOW / 1000) + 999_999) }],
    ['a tampered signature', { sig: '0'.repeat(64) }],
    ['a signature that is not hex', { sig: 'not-a-mac' }],
  ])('%s does not verify', (_name, patch) => {
    const link = queryOf(mintTextLink(COMMITMENT, CURRENT_HASH, NOW).url);
    expect(verifyTextLink({ ...link, ...patch }, NOW)).toBe(false);
  });

  it('an EXPIRED link does not verify — ten minutes and one second later', () => {
    const link = queryOf(mintTextLink(COMMITMENT, CURRENT_HASH, NOW).url);
    expect(verifyTextLink(link, NOW + 600 * 1000)).toBe(true);
    expect(verifyTextLink(link, NOW + 601 * 1000)).toBe(false);
  });
});

describe('THE SIGNED ARM — that version’s text, and no caller identity read (A5 :1505 as ruled)', () => {
  it('serves the CURRENT version’s text as plain text, byte for byte', async () => {
    const link = mintTextLink(COMMITMENT, CURRENT_HASH, Date.now());
    const answer = await request(app).get(new URL(link.url).pathname + new URL(link.url).search);
    expect(answer.status).toBe(200);
    expect(answer.headers['content-type']).toMatch(/^text\/plain; charset=utf-8/);
    expect(answer.text).toBe('the current text');
  });

  it('serves an OLDER version’s text by its own link — `?version=<hash>` names the version, not CURRENT', async () => {
    const answer = await serveDocumentContent(queryOf(mintTextLink(COMMITMENT, OLDER, NOW).url), NOW);
    expect(answer).toEqual({ text: 'the older text' });
  });

  it('an expired link falls to the PUBLIC branch — NOT_PUBLIC, never the text', async () => {
    const answer = await serveDocumentContent(queryOf(mintTextLink(COMMITMENT, CURRENT_HASH, NOW).url), NOW + 601 * 1000);
    expect(answer).toMatchObject({ code: 'NOT_PUBLIC' });
  });
});

describe('THE PUBLIC BRANCH — refuses every document until step 34 builds the opening (A5 :1505-:1506 as ruled)', () => {
  it('no signature and NO opening decision: 404 NOT_PUBLIC, `{ error, code }`', async () => {
    // THE FLOOR: the document exists and has text — a refusal of a document that did not would prove nothing.
    expect(store.versions.filter((v) => v['commitment'] === COMMITMENT && v['text'] !== null)).toHaveLength(2);
    const answer = await request(app).get(`/api/documents/${COMMITMENT}/content`);
    expect(answer.status).toBe(404);
    expect(answer.body).toEqual({ error: expect.any(String) as string, code: 'NOT_PUBLIC' });
  });

  it('a commitment naming NO document is NOT_PUBLIC too — the public branch never says which documents exist', async () => {
    const answer = await serveDocumentContent({ commitment: '0x' + 'ee'.repeat(32) }, NOW);
    expect(answer).toMatchObject({ code: 'NOT_PUBLIC' });
  });

  it('THE DECOY FLIPS IT — a planted opening row THROWS naming step 34, never serves and never answers NOT_PUBLIC over it', async () => {
    // WORLD: `decide_opening` (document step 34) is the ONLY writer of DocumentOpeningDecision, so no row exists at
    // #579 — and NOT_PUBLIC is true only while none does. The same call, before and after the row: the flip is the case.
    expect(await serveDocumentContent({ commitment: COMMITMENT }, NOW)).toMatchObject({ code: 'NOT_PUBLIC' });
    store.openings.push({ id: 'opening-1', thesisId: 'thesis-1', commitment: COMMITMENT, sequence: 1, opening: 'CONTENT', researcherId: 'res_1' });
    await expect(serveDocumentContent({ commitment: COMMITMENT }, NOW)).rejects.toThrow(/document step 34/);
  });
});

describe('the route reads NO caller identity — the signature proves the mint (A5 :1505)', () => {
  it('its source names no gate, no header and no researcher', () => {
    const source = readFileSync(join(SRC, 'routes', 'documentContentRoutes.ts'), 'utf8');
    expect(source).toMatch(/router\.get\(/);
    expect(source).not.toMatch(/requireResearcher|identifyResearcher|requireSupabaseAuth|req\.headers|researcherId/);
  });
});
