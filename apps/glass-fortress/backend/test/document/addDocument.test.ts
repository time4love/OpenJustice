jest.mock('../../src/lib/prisma', () => (require('./world') as typeof import('./world')).prismaDouble);
jest.mock('../../src/services/documentBucket', () => (require('./world') as typeof import('./world')).bucketDouble);
jest.mock('../../src/factories/LLMFactory', () => (require('./world') as typeof import('./world')).llmDouble);

import { built } from './built';
import { ADD_DOCUMENT_REFUSALS } from './contract';
import {
  bucketCalls,
  fixture,
  modelCalls,
  nameOf,
  resetWorld,
  seedObject,
  seedResearcher,
  seedSnapshot,
  seedTrackedUrl,
  store,
  writes,
} from './world';

// ---------------------------------------------------------------------------
// A4 :1404-:1411 and §9 :998-:1017 — THE RESEARCHER'S DOOR. This is the round's centre.
//
// THE ARGUMENT IS `docId`, REQUIRED, AND NEVER `bytes` — RULED 2026-09-23 (the researcher)
// at A4 :1404: *"THERE IS NO PASTE. THE `text` ARM IS RETIRED: the argument is `docId`,
// REQUIRED — the bucket object the upload dialog wrote — and there is no second arm, so
// `TOO_LARGE` is read from the object's size in every case and every HELD document has a
// bucket key."*
//
// THE REASONING THAT SURVIVES THE RULING, because it is what made the dialog necessary in
// the first place: claude.ai cannot hand a file to an MCP tool, so the UPLOAD DIALOG puts
// the bytes in the bucket and the TOOL CALL NAMES THE OBJECT. The tool READS the object; it
// never receives bytes — so the backend's 20 MB JSON limit is irrelevant on the way in and
// TOO_LARGE is read from the OBJECT'S OWN SIZE. What the ruling changed is that this is now
// true of EVERY call rather than of one arm out of two: with no second arm there is no path
// into the corpus that skips the dialog, so `bytes` is ALWAYS a bucket key, and custody
// (A2 :1274), the HELD invariant (A2 :1276) and `document-recomputable` each have ONE shape
// instead of two.
//
// THIS FILE WAS WRITTEN TO THE SUPERSEDED RULING OF 2026-09-22 and kept specifying the
// two-armed argument after PR #573 retired the paste — because that commit was DOCS-ONLY,
// and `gf-refactor-plan.md` §4 rule 1 ("a test asserting a retired concept is deleted in
// the commit that retires the concept") was therefore not honoured. §4 rule 4 makes that
// dangerous rather than untidy: the acceptance suite is written first FROM THE CONTRACT, so
// a developer opening step 30 and turning this file green would have built the retired arm
// — correctly by the file and wrongly by the ruling.
//
// `title` IS REQUIRED (A2 :1271, A4 :1404) — the fourth assertion, the name a person
// recognises the document by, proposed by Claude and approved by the researcher IN THE
// CONVERSATION, carried by the link and by the command, NEVER edited in the dialog.
//
// THE COMMITMENT IS OWED BY CONSTRUCTION AT THIS STEP (plan :179-:180): step 31 builds
// what pays it, so every document this step receives is owed and EVERY READ SAYS SO.
//
// THE WORLD — GIVEN AT STEP 30 (R76, REVIEW's finding 1). Step 27 wrote these cases with no
// world at all: nothing in a bucket, no page surveyed, no database. `./world.ts` supplies
// one, and each case below says which clause makes its world REACHABLE. The two magic keys
// step 27 used — `'mismatched-object'` and `'oversize-object'` — were not DOC_IDs, and a
// correct implementation refuses a key that is not a DOC_ID as NO_BYTES before it reads
// anything, so those cases could not demand what their titles say. They are VALID docIds
// now, holding the bytes their titles describe.
// ---------------------------------------------------------------------------

