jest.mock('../../src/lib/prisma', () => (require('./world') as typeof import('./world')).prismaDouble);
jest.mock('../../src/services/documentBucket', () => (require('./world') as typeof import('./world')).bucketDouble);
jest.mock('../../src/factories/LLMFactory', () => (require('./world') as typeof import('./world')).llmDouble);

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CURRENT_EXTRACTOR } from '../../src/lib/documentExtractor';
import { built } from './built';
import { DESCRIBE_DOCUMENT_REFUSALS, LIST_DOCUMENTS_REFUSALS, READ_DOCUMENT_REFUSALS } from './contract';
import {
  bucketCalls,
  fixture,
  modelAnswer,
  modelCalls,
  nameOf,
  resetWorld,
  seedArrival,
  seedDocument,
  seedObject,
  seedResearcher,
  seedTrackedUrl,
  seedVersion,
  store,
  writes,
} from './world';

// ---------------------------------------------------------------------------
// A4 :1424-:1441 — THE TWO GATED READS AND THE ONE PAID WRITE.
//
// BOTH READS CARRY `uploadUrl`, THE DIALOG'S LINK (RULED 2026-09-22 at :1428 and :1434):
// `list_documents({ url })` hands a link that prefills the PAGE; `read_document(c)` hands
// one that prefills DERIVED-FROM and that document's assertions. THE LINK CARRIES THE
// CONTEXT so the dialog can take one thing — the file — and draw every fact as a LABEL.
// A4 GAINS NO TOOL: two fields on two envelopes, not a third read.
//
// `describe_document` IS PAID and is the OPINION register's second writer (§3 :294-:296).
// The model is MOCKED AT ITS BOUNDARY here; no test in this suite reaches a model.
//
// THE WORLD — GIVEN AT STEP 30 (R76, REVIEW's finding 1): the seeds below are the rows
// `add_document` writes (A4 :1405-:1406), so every HELD case stands on a reachable world.
// A SEALED row is written only by the intake receipt (plan step 32 :213-:231) and a SHED
// row only by SHED (plan step 35 :297-:305): NEITHER world is reachable before those steps,
// so the cases that need one stay RED BY NAME with their owning step — the plan gives
// "read_document's HELD shape" to step 30 (:180), its SEALED shape to step 32 (:224) and its
// NONE shape to step 35 (:302), and a step that turns green a case it does not own has done
// work outside its scope (refactor plan §6 :601-:603).
// ---------------------------------------------------------------------------

interface Refusal {
  error: string;
  code: string;
}

interface HeldShape {
  custody: 'HELD';
  docId: string;
  mimeType: string;
  byteLength: number;
  versions: readonly { contentVersionHash: string; text: string | null; opinions: readonly unknown[] }[];
  current: { contentVersionHash: string } | { awaiting: 'AWAITING_DERIVATION' };
  /** A4 :1425 as ruled 2026-09-23 — the bytes NEVER ride the answer; a link does, for a non-image bytes-only kind. */
  bytesUrl: { url: string; expiresAt: string } | null;
  anchored: boolean;
  equalsCapture: { url: string; capture: string } | null;
  assertions: { assertedUrl: string | null; assertedAt: string | null; title: string | null };
  uploadUrl: string;
}

interface SealedShape {
  custody: 'SEALED';
  verifiedAtReceipt: string;
  cid: string;
  version: { contentVersionHash: string; text: string | null };
  anchored: boolean;
}

interface NoneShape {
  custody: 'NONE';
  shed: { cause: string; at: string };
}

interface ListedDocument {
  commitment: string;
  title: string | null;
  custody: string;
  /** A4 :1433 as ruled 2026-09-23. */
  mimeType: string;
  byteLength: number;
  anchored: boolean;
  assertions: { assertedUrl: string | null; assertedAt: string | null };
  current: string | null;
  citedBy: readonly { thesisId: string; published: boolean }[];
  opening: string | null;
  /** A4 :1432 as ruled — ui §7.1's shape: a handle and `mine`, never an id. */
  by: { handle: string; mine: boolean };
}

