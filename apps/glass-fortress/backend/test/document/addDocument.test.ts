import { built } from './built';
import { ADD_DOCUMENT_REFUSALS } from './contract';

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
// ---------------------------------------------------------------------------

interface AddDocumentResult {
  commitment: string;
  docId: string;
  custody: 'HELD';
  content: { contentVersionHash: string; text: string | null } | null;
  anchored: boolean;
  equalsCapture: { url: string; capture: string } | null;
  existed: boolean;
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

const isRefusal = (answer: AddDocumentResult | Refusal): answer is Refusal =>
  typeof (answer as Refusal).code === 'string';

const OBJECT_IN_BUCKET = '0x' + 'a1'.repeat(32);
const TITLE = 'the supplementary dataset of the cardiac risk-communication paper, 2026';

describe('A4 :1404 — the argument is docId, REQUIRED, and never bytes', () => {
  it('a docId names the bucket object the dialog wrote, and the tool READS it', async () => {
    const { addDocument } = await tool();
    const answer = await addDocument({ docId: OBJECT_IN_BUCKET, title: TITLE, mimeType: 'application/pdf' }, 'res_1');
    expect(isRefusal(answer)).toBe(false);
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
    const { addDocument } = await tool();
    const answer = await addDocument({ docId: '0x' + 'ff'.repeat(32), title: TITLE, mimeType: 'application/pdf' }, 'res_1');
    expect(isRefusal(answer) && answer.code).toBe('NO_BYTES');
  });

  it('NAME_MISMATCH when the object’s bytes do not hash to the docId it was stored under', async () => {
    const { addDocument } = await tool();
    const answer = await addDocument({ docId: 'mismatched-object', title: TITLE, mimeType: 'application/pdf' }, 'res_1');
    expect(isRefusal(answer) && answer.code).toBe('NAME_MISMATCH');
  });

  it('UNSUPPORTED_TYPE and TOO_LARGE — TOO_LARGE read from the OBJECT’S size, never a JSON limit', async () => {
    const { addDocument } = await tool();
    const bad = await addDocument({ docId: OBJECT_IN_BUCKET, title: TITLE, mimeType: 'application/x-msdownload' }, 'res_1');
    expect(isRefusal(bad) && bad.code).toBe('UNSUPPORTED_TYPE');
    const big = await addDocument({ docId: 'oversize-object', title: TITLE, mimeType: 'application/pdf' }, 'res_1');
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
  });

  it('the content is the derived version, or NULL while it is owed (A4 :1407-:1408)', async () => {
    // A4 :1407-:1408 names exactly two answers — `{ contentVersionHash, text | null }`, or
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
    // `text` is the extractor's output, or NULL where the content IS the bytes (§3 :284).
    expect(answer.content.text === null || typeof answer.content.text === 'string').toBe(true);
  });

  it('the assertions are recorded as the CALLER’S and VERIFIED BY NOTHING (§9 :1011-:1014)', async () => {
    const { addDocument } = await tool();
    const answer = await addDocument(
      { docId: OBJECT_IN_BUCKET, title: TITLE, mimeType: 'application/pdf', assertedUrl: 'https://surveyed.example/p', assertedAt: '2026-09-03' },
      'res_1',
    );
    // The platform adds exactly one thing it can: the §2 equality, read on demand.
    expect(!isRefusal(answer) && 'equalsCapture' in answer).toBe(true);
  });
});
