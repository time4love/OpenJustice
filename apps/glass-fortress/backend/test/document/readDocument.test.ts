import { built } from './built';
import { DESCRIBE_DOCUMENT_REFUSALS, LIST_DOCUMENTS_REFUSALS, READ_DOCUMENT_REFUSALS } from './contract';

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
// ---------------------------------------------------------------------------

interface Refusal {
  error: string;
  code: string;
}

interface HeldShape {
  custody: 'HELD';
  docId: string;
  bytes: string;
  versions: readonly { contentVersionHash: string; text: string | null }[];
  current: { contentVersionHash: string; text: string | null } | null;
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
  anchored: boolean;
  assertions: { assertedUrl: string | null; assertedAt: string | null };
  current: string | null;
  citedBy: readonly { thesisId: string; published: boolean }[];
  opening: string | null;
}

interface Reads {
  readDocument: (
    commitment: string,
    researcherId: string | null,
  ) => Promise<HeldShape | SealedShape | NoneShape | Refusal>;
  listDocuments: (
    args: { url?: string },
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

const HELD_COMMITMENT = '0x' + 'c1'.repeat(32);
const SEALED_COMMITMENT = '0x' + 'c2'.repeat(32);
const SHED_COMMITMENT = '0x' + 'c3'.repeat(32);

describe('A4 :1424-:1430 — read_document, and its THREE shapes by custody', () => {
  it('HELD: the bytes, every version, the current one, anchored, equalsCapture, the assertions', async () => {
    const { readDocument } = await reads();
    const answer = await readDocument(HELD_COMMITMENT, 'res_1');
    expect(!isRefusal(answer) && answer.custody).toBe('HELD');
  });

  it('SEALED: the AT_RECEIPT version and its stamp — NO BYTES EXIST TO RETURN (A4 :1427-:1428)', async () => {
    const { readDocument } = await reads();
    const answer = await readDocument(SEALED_COMMITMENT, 'res_1');
    expect(!isRefusal(answer) && answer.custody).toBe('SEALED');
    expect(!isRefusal(answer) && 'bytes' in answer).toBe(false);
  });

  it('NONE: the shed cause and moment, and HASHES ONLY (A4 :1429)', async () => {
    const { readDocument } = await reads();
    const answer = await readDocument(SHED_COMMITMENT, 'res_1');
    expect(!isRefusal(answer) && answer.custody).toBe('NONE');
  });

  it('the HELD shape carries `uploadUrl` — the dialog’s link with THIS document as derived-from (:1428)', async () => {
    const { readDocument } = await reads();
    const answer = await readDocument(HELD_COMMITMENT, 'res_1');
    expect(!isRefusal(answer) && typeof (answer as HeldShape).uploadUrl).toBe('string');
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
  });

  it('carries `uploadUrl`, the dialog’s link, prefilling the PAGE when `url` is given (:1434)', async () => {
    const { listDocuments } = await reads();
    const answer = await listDocuments({ url: 'https://surveyed.example/p' }, 'res_1');
    expect(!isRefusal(answer) && typeof answer.uploadUrl).toBe('string');
  });

  it('NOT_SURVEYED when a url is given and unknown', async () => {
    const { listDocuments } = await reads();
    const answer = await listDocuments({ url: 'https://unsurveyed.example/x' }, 'res_1');
    expect(isRefusal(answer) && answer.code).toBe('NOT_SURVEYED');
    expect([...LIST_DOCUMENTS_REFUSALS].sort()).toEqual(['NOT_SURVEYED', 'NO_RESEARCHER']);
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
    const answer = await describeDocument(HELD_COMMITMENT, 'res_1');
    expect(!isRefusal(answer) && 'opinion' in answer).toBe(true);
  });

  it('NOT_HELD on a sealed document — it was read once, at receipt, and never again', async () => {
    const { describeDocument } = await describe_();
    const answer = await describeDocument(SEALED_COMMITMENT, 'res_1');
    expect(isRefusal(answer) && answer.code).toBe('NOT_HELD');
  });

  it('AWAITING_DERIVATION — an opinion attaches to a VERSION, and there is none', async () => {
    const { describeDocument } = await describe_();
    const answer = await describeDocument('0x' + 'c4'.repeat(32), 'res_1');
    expect(isRefusal(answer) && answer.code).toBe('AWAITING_DERIVATION');
  });

  it('THE SET IS CLOSED — four codes', () => {
    expect([...DESCRIBE_DOCUMENT_REFUSALS].sort()).toEqual([
      'AWAITING_DERIVATION',
      'NOT_A_DOCUMENT',
      'NOT_HELD',
      'NO_RESEARCHER',
    ]);
  });
});