interface Reads {
  readDocument: (
    commitment: string,
    researcherId: string | null,
  ) => Promise<HeldShape | SealedShape | NoneShape | Refusal>;
  listDocuments: (
    args: { url?: string; scope?: 'mine' | 'all' },
    researcherId: string | null,
  ) => Promise<{ documents: readonly ListedDocument[]; uploadUrl: string } | Refusal>;
}

interface Describe {
  describeDocument: (commitment: string, researcherId: string | null) => Promise<{ opinion: unknown } | Refusal>;
}

const reads = () => built<Reads>('services/readDocument');
const describe_ = () => built<Describe>('services/describeDocument');

const isRefusal = (answer: unknown): answer is Refusal =>
  typeof (answer as Refusal)?.code === 'string';

/** A case whose world a LATER step creates. It stays red BY NAME, naming that step, until it is built. */
function owedBy(step: number, what: string): void {
  throw new Error(`${what} — document step ${String(step)} builds it`);
}

const PDF = fixture('PDF_TEXT_LAYER');
const AUDIO = fixture('UNREADABLE');
const SHEET = fixture('SPREADSHEET');

const HELD_COMMITMENT = '0x' + 'c1'.repeat(32);
const SEALED_COMMITMENT = '0x' + 'c2'.repeat(32);
const SHED_COMMITMENT = '0x' + 'c3'.repeat(32);
const AWAITING_COMMITMENT = '0x' + 'c4'.repeat(32);
const AUDIO_COMMITMENT = '0x' + 'c5'.repeat(32);
const BROKEN_SHEET_COMMITMENT = '0x' + 'c6'.repeat(32);
/** THE symbol, imported — a literal here would be a second spelling of `CURRENT_EXTRACTOR`. */
const CURRENT: string = CURRENT_EXTRACTOR;

beforeEach(() => {
  resetWorld();
  seedResearcher('res_1', 'researcher-one');
  seedResearcher('res_2', 'researcher-two');
  seedTrackedUrl('https://surveyed.example/p');
  seedObject(PDF.docId, PDF.bytes);
  seedDocument({
    docId: PDF.docId, commitment: HELD_COMMITMENT, bytes: PDF.docId, mimeType: PDF.mimeType,
    byteLength: PDF.byteLength, title: 'the circular', assertedUrl: 'https://surveyed.example/p',
  });
  seedArrival('res_1', HELD_COMMITMENT);
  seedVersion({ commitment: HELD_COMMITMENT, text: 'Ministry of Health - circular 4/2026', contentVersionHash: '0x' + 'e1'.repeat(32), derivedUnder: [CURRENT] });
  // A HELD document with NO version under the current extractor — A3 :1368's AWAITING world,
  // reachable whenever CURRENT_EXTRACTOR moves before the derivation pass has run.
  seedDocument({ docId: '0x' + 'd4'.repeat(32), commitment: AWAITING_COMMITMENT, bytes: '0x' + 'd4'.repeat(32), title: 'awaiting' });
  seedArrival('res_2', AWAITING_COMMITMENT, new Date(Date.UTC(2026, 8, 21)));
  // An AUDIO file: accepted at the door (boards י1/י2), read by no model (A4 :1440 as ruled).
  seedObject(AUDIO.docId, AUDIO.bytes);
  seedDocument({ docId: AUDIO.docId, commitment: AUDIO_COMMITMENT, bytes: AUDIO.docId, mimeType: AUDIO.mimeType, byteLength: AUDIO.byteLength, title: 'the interview' });
  seedArrival('res_1', AUDIO_COMMITMENT, new Date(Date.UTC(2026, 8, 22)));
  seedVersion({ commitment: AUDIO_COMMITMENT, text: null, contentVersionHash: AUDIO.docId, derivedUnder: [CURRENT] });
  // A SPREADSHEET whose reader FAILED — the corrupt-file world ruled 2026-09-23 (A2 :1300): accepted as bytes-only.
  seedDocument({ docId: '0x' + 'd6'.repeat(32), commitment: BROKEN_SHEET_COMMITMENT, bytes: '0x' + 'd6'.repeat(32), mimeType: SHEET.mimeType, title: 'the broken sheet' });
  seedArrival('res_1', BROKEN_SHEET_COMMITMENT, new Date(Date.UTC(2026, 8, 22, 1)));
  seedVersion({ commitment: BROKEN_SHEET_COMMITMENT, text: null, contentVersionHash: '0x' + 'd6'.repeat(32), derivedUnder: [CURRENT], readFailed: true });
});