interface Assertions {
  title: string | null;
  assertedUrl: string | null;
  assertedAt: string | null;
  derivedFrom: { commitment: string; title: string | null } | null;
}

interface AddDocumentResult {
  commitment: string;
  docId: string;
  custody: 'HELD';
  /** A4 :1407-:1409 as ruled 2026-09-23 — the RECEIPT: the content's hash, never its text. */
  content: { contentVersionHash: string } | null;
  anchored: boolean;
  equalsCapture: { url: string; capture: string } | null;
  existed: boolean;
  /** A4 :1409 as ruled 2026-09-23 — the STORED assertions. */
  assertions: Assertions;
  /** A4 :1409 as ruled — every value the call gave that differs, NEVER stored. */
  ignored: Record<string, string>;
}

interface Refusal {
  error: string;
  code: string;
}

interface AddDocumentArgs {
  docId?: string;
  title?: string;
  mimeType?: string;
  assertedUrl?: string;
  assertedAt?: string;
  derivedFrom?: string;
}

interface Tool {
  addDocument: (args: AddDocumentArgs, researcherId: string | null) => Promise<AddDocumentResult | Refusal>;
}

const tool = () => built<Tool>('services/addDocument');

interface Read {
  readDocument: (commitment: string, researcherId: string | null) => Promise<{ equalsCapture: { url: string; capture: string } | null } | Refusal>;
}

const read = () => built<Read>('services/readDocument');

/** The writes a call made, the `$transaction` marker aside — each tagged with the client it went through. */
const rowWrites = () => writes.filter((write) => write.op !== '$transaction');

const isRefusal = <T>(answer: T | Refusal): answer is Refusal => typeof (answer as Refusal).code === 'string';

/** The committed text-layer PDF under its REAL name — the object the dialog wrote (§9 :998). */
const PDF = fixture('PDF_TEXT_LAYER');
const OBJECT_IN_BUCKET = PDF.docId;
const TITLE = 'the supplementary dataset of the cardiac risk-communication paper, 2026';

beforeEach(() => {
  resetWorld();
  seedObject(OBJECT_IN_BUCKET, PDF.bytes);
  seedTrackedUrl('https://surveyed.example/p');
});

describe('A4 :1404 — the argument is docId, REQUIRED, and never bytes', () => {
  it('a docId names the bucket object the dialog wrote, and the tool READS it', async () => {
    const { addDocument } = await tool();
    const answer = await addDocument({ docId: OBJECT_IN_BUCKET, title: TITLE, mimeType: 'application/pdf' }, 'res_1');
    expect(isRefusal(answer)).toBe(false);
    // STRENGTHENED: it READ the object under that key. (The PDF's TEXT is not asserted here:
    // `pdfjs-dist` is ESM-only and no jest project can load it — the process-level test over
    // `dist/`, `test/documentPdfProcess.test.ts`, is where the reader's output is held.)
    expect(bucketCalls).toContain(`read ${OBJECT_IN_BUCKET}`);
  });

  // TWO CASES WERE DELETED HERE, NOT REWRITTEN — §4 rule 1, in the rule's own words: a test
  // asserting a retired concept is DELETED, "never modified to pass". They were "a paste
  // arrives as TEXT in the call and needs no dialog" and "BOTH is a refusal — exactly one".
  // The first asserted the retired arm directly. The second could only exist while there
  // were two arms to conflict; with one, there is nothing for a second to conflict with, and
  // rewriting it would have been a case invented to fill a gap the ruling closed.

  it('a call with NO docId is NO_BYTES — the REQUIRED-argument case', async () => {
    // It was "NEITHER is NO_BYTES" while the argument was one of two. Under the ruling there
    // is no "neither": `docId` is REQUIRED, so its absence is the whole of the refusal, and
    // `NO_BYTES` covers it exactly as it covers a `docId` naming no object (A4 :1404). The
    // code does not move; what it means does.
    const { addDocument } = await tool();
    const answer = await addDocument({ title: TITLE, mimeType: 'application/pdf' }, 'res_1');
    expect(isRefusal(answer) && answer.code).toBe('NO_BYTES');
  });

  it('a `bytes` argument is NOT part of the contract — the tool never receives bytes', async () => {
    const { addDocument } = await tool();
    const answer = await addDocument({ title: TITLE, mimeType: 'application/pdf' } as AddDocumentArgs, 'res_1');
    expect(isRefusal(answer) && answer.code).toBe('NO_BYTES');
  });
});

