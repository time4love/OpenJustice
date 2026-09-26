jest.mock('../src/lib/prisma', () => (require('./document/world') as typeof import('./document/world')).prismaDouble);
jest.mock('../src/services/documentBucket', () => (require('./document/world') as typeof import('./document/world')).bucketDouble);
jest.mock('../src/factories/LLMFactory', () => (require('./document/world') as typeof import('./document/world')).llmDouble);

import express from 'express';
import request from 'supertest';
import { CURRENT_EXTRACTOR } from '../src/lib/documentExtractor';
import { commitment as commitmentOf, contentVersionHashOf, docId as docIdOf } from '../src/lib/documentIdentity';
import { documentContentRouter } from '../src/routes/documentContentRoutes';
import { serveDocumentBytes } from '../src/services/documentBytesServe';
import { store } from './document/world';
import { at, BYTES, DOC, DOC_ID, SALT, TEXT, world } from './document/servesWorld';

// ---------------------------------------------------------------------------
// THE TWO PUBLIC SERVES — docs/gf-document-flows.md A5 :1504–:1511; §7 :776–:789 (the three openings), :765–:770 (DOC_ID
// only with the bytes); document plan step 34 :276–:277; the researcher's Q2, Q6, Q9, Q10, Q14 (R84); chunk 4b (R85).
//
// `GET /:commitment/content` serves a PINNED content version under OPENED(d) ≥ CONTENT (A5 :1505 as CONFORMED, R85 Q-H) —
// the text, or the bytes where the content IS the bytes — and refuses NOT_PUBLIC · NOT_OPENED_TO · SHED · NOT_PINNED. `GET /:commitment/bytes` serves the FILE under
// OPENED(d) = BYTES with the DOC_ID and the salt BESIDE it (Q6: headers, exposed to the browser) and refuses NOT_PUBLIC ·
// NOT_OPENED_TO · NOT_HELD · SHED. OPENED(d) is `documentOpenings.openingsOf`'s — THE loader, never re-derived.
//
// THE WORLD — `./document/world.ts`, which throws on any query shape it does not model: th_1's version v1 cites the
// document and was PUBLISHED at `PUBLISHED_AT`; a decision made BEFORE it is in force (A4 :1444 as CONFORMED). The
// document's DOC_ID is its bytes' REAL hash and its commitment the REAL `sha256(bytes32(DOC_ID) ‖ salt)`.
// ---------------------------------------------------------------------------

const app = express();
app.use('/api/documents', documentContentRouter);

const content = (commitment = DOC) => request(app).get(`/api/documents/${commitment}/content`);
const bytes = (commitment = DOC) => request(app).get(`/api/documents/${commitment}/bytes`).buffer(true).parse((res, done) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks)));
});

describe('GET /:commitment/content — a PINNED content version under OPENED(d) ≥ CONTENT (A5 :1504–:1506 as CONFORMED)', () => {
  it('serves the TEXT at CONTENT — text/plain, byte for byte, and NO DOC_ID and NO salt anywhere in the answer', async () => {
    world();
    const answer = await content();
    expect([answer.status, answer.headers['content-type'], answer.text]).toEqual([200, 'text/plain; charset=utf-8', TEXT]);
    const everything = JSON.stringify(answer.headers) + answer.text;
    expect([everything.includes(DOC_ID.slice(2)), everything.includes(SALT.toString('hex'))]).toEqual([false, false]);
  });

  it('serves the BYTES where the content IS the bytes — the file, under its own mimeType (§7 :783–:784)', async () => {
    world({ text: null, document: { mimeType: 'image/png' } });
    const served = await request(app).get(`/api/documents/${DOC}/content`).buffer(true).parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });
    expect([served.status, served.headers['content-type']]).toEqual([200, 'image/png']);
    expect(Buffer.compare(served.body as Buffer, Buffer.from(BYTES))).toBe(0);
  });

  it('NOT_OPENED_TO at PASSAGE — nothing of the document is served (§7 :777)', async () => {
    world({ decisions: [['PASSAGE', 20]] });
    const answer = await content();
    expect([answer.status, (answer.body as { code?: string }).code]).toEqual([404, 'NOT_OPENED_TO']);
  });

  it('NOT_PUBLIC for a document no publication opened, and for a name no document holds — one answer for both', async () => {
    world({ decisions: [] });
    const unopened = await content();
    const unknown = await content('0x' + 'ee'.repeat(32));
    expect([unopened.status, (unopened.body as { code?: string }).code]).toEqual([404, 'NOT_PUBLIC']);
    expect(unknown.body).toEqual(unopened.body);
  });

  it('SHED for a document whose content was taken back (A5 :1506; §8)', async () => {
    world({ document: { bytes: null } });
    store.sheds.push({ commitment: DOC, cause: 'OPERATOR', researcherId: 'res_1', reason: 'counsel', at: at(22) });
    const answer = await content();
    expect([answer.status, (answer.body as { code?: string }).code]).toEqual([404, 'SHED']);
  });

  it('B9 — Q2: the thesis UNPUBLISHED since, its pin cleared — what was opened STAYS served (§7 :797–:801)', async () => {
    world();
    store.theses[0] = { ...store.theses[0], publishedVersionId: null };
    expect((await content()).status).toBe(200);
  });

  it('B10 — Q14: a wider decision made AFTER the last publication is NOT in force — PASSAGE still refuses until the next', async () => {
    world({ decisions: [['PASSAGE', 20], ['CONTENT', 22]] });
    expect((await content()).body).toMatchObject({ code: 'NOT_OPENED_TO' });
    store.attempts.push({ id: 'a-v1-again', thesisId: 'th_1', versionId: 'v1', outcome: 'PUBLISHED', createdAt: at(23) });
    expect((await content()).status).toBe(200);
  });
});