describe('A4 :1424-:1430 — read_document, and its THREE shapes by custody', () => {
  it('HELD: every version, the current one, anchored, equalsCapture, the assertions — and NO bytes (A4 :1425 as ruled)', async () => {
    const { readDocument } = await reads();
    const answer = await readDocument(HELD_COMMITMENT, 'res_1');
    expect(!isRefusal(answer) && answer.custody).toBe('HELD');
    // STRENGTHENED, and :1425 as ruled: the text rides; the BYTES do not, in any field.
    const held = answer as HeldShape;
    expect(held.versions.at(0)?.text).toBe('Ministry of Health - circular 4/2026');
    expect('bytes' in held).toBe(false);
    expect(held.bytesUrl).toBeNull();
  });

  it('SEALED: the AT_RECEIPT version and its stamp — NO BYTES EXIST TO RETURN (A4 :1427-:1428)', async () => {
    owedBy(32, "read_document's SEALED shape (plan :224) — no SEALED row exists before the intake receipt");
    const { readDocument } = await reads();
    const answer = await readDocument(SEALED_COMMITMENT, 'res_1');
    expect(!isRefusal(answer) && answer.custody).toBe('SEALED');
    expect(!isRefusal(answer) && 'bytes' in answer).toBe(false);
  });

  it('NONE: the shed cause and moment, and HASHES ONLY (A4 :1429)', async () => {
    owedBy(35, "read_document's NONE shape (plan :302) — no Shed row exists before SHED");
    const { readDocument } = await reads();
    const answer = await readDocument(SHED_COMMITMENT, 'res_1');
    expect(!isRefusal(answer) && answer.custody).toBe('NONE');
  });

  it('`arrivals` is each arrival, `{ by: { handle, mine } | null, at }` OLDEST FIRST — A4 :1426 as ruled (batch item 15)', async () => {
    // WORLD: a second researcher brings the same bytes later (§2 :211) — one Document, two attributed arrivals.
    seedArrival('res_2', HELD_COMMITMENT, new Date(Date.UTC(2026, 8, 21)));
    const { readDocument } = await reads();
    const answer = await readDocument(HELD_COMMITMENT, 'res_2');
    if (isRefusal(answer)) throw new Error(`expected a document, got ${answer.code}`);
    expect((answer as unknown as { arrivals: unknown }).arrivals).toEqual([
      { by: { handle: 'researcher-one', mine: false }, at: '2026-09-20T00:00:00.000Z' },
      { by: { handle: 'researcher-two', mine: true }, at: '2026-09-21T00:00:00.000Z' },
    ]);
  });

  it('`anchored` is TYPED boolean in both envelopes — ANCHORED(d), A3 :1366 — never the literal `false` (A4 :1426, :1434)', () => {
    const source = readFileSync(join(__dirname, '..', '..', 'src', 'services', 'readDocument.ts'), 'utf8');
    // THE FLOOR: the field is declared at all, twice — one per envelope.
    expect(source.match(/^\s+anchored: boolean;$/gm)).toHaveLength(2);
    expect(source).not.toMatch(/^\s+anchored: false;$/m);
  });

  it('the HELD shape carries `uploadUrl` — the dialog’s link with THIS document as derived-from (:1428)', async () => {
    const { readDocument } = await reads();
    const answer = await readDocument(HELD_COMMITMENT, 'res_1');
    expect(!isRefusal(answer) && typeof (answer as HeldShape).uploadUrl).toBe('string');
    // STRENGTHENED: the link names THIS document as derived-from.
    expect((answer as HeldShape).uploadUrl).toContain(`derivedFrom=${HELD_COMMITMENT}`);
  });

  it('the link carries the derived-from document’s FAMILY, so the dialog can draw its kind (board י1ב, R78 chunk-3 r2)', async () => {
    // Board י1ב draws the derived-from label WITH its kind — „… (וידאו)". The dialog reads no document, so the
    // family must ride the link, spelled as `DocumentFamily` (`lib/acceptedDocumentTypes.ts`).
    const { readDocument } = await reads();
    const pdf = await readDocument(HELD_COMMITMENT, 'res_1');
    const audio = await readDocument(AUDIO_COMMITMENT, 'res_1');
    if (isRefusal(pdf) || isRefusal(audio)) throw new Error('expected two documents');
    expect(new URL((pdf as HeldShape).uploadUrl).searchParams.getAll('derivedFromFamily')).toEqual(['PDF']);
    expect(new URL((audio as HeldShape).uploadUrl).searchParams.getAll('derivedFromFamily')).toEqual(['AUDIO']);
  });

  it('the link carries the document’s asserted DATE as `at` — a default the conversation may SET anew (:1428, §9 :998)', async () => {
    const commitment = '0x' + 'c9'.repeat(32);
    seedDocument({
      docId: '0x' + 'd9'.repeat(32), commitment, bytes: '0x' + 'd9'.repeat(32), title: 'the dated circular',
      assertedUrl: 'https://surveyed.example/p', assertedAt: new Date(Date.UTC(2026, 8, 3)),
    });
    seedArrival('res_1', commitment);
    seedVersion({ commitment, text: 'dated', contentVersionHash: '0x' + 'e9'.repeat(32), derivedUnder: [CURRENT] });
    const { readDocument } = await reads();
    const answer = await readDocument(commitment, 'res_1');
    if (isRefusal(answer)) throw new Error(`expected a document, got ${answer.code}`);
    const link = new URL((answer as HeldShape).uploadUrl);
    expect(link.searchParams.getAll('at')).toEqual(['2026-09-03']);
    expect(link.searchParams.get('url')).toBe('https://surveyed.example/p');
  });

  it('a bytes-only document that is NOT an image rides as a signed DOWNLOAD link, never inline (A4 :1425 as ruled)', async () => {
    const { readDocument } = await reads();
    const answer = await readDocument(AUDIO_COMMITMENT, 'res_1');
    if (isRefusal(answer)) throw new Error(`expected a document, got ${answer.code}`);
    const held = answer as HeldShape;
    expect(held.bytesUrl?.url).toContain(AUDIO.docId);
    expect(typeof held.bytesUrl?.expiresAt).toBe('string');
  });

  it('NOT_A_DOCUMENT for a name that resolves to none, and that is the whole set', async () => {
    const { readDocument } = await reads();
    const answer = await readDocument('0x' + 'ee'.repeat(32), 'res_1');
    expect(isRefusal(answer) && answer.code).toBe('NOT_A_DOCUMENT');
    expect([...READ_DOCUMENT_REFUSALS].sort()).toEqual(['NOT_A_DOCUMENT', 'NO_RESEARCHER']);
  });

  it('GATED: no researcher, no answer', async () => {
    const { readDocument } = await reads();
    const answer = await readDocument(HELD_COMMITMENT, null);
    expect(isRefusal(answer) && answer.code).toBe('NO_RESEARCHER');
  });
});