describe('A4 :1404 / A2 :1271 — `title` is REQUIRED and NO_TITLE is refused', () => {
  it('a call with no title refuses NO_TITLE', async () => {
    const { addDocument } = await tool();
    const answer = await addDocument({ docId: OBJECT_IN_BUCKET, mimeType: 'application/pdf' }, 'res_1');
    expect(isRefusal(answer) && answer.code).toBe('NO_TITLE');
  });

  it('a BLANK title refuses NO_TITLE — a name nobody recognises is not a name', async () => {
    const { addDocument } = await tool();
    const answer = await addDocument({ docId: OBJECT_IN_BUCKET, title: '   ', mimeType: 'application/pdf' }, 'res_1');
    expect(isRefusal(answer) && answer.code).toBe('NO_TITLE');
  });
});

describe('A4 :1410-:1411 — the WHOLE refusal set, closed', () => {
  it('NO_RESEARCHER without one in context — every write is attributed', async () => {
    const { addDocument } = await tool();
    const answer = await addDocument({ docId: OBJECT_IN_BUCKET, title: TITLE, mimeType: 'application/pdf' }, null);
    expect(isRefusal(answer) && answer.code).toBe('NO_RESEARCHER');
  });

  it('NO_BYTES covers a docId naming NO OBJECT (A4 :1404) — not a missing argument alone', async () => {
    // WORLD: a well-formed DOC_ID under which the dialog wrote nothing — the upload never
    // happened, or the sweep took it (§9 :998).
    const { addDocument } = await tool();
    const answer = await addDocument({ docId: '0x' + 'ff'.repeat(32), title: TITLE, mimeType: 'application/pdf' }, 'res_1');
    expect(isRefusal(answer) && answer.code).toBe('NO_BYTES');
  });

  it('NAME_MISMATCH when the object’s bytes do not hash to the docId it was stored under', async () => {
    // WORLD: a VALID docId whose object holds OTHER bytes. REACHABLE: a signed upload URL
    // checks no content (ui A1 :1129's route mints a URL, not a checksum), so a wrong client
    // can put any bytes under any key. `NAME_MISMATCH` is the check that catches it (§9 :998).
    const { addDocument } = await tool();
    const key = nameOf(new TextEncoder().encode('the bytes the browser hashed'));
    seedObject(key, PDF.bytes);
    const answer = await addDocument({ docId: key, title: TITLE, mimeType: 'application/pdf' }, 'res_1');
    expect(isRefusal(answer) && answer.code).toBe('NAME_MISMATCH');
    // STRENGTHENED: a refusal writes nothing.
    expect(writes).toEqual([]);
  });

  it('UNSUPPORTED_TYPE and TOO_LARGE — TOO_LARGE read from the OBJECT’S size, never a JSON limit', async () => {
    const { addDocument } = await tool();
    const bad = await addDocument({ docId: OBJECT_IN_BUCKET, title: TITLE, mimeType: 'application/x-msdownload' }, 'res_1');
    expect(isRefusal(bad) && bad.code).toBe('UNSUPPORTED_TYPE');
    // WORLD: a valid docId whose OBJECT is one byte over the cap. REACHABLE: the storage limit
    // lands with the bucket's migration (chunk 3), and until then — and on any bucket whose
    // limit is wrong — only the object's own size tells (A4 :1404, "read from the object's size").
    const oversize = new Uint8Array(52_428_801);
    const key = nameOf(oversize);
    seedObject(key, oversize);
    const big = await addDocument({ docId: key, title: TITLE, mimeType: 'application/pdf' }, 'res_1');
    expect(isRefusal(big) && big.code).toBe('TOO_LARGE');
  });

  it('NOT_SURVEYED when assertedUrl names a page with no TrackedUrl — survey it first (§9 :1004-:1005)', async () => {
    const { addDocument } = await tool();
    const answer = await addDocument(
      { docId: OBJECT_IN_BUCKET, title: TITLE, mimeType: 'application/pdf', assertedUrl: 'https://unsurveyed.example/x' },
      'res_1',
    );
    expect(isRefusal(answer) && answer.code).toBe('NOT_SURVEYED');
  });

  it('NOT_A_DOCUMENT when derivedFrom names no document (A4 :1411)', async () => {
    const { addDocument } = await tool();
    const answer = await addDocument(
      { docId: OBJECT_IN_BUCKET, title: TITLE, mimeType: 'application/pdf', derivedFrom: '0x' + 'dd'.repeat(32) },
      'res_1',
    );
    expect(isRefusal(answer) && answer.code).toBe('NOT_A_DOCUMENT');
  });

  it('THE SET IS CLOSED — eight codes, and a ninth would be a refusal nobody ruled', () => {
    expect([...ADD_DOCUMENT_REFUSALS].sort()).toEqual([
      'NAME_MISMATCH',
      'NOT_A_DOCUMENT',
      'NOT_SURVEYED',
      'NO_BYTES',
      'NO_RESEARCHER',
      'NO_TITLE',
      'TOO_LARGE',
      'UNSUPPORTED_TYPE',
    ]);
  });
});