describe('GET /:commitment/bytes — the FILE, with { docId, salt } beside it (A5 :1508–:1511; Q6)', () => {
  it('B11 at BYTES: the body IS the file, Content-Disposition attachment, X-Document-Id and X-Document-Salt, both EXPOSED', async () => {
    world({ decisions: [['BYTES', 20]] });
    const answer = await bytes();
    expect(answer.status).toBe(200);
    expect(Buffer.compare(answer.body as Buffer, Buffer.from(BYTES))).toBe(0);
    expect(answer.headers['content-type']).toBe('application/pdf');
    expect(answer.headers['content-disposition']).toMatch(/^attachment/);
    expect([answer.headers['x-document-id'], answer.headers['x-document-salt']]).toEqual([DOC_ID, `0x${SALT.toString('hex')}`]);
    const exposed = String(answer.headers['access-control-expose-headers']).split(',').map((h) => h.trim().toLowerCase());
    expect(exposed).toEqual(expect.arrayContaining(['x-document-id', 'x-document-salt']));
    // A READER REPRODUCES THE COMMITMENT from what this one answer carries (A5 :1509–:1510).
    const salt = Buffer.from(String(answer.headers['x-document-salt']).slice(2), 'hex');
    expect(commitmentOf(docIdOf(new Uint8Array(answer.body as Buffer)), salt)).toBe(DOC);
  });

  it('B11 NOT_OPENED_TO below BYTES — at CONTENT the file and its DOC_ID are NOT served', async () => {
    world({ decisions: [['CONTENT', 20]] });
    const answer = await request(app).get(`/api/documents/${DOC}/bytes`);
    expect([answer.status, (answer.body as { code?: string }).code]).toEqual([404, 'NOT_OPENED_TO']);
    expect(answer.headers['x-document-id']).toBeUndefined();
  });

  // MOVED TO A REACHABLE WORLD at chunk 4b round 2 (REVIEW's M6): a sealed document can never be opened to BYTES —
  // `decide_opening` refuses it NOT_HELD (A4 :1445) and check 18 refuses a version that tried (A6 :1535) — so the
  // world this case stood on (sealed AND opened BYTES) is one no clause creates. The reachable one: sealed, opened to
  // CONTENT, and `/bytes` asked of it — NOT_HELD, decided before the opening is (A5 :1511).
  it('B11 NOT_HELD on a SEALED document opened to CONTENT — it has no bytes anywhere, decided BEFORE the opening (A5 :1511)', async () => {
    world({ decisions: [['CONTENT', 20]], document: { bytes: null, cid: 'bafy-sealed', verifiedAtReceipt: at(19) } });
    store.versions[0] = { ...store.versions[0], derivedFrom: 'AT_RECEIPT' };
    const answer = await request(app).get(`/api/documents/${DOC}/bytes`);
    expect([answer.status, (answer.body as { code?: string }).code]).toEqual([404, 'NOT_HELD']);
  });

  it('B11 NOT_PUBLIC and SHED, as /content refuses them', async () => {
    world({ decisions: [] });
    expect((await request(app).get(`/api/documents/${DOC}/bytes`)).body).toMatchObject({ code: 'NOT_PUBLIC' });
    world({ decisions: [['BYTES', 20]], document: { bytes: null } });
    store.sheds.push({ commitment: DOC, cause: 'OPERATOR', researcherId: 'res_1', reason: 'counsel', at: at(22) });
    expect((await request(app).get(`/api/documents/${DOC}/bytes`)).body).toMatchObject({ code: 'SHED' });
  });

  it('S6 a HELD row whose object is MISSING throws by name — never NOT_HELD, a false word about custody', async () => {
    world({ decisions: [['BYTES', 20]] });
    store.documents[0] = { ...store.documents[0], bytes: '0x' + '0'.repeat(64) };
    await expect(serveDocumentBytes(DOC)).rejects.toThrow(/holds no object/);
  });
});