describe('A4 :1432-:1435 — list_documents, GATED, oldest first', () => {
  it('every document of the caller’s scope, with title, custody, anchored, citedBy and opening', async () => {
    const { listDocuments } = await reads();
    const answer = await listDocuments({}, 'res_1');
    expect(!isRefusal(answer) && Array.isArray(answer.documents)).toBe(true);
    // STRENGTHENED, and :1432 as ruled: `mine` is the DEFAULT — res_2's document is not in it.
    if (isRefusal(answer)) return;
    expect(answer.documents.map((d) => d.commitment)).toEqual([HELD_COMMITMENT, AUDIO_COMMITMENT, BROKEN_SHEET_COMMITMENT]);
    expect(answer.documents.at(0)).toMatchObject({ title: 'the circular', custody: 'HELD', anchored: false, citedBy: [], opening: null, mimeType: 'application/pdf', by: { handle: 'researcher-one', mine: true } });
  });

  it('`by` is the FIRST arrival whose by is not null — ONE spelling with read_document’s `arrivals` (A4 :1434 as ruled)', async () => {
    // WORLD: the SAME bytes first reached the platform through the PUBLIC door — an INTAKE arrival, `researcherId`
    // NULL (A2 :1279–:1284 admits it; step 32 is its first writer, and nothing forbids one existing) — and only
    // then through res_1 and res_2. The first arrival's `by` is NULL, so a `by` read off the first arrival would be
    // null; the ruled `by` is the first arrival whose `by` is NOT null (A4 :1434), the researcher's.
    store.arrivals.push({ id: 'arrival-intake', door: 'INTAKE', researcherId: null, receivedAt: new Date(Date.UTC(2026, 8, 19)), thesisId: null, gapId: null, termsHash: null });
    store.arrivalDocuments.push({ arrivalId: 'arrival-intake', commitment: HELD_COMMITMENT });
    seedArrival('res_2', HELD_COMMITMENT, new Date(Date.UTC(2026, 8, 21)));
    const { listDocuments, readDocument } = await reads();
    const listed = await listDocuments({ scope: 'all' }, 'res_2');
    const read = await readDocument(HELD_COMMITMENT, 'res_2');
    if (isRefusal(listed) || isRefusal(read)) throw new Error('expected answers');
    const arrivals = (read as unknown as { arrivals: { by: unknown }[] }).arrivals;
    // THE FLOOR: the public-door arrival is really first, and really has no `by`.
    expect(arrivals.map((arrival) => arrival.by)).toEqual([
      null,
      { handle: 'researcher-one', mine: false },
      { handle: 'researcher-two', mine: true },
    ]);
    const row = listed.documents.find((d) => d.commitment === HELD_COMMITMENT);
    expect(row?.by).toEqual({ handle: 'researcher-one', mine: false });
    expect(row?.by).toEqual(arrivals.find((a) => a.by !== null)?.by);
  });

  it('`scope: all` adds every researcher’s documents, each with its handle and `mine` (A4 :1432, ui §7.1)', async () => {
    const { listDocuments } = await reads();
    const answer = await listDocuments({ scope: 'all' }, 'res_1');
    if (isRefusal(answer)) throw new Error(answer.code);
    const theirs = answer.documents.find((d) => d.commitment === AWAITING_COMMITMENT);
    expect(theirs?.by).toEqual({ handle: 'researcher-two', mine: false });
    expect(answer.documents).toHaveLength(4);
  });

  it('carries `uploadUrl`, the dialog’s link, prefilling the PAGE when `url` is given (:1434)', async () => {
    const { listDocuments } = await reads();
    const answer = await listDocuments({ url: 'https://surveyed.example/p' }, 'res_1');
    expect(!isRefusal(answer) && typeof answer.uploadUrl).toBe('string');
    // STRENGTHENED: the page is IN the link.
    expect(!isRefusal(answer) && answer.uploadUrl).toContain(encodeURIComponent('https://surveyed.example/p'));
  });

  it('NOT_SURVEYED when a url is given and unknown', async () => {
    const { listDocuments } = await reads();
    const answer = await listDocuments({ url: 'https://unsurveyed.example/x' }, 'res_1');
    expect(isRefusal(answer) && answer.code).toBe('NOT_SURVEYED');
    expect([...LIST_DOCUMENTS_REFUSALS].sort()).toEqual(['NOT_SURVEYED', 'NO_RESEARCHER']);
  });

  it('an OPENING row is a world step 34 creates — list_documents THROWS naming it, never answers `opening: null` over it', async () => {
    // WORLD: `decide_opening` (document step 34) is the only writer of DocumentOpeningDecision, so
    // no row exists at step 30 — and the list's `opening: null` is true only while none does. A row
    // appearing before this read learns OPENED(d) is a row it would silently misreport.
    store.openings.push({ id: 'opening-1', thesisId: 'thesis-1', commitment: HELD_COMMITMENT, sequence: 1, opening: 'CONTENT', researcherId: 'res_1' });
    const { listDocuments } = await reads();
    await expect(listDocuments({}, 'res_1')).rejects.toThrow(/document step 34/);
  });

  it('THE DIALOG’S LINK RIDES THIS ENVELOPE, so A4 GAINS NO TOOL (§9 :998)', async () => {
    const { listDocuments } = await reads();
    const answer = await listDocuments({}, 'res_1');
    // The property, stated where it can fail: the link is a FIELD here and there is no
    // `get_upload_url` tool anywhere in the surface.
    expect(!isRefusal(answer) && 'uploadUrl' in answer).toBe(true);
  });
});