describe('A4 :1407-:1409 — what the tool RETURNS, and what it says about the debt', () => {
  it('custody is HELD, always, at the researcher’s door (§2 :163)', async () => {
    const { addDocument } = await tool();
    const answer = await addDocument({ docId: OBJECT_IN_BUCKET, title: TITLE, mimeType: 'application/pdf' }, 'res_1');
    expect(!isRefusal(answer) && answer.custody).toBe('HELD');
  });

  it('ANCHORED IS FALSE AT THIS STEP, BY CONSTRUCTION — step 31 builds what pays it (plan :179-:180)', async () => {
    const { addDocument } = await tool();
    const answer = await addDocument({ docId: OBJECT_IN_BUCKET, title: TITLE, mimeType: 'application/pdf' }, 'res_1');
    expect(!isRefusal(answer) && answer.anchored).toBe(false);
  });

  it('a SECOND arrival of the SAME bytes answers existed: true — one Document, two Arrivals (§2 :211)', async () => {
    const { addDocument } = await tool();
    const first = await addDocument({ docId: OBJECT_IN_BUCKET, title: TITLE, mimeType: 'application/pdf' }, 'res_1');
    const second = await addDocument({ docId: OBJECT_IN_BUCKET, title: TITLE, mimeType: 'application/pdf' }, 'res_1');
    expect(!isRefusal(first) && first.existed).toBe(false);
    expect(!isRefusal(second) && second.existed).toBe(true);
    expect(!isRefusal(first) && !isRefusal(second) && first.commitment === second.commitment).toBe(true);
    // STRENGTHENED: the counts the title names — ONE Document, TWO Arrivals.
    expect(store.documents).toHaveLength(1);
    expect(store.arrivals).toHaveLength(2);
  });

  it('a later arrival’s DIFFERING assertions are answered IGNORED and never stored (A4 :1409, A2 :1271 as ruled)', async () => {
    // WORLD: a second researcher uploads the same bytes under another title and page — reachable
    // because the name is the bytes' hash, so the same file IS the same document (§2 :211).
    const { addDocument } = await tool();
    seedTrackedUrl('https://other.example/q');
    await addDocument({ docId: OBJECT_IN_BUCKET, title: TITLE, mimeType: 'application/pdf' }, 'res_1');
    const second = await addDocument(
      { docId: OBJECT_IN_BUCKET, title: 'another name', mimeType: 'application/pdf', assertedUrl: 'https://other.example/q' },
      'res_2',
    );
    if (isRefusal(second)) throw new Error(`expected a document, got ${second.code}`);
    expect(second.existed).toBe(true);
    expect(second.assertions.title).toBe(TITLE);
    expect(second.assertions.assertedUrl).toBeNull();
    expect(second.ignored).toEqual({ title: 'another name', assertedUrl: 'https://other.example/q' });
    // NEVER STORED: the row still carries the first arrival's.
    expect(store.documents.at(0)?.['title']).toBe(TITLE);
  });

  it('the content is the derived version, or NULL while it is owed (A4 :1407-:1409)', async () => {
    // A4 :1407-:1409 names exactly two answers — `{ contentVersionHash }` (the RECEIPT, as ruled 2026-09-23), or
    // `null` while the derivation is owed — and this case now asserts THOSE, over a `docId`.
    // It used to call the tool with a pasted string and assert the content came back equal
    // to it, which under the ruling is a world that cannot exist: EVERY document is a bucket
    // object, so the content comes from the EXTRACTOR reading those bytes and never from the
    // call. A caller cannot hand the platform the text of its own document — that is the
    // COMPUTED register's whole line (§3 :299-:305).
    const { addDocument } = await tool();
    const answer = await addDocument({ docId: OBJECT_IN_BUCKET, title: TITLE, mimeType: 'application/pdf' }, 'res_1');
    if (isRefusal(answer)) throw new Error(`expected a document, got ${answer.code}`);
    if (answer.content === null) return; // AWAITING_DERIVATION — the second arm, and an answer.
    expect(typeof answer.content.contentVersionHash).toBe('string');
  });

  it('THE ANSWER IS THE RECEIPT — `content` carries the hash and NO text (A4 :1409 as ruled 2026-09-23, F1 ruling 1)', async () => {
    // WORLD: a spreadsheet — the family whose computed text blew the client's result cap on staging
    // (`docs/gf-document-step-30-staging-exercise-2026-09-23.md` §4 F1) — uploaded through the dialog.
    const sheet = fixture('SPREADSHEET');
    seedObject(sheet.docId, sheet.bytes);
    const { addDocument } = await tool();
    const answer = await addDocument({ docId: sheet.docId, title: TITLE, mimeType: sheet.mimeType }, 'res_1');
    if (isRefusal(answer)) throw new Error(`expected a document, got ${answer.code}`);
    // THE FLOOR: a text WAS derived and stored — a document with none would pass the next lines vacuously.
    const stored = store.versions.at(0)?.['text'];
    expect(typeof stored === 'string' && stored.length > 0).toBe(true);
    expect(answer.content === null ? null : Object.keys(answer.content)).toEqual(['contentVersionHash']);
    expect(JSON.stringify(answer)).not.toContain(String(stored));
  });

  it('the assertions are recorded as the CALLER’S and VERIFIED BY NOTHING (§9 :1011-:1014)', async () => {
    const { addDocument } = await tool();
    const answer = await addDocument(
      { docId: OBJECT_IN_BUCKET, title: TITLE, mimeType: 'application/pdf', assertedUrl: 'https://surveyed.example/p', assertedAt: '2026-09-03' },
      'res_1',
    );
    // The platform adds exactly one thing it can: the §2 equality, read on demand.
    expect(!isRefusal(answer) && 'equalsCapture' in answer).toBe(true);
    // STRENGTHENED: recorded as given, attributed through the arrival, and no model read them.
    expect(!isRefusal(answer) && answer.assertions.assertedUrl).toBe('https://surveyed.example/p');
    expect(store.arrivals.at(0)?.['researcherId']).toBe('res_1');
    expect(modelCalls).toEqual([]);
  });
});