describe('the serves carry the platform’s own policy for USER BYTES — no sniffing, no script (hardening, recorded)', () => {
  it('both answers are nosniff and sandboxed, so an uploaded image/svg+xml cannot run as a page on this origin', async () => {
    world({ decisions: [['BYTES', 20]], text: null, document: { mimeType: 'image/svg+xml' } });
    for (const path of ['content', 'bytes']) {
      const answer = await request(app).get(`/api/documents/${DOC}/${path}`);
      expect([answer.status, answer.headers['x-content-type-options'], answer.headers['content-security-policy']]).toEqual([200, 'nosniff', "default-src 'none'; sandbox"]);
    }
  });
});

describe('opinions-not-facts, EXTENDED to the two serves (A7 :1571–:1573; plan :284–:285) — a model’s reading is never served', () => {
  const READING = 'a model read this document as a ministry circular naming three officials';

  it('a planted OPINION beside the version reaches neither serve — /content is the COMPUTED text and /bytes the file, nothing else', async () => {
    world({ decisions: [['BYTES', 20]] });
    store.opinions.push({ id: 'opinion-1', versionId: store.versions.at(0)?.['id'], by: 'RESEARCHER', researcherId: 'res_1', model: 'gemini', promptVersion: 'v3', body: { summary: READING }, createdAt: at(20) });
    const text = await content();
    expect([text.status, text.text]).toEqual([200, TEXT]);
    const file = await bytes();
    const served = [JSON.stringify(text.headers), text.text, JSON.stringify(file.headers), (file.body as Buffer).toString('utf8')];
    expect(served.filter((one) => one.includes(READING) || /opinion|promptVersion/i.test(one))).toEqual([]);
  });
});

describe('Q-H — /content serves a PINNED version (A5 :1505–:1506 as CONFORMED 2026-09-26, R85 Q-H)', () => {
  /** A second version of the document — derived later, under the CURRENT extractor, and never pinned by default. */
  function newerVersion(text: string): string {
    const hash = contentVersionHashOf(text, DOC);
    store.versions = store.versions.map((v) => ({ ...v, derivedUnder: ['an-older-extractor'] }));
    store.versions.push({ id: 'version-newer', commitment: DOC, text, contentVersionHash: hash, extractor: 'pdf', extractorVersion: CURRENT_EXTRACTOR, derivedUnder: [CURRENT_EXTRACTOR], readFailed: false, derivedAt: at(25), derivedFrom: 'HELD_BYTES' });
    return hash;
  }

  it('Q-H (i) after CURRENT_EXTRACTOR moves — a newer version CURRENT, the pin unchanged — /content still serves the PINNED text', async () => {
    world();
    newerVersion('the circular, as a later extractor reads it');
    const answer = await content();
    expect([answer.status, answer.text]).toEqual([200, TEXT]);
  });

  it('Q-H (ii) `?version=<CURRENT, never pinned>` is NOT_PINNED — the document is opened, that version is not what was opened', async () => {
    world();
    const newer = newerVersion('the circular, as a later extractor reads it');
    const answer = await request(app).get(`/api/documents/${DOC}/content?version=${newer}`);
    expect([answer.status, (answer.body as { code?: string }).code]).toEqual([404, 'NOT_PINNED']);
  });

  it('Q-H (iv) a DRAFT’s pin is NOT servable — EXACTLY the pins of citations on versions EVER published (A3 :1377’s spelling)', async () => {
    world();
    const newer = newerVersion('the circular, as a later extractor reads it');
    // th_1's HEAD re-pins the newer version and is never published: no PUBLISHED attempt names v1-draft.
    store.mentions.push({ versionId: 'v1-draft', kind: 'DOCUMENT', name: DOC, contentVersionHash: newer, thesisVersion: { thesisId: 'th_1' } });
    const answer = await request(app).get(`/api/documents/${DOC}/content?version=${newer}`);
    expect([answer.status, (answer.body as { code?: string }).code]).toEqual([404, 'NOT_PINNED']);
  });

  it('Q-H (iii) two theses pinning two versions — each served by its own `?version`; with none, the most recent publication’s pin', async () => {
    world();
    const newerText = 'the circular, as a later extractor reads it';
    const newer = newerVersion(newerText);
    store.theses.push({ id: 'th_2', createdById: 'res_2', headVersionId: 'v2', publishedVersionId: 'v2' });
    store.mentions.push({ versionId: 'v2', kind: 'DOCUMENT', name: DOC, contentVersionHash: newer, thesisVersion: { thesisId: 'th_2' } });
    store.attempts.push({ id: 'a-v2', thesisId: 'th_2', versionId: 'v2', outcome: 'PUBLISHED', createdAt: at(23) });
    store.openings.push({ id: 'd-th2', thesisId: 'th_2', commitment: DOC, sequence: 1, opening: 'CONTENT', researcherId: 'res_2', createdAt: at(22) });
    const older = contentVersionHashOf(TEXT, DOC);
    expect((await request(app).get(`/api/documents/${DOC}/content?version=${older}`)).text).toBe(TEXT);
    expect((await request(app).get(`/api/documents/${DOC}/content?version=${newer}`)).text).toBe(newerText);
    expect((await content()).text).toBe(newerText);
  });
});