describe('A4 :1437-:1441 — describe_document, PAID, on the researcher’s word', () => {
  it('appends an OPINION to CURRENT(d) — §3’s last row, never a citation', async () => {
    const { describeDocument } = await describe_();
    modelAnswer.value = { summary: 'a ministry circular about the reporting channel' };
    const answer = await describeDocument(HELD_COMMITMENT, 'res_1');
    expect(!isRefusal(answer) && 'opinion' in answer).toBe(true);
    // STRENGTHENED, and A2 :1302 as ruled: ONE row APPENDED, attributed, labelled.
    expect(store.opinions).toHaveLength(1);
    expect(store.opinions.at(0)).toMatchObject({ by: 'RESEARCHER', researcherId: 'res_1', model: 'double:DOCUMENT_DESCRIBER' });
    expect(modelCalls).toHaveLength(1);
  });

  it('a SECOND reading is APPENDED beside the first, never over it (A2 :1302 as ruled)', async () => {
    const { describeDocument } = await describe_();
    modelAnswer.value = { summary: 'first' };
    await describeDocument(HELD_COMMITMENT, 'res_1');
    modelAnswer.value = { summary: 'second' };
    await describeDocument(HELD_COMMITMENT, 'res_2');
    expect(store.opinions.map((o) => (o['body'] as { summary: string }).summary)).toEqual(['first', 'second']);
  });

  it('NOT_HELD on a sealed document — it was read once, at receipt, and never again', async () => {
    owedBy(32, "describe_document's NOT_HELD — no SEALED row exists before the intake receipt (plan :224)");
    const { describeDocument } = await describe_();
    const answer = await describeDocument(SEALED_COMMITMENT, 'res_1');
    expect(isRefusal(answer) && answer.code).toBe('NOT_HELD');
  });

  it('AWAITING_DERIVATION — an opinion attaches to a VERSION, and there is none', async () => {
    const { describeDocument } = await describe_();
    const answer = await describeDocument(AWAITING_COMMITMENT, 'res_1');
    expect(isRefusal(answer) && answer.code).toBe('AWAITING_DERIVATION');
    expect(modelCalls).toEqual([]);
  });

  it('UNSUPPORTED_TYPE on AUDIO — no model reads it, and nothing is spent (A4 :1440 as ruled)', async () => {
    const { describeDocument } = await describe_();
    const answer = await describeDocument(AUDIO_COMMITMENT, 'res_1');
    expect(isRefusal(answer) && answer.code).toBe('UNSUPPORTED_TYPE');
    expect(modelCalls).toEqual([]);
  });

  it('UNSUPPORTED_TYPE on a spreadsheet with no computed text, CARRYING THE REASON — the reader failed (A4 :1441 as ruled)', async () => {
    const { describeDocument } = await describe_();
    const answer = await describeDocument(BROKEN_SHEET_COMMITMENT, 'res_1');
    expect(isRefusal(answer) && answer.code).toBe('UNSUPPORTED_TYPE');
    expect(isRefusal(answer) && answer.error).toMatch(/reader FAILED/);
    expect(modelCalls).toEqual([]);
  });

  it('its ONE write, the opinion, goes through the transaction’s client — interaction A7 :1273, composed by flows :1223', async () => {
    // The double hands each `$transaction` callback a DISTINCT client tagged `transaction` (world.ts).
    const { describeDocument } = await describe_();
    modelAnswer.value = { summary: 'a ministry circular' };
    await describeDocument(HELD_COMMITMENT, 'res_1');
    const rows = writes.filter((write) => write.op !== '$transaction');
    // THE FLOOR: exactly the opinion — zero writes would pass the next line vacuously.
    expect(rows.map((write) => write.op)).toEqual(['documentOpinion.create']);
    expect(rows.filter((write) => write.via !== 'transaction')).toEqual([]);
  });

  it('THE SET IS CLOSED — six codes (TOO_LARGE RULED 2026-09-23 at A4 :1440)', () => {
    expect([...DESCRIBE_DOCUMENT_REFUSALS].sort()).toEqual([
      'AWAITING_DERIVATION',
      'NOT_A_DOCUMENT',
      'NOT_HELD',
      'NO_RESEARCHER',
      'TOO_LARGE',
      'UNSUPPORTED_TYPE',
    ]);
  });
});