describe('interaction A7 :1273 — "every write tool is one transaction", composed by document flows :1223', () => {
  // THE DOUBLE HANDS EACH `$transaction` CALLBACK A DISTINCT CLIENT TAGGED `transaction`, so a
  // write made through the global `prisma` while the transaction is open is logged as the write
  // OUTSIDE it that it is (`world.ts`; R76 and R77 REVIEW moved each write out and 0 cases reddened).

  it('the FIRST arrival writes the Document, the Arrival and the version ALL through the transaction’s client', async () => {
    const { addDocument } = await tool();
    await addDocument({ docId: OBJECT_IN_BUCKET, title: TITLE, mimeType: 'application/pdf' }, 'res_1');
    // THE FLOOR: the five writes the first arrival makes — zero would pass the next line vacuously. DECLARED EDIT, step 34
    // chunk 5-0 (the researcher's Q-R1): the version's first DocumentContentDerivation row joins it, in the same transaction.
    expect(rowWrites().map((write) => write.op)).toEqual([
      'document.create',
      'arrival.create',
      'arrivalDocument.create',
      'documentContentVersion.create',
      'documentContentDerivation.create',
    ]);
    expect(rowWrites().filter((write) => write.via !== 'transaction')).toEqual([]);
  });

  it('a SECOND arrival writes its Arrival through the transaction’s client too (§2 :211)', async () => {
    const { addDocument } = await tool();
    await addDocument({ docId: OBJECT_IN_BUCKET, title: TITLE, mimeType: 'application/pdf' }, 'res_1');
    writes.length = 0;
    await addDocument({ docId: OBJECT_IN_BUCKET, title: TITLE, mimeType: 'application/pdf' }, 'res_2');
    // THE FLOOR: the second arrival's two writes (its version is already CURRENT, so none is derived).
    expect(rowWrites().map((write) => write.op)).toEqual(['arrival.create', 'arrivalDocument.create']);
    expect(rowWrites().filter((write) => write.via !== 'transaction')).toEqual([]);
  });
});

describe('A3 :1383-:1384 — EQUALS_CAPTURE over a snapshot as its WRITER stores it', () => {
  it('a snapshot whose documentHash is the file’s digest in BARE hex is answered by add_document AND read_document', async () => {
    // WORLD: the walk stored a capture whose bytes ARE this PDF — `documentHash` bare hex, as
    // `lib/evidenceIdentity.ts` :46-:47 stores it — and a researcher uploads the same file. The
    // DOC_ID is `0x`-prefixed (A1 :1244): only a comparison of DIGESTS, in the predicate AND in
    // the query that feeds it, can see the two are one.
    const page = store.trackedUrls.at(0);
    if (page === undefined) throw new Error('the world seeds a surveyed page');
    seedSnapshot(page, PDF.docId.slice(2), '20220805053301');
    // The researcher the arrival names — `Arrival.researcherId` is a foreign key, so an arrival by a
    // researcher with no row is a world no writer creates (read_document resolves each arrival's handle).
    seedResearcher('res_1', 'researcher-one');
    const { addDocument } = await tool();
    const added = await addDocument({ docId: OBJECT_IN_BUCKET, title: TITLE, mimeType: 'application/pdf' }, 'res_1');
    if (isRefusal(added)) throw new Error(`expected a document, got ${added.code}`);
    const witness = { url: 'https://surveyed.example/p', capture: '20220805053301' };
    expect(added.equalsCapture).toEqual(witness);
    const { readDocument } = await read();
    const held = await readDocument(added.commitment, 'res_1');
    if (isRefusal(held)) throw new Error(`expected a document, got ${held.code}`);
    expect(held.equalsCapture).toEqual(witness);
  });
});