describe('A4 :1440 as ruled 2026-09-23 — describe_document refuses TOO_LARGE above the DESCRIBER’s bound, 50 MB', () => {
  // The bound is 50 000 000 bytes — the default provider's documented inline limit for a PDF
  // (`lib/acceptedDocumentTypes.ts`, where the measurement is recorded). The door's own cap is
  // 52 428 800, so a document the door accepted can still be too large for the describer: that is
  // the world these cases stand on, and it is REACHABLE for every stored size from 50 000 001 up.
  const OVERSIZE_COMMITMENT = '0x' + 'c7'.repeat(32);
  const OVERSIZE_DOC_ID = '0x' + 'd7'.repeat(32);

  function seedOversizePdf(text: string | null): void {
    // No bucket object is seeded: the refusal comes BEFORE the bucket read, so none is needed.
    seedDocument({
      docId: OVERSIZE_DOC_ID, commitment: OVERSIZE_COMMITMENT, bytes: OVERSIZE_DOC_ID, mimeType: 'application/pdf',
      byteLength: 50_000_001, title: 'the large report',
    });
    seedArrival('res_1', OVERSIZE_COMMITMENT);
    seedVersion({ commitment: OVERSIZE_COMMITMENT, text, contentVersionHash: '0x' + 'e7'.repeat(32), derivedUnder: [CURRENT] });
  }

  it('a PDF one byte over the bound is refused TOO_LARGE, and the model is NEVER called and the bucket never read', async () => {
    seedOversizePdf(null);
    const { describeDocument } = await describe_();
    modelAnswer.value = { summary: 'must not be reached' };
    const answer = await describeDocument(OVERSIZE_COMMITMENT, 'res_1');
    expect(isRefusal(answer) && answer.code).toBe('TOO_LARGE');
    expect(isRefusal(answer) && answer.error).toMatch(/50000000/);
    expect(modelCalls).toHaveLength(0);
    expect(bucketCalls.filter((call) => call.startsWith('read '))).toEqual([]);
    expect(store.opinions).toEqual([]);
  });

  it('where the document HAS computed text, the refusal says read_document still serves it — never a silent fall-back', async () => {
    seedOversizePdf('the report’s text layer');
    const { describeDocument } = await describe_();
    const answer = await describeDocument(OVERSIZE_COMMITMENT, 'res_1');
    expect(isRefusal(answer) && answer.code).toBe('TOO_LARGE');
    expect(isRefusal(answer) && answer.error).toMatch(/read_document/);
    expect(modelCalls).toHaveLength(0);
  });

  it('a PDF EXACTLY at the bound is not refused on size — the model reads it', async () => {
    // WORLD: the object's bytes are its stored size (add_document writes `byteLength` from the object, A2 :1268).
    const bytes = new Uint8Array(50_000_000);
    const docId = nameOf(bytes);
    const commitment = '0x' + 'c8'.repeat(32);
    seedObject(docId, bytes);
    seedDocument({ docId, commitment, bytes: docId, mimeType: 'application/pdf', byteLength: bytes.length, title: 'the bound' });
    seedArrival('res_1', commitment);
    seedVersion({ commitment, text: null, contentVersionHash: docId, derivedUnder: [CURRENT] });
    const { describeDocument } = await describe_();
    modelAnswer.value = { summary: 'at the bound' };
    const answer = await describeDocument(commitment, 'res_1');
    expect(isRefusal(answer) ? answer.code : 'READ').toBe('READ');
    expect(modelCalls).toHaveLength(1);
  });

  // WHICH FILES THE BOUND APPLIES TO — A4 :1441: "A model reads an image or a PDF as its file and a
  // spreadsheet through its computed text". The bound is the model's limit on a FILE, so it binds both
  // FILE families and neither TEXT one. Both worlds are REACHABLE: the door accepts any image and any
  // XLSX/CSV up to TOO_LARGE_BYTES (52 428 800), above the describer's 50 000 000 (A4 :1404, §12 :1185).

  it('an IMAGE one byte over the bound is refused TOO_LARGE too — it goes to the model as its file', async () => {
    const commitment = '0x' + 'ca'.repeat(32);
    const docId = '0x' + 'da'.repeat(32);
    // No bucket object is seeded: the refusal comes BEFORE the bucket read.
    seedDocument({ docId, commitment, bytes: docId, mimeType: 'image/png', byteLength: 50_000_001, title: 'the large photograph' });
    seedArrival('res_1', commitment);
    seedVersion({ commitment, text: null, contentVersionHash: docId, derivedUnder: [CURRENT] });
    const { describeDocument } = await describe_();
    modelAnswer.value = { summary: 'must not be reached' };
    const answer = await describeDocument(commitment, 'res_1');
    expect(isRefusal(answer) && answer.code).toBe('TOO_LARGE');
    expect(modelCalls).toHaveLength(0);
    expect(bucketCalls.filter((call) => call.startsWith('read '))).toEqual([]);
    expect(store.opinions).toEqual([]);
  });

  it('a SPREADSHEET over the bound is NOT refused on size — the model reads its computed TEXT, once', async () => {
    const commitment = '0x' + 'cb'.repeat(32);
    const docId = '0x' + 'db'.repeat(32);
    seedDocument({ docId, commitment, bytes: docId, mimeType: SHEET.mimeType, byteLength: 50_000_001, title: 'the large workbook' });
    seedArrival('res_1', commitment);
    seedVersion({ commitment, text: '# sheet1\nthe cells of the large workbook', contentVersionHash: '0x' + 'eb'.repeat(32), derivedUnder: [CURRENT] });
    const { describeDocument } = await describe_();
    modelAnswer.value = { summary: 'a large workbook' };
    const answer = await describeDocument(commitment, 'res_1');
    expect(isRefusal(answer) ? answer.code : 'READ').toBe('READ');
    expect(modelCalls).toHaveLength(1);
    // WITH THE TEXT: the user turn carries the computed text, and the file was never read.
    expect(JSON.stringify(modelCalls.at(0))).toContain('the cells of the large workbook');
    expect(bucketCalls.filter((call) => call.startsWith('read '))).toEqual([]);
  });
});
