import { CURRENT_EXTRACTOR } from '../../src/lib/documentExtractor';
import { store, type Row } from '../helpers/evidenceDouble';

// ---------------------------------------------------------------------------
// A CITED DOCUMENT IN THE EVIDENCE DOUBLE'S WORLD — document step 33.
//
// The citation, the debate and the gap run over the THESIS and EVIDENCE tables, so their document cases stand on
// `test/helpers/evidenceDouble.ts` (its four document tables, additive, R81 Q1) rather than on this suite's own
// `world.ts`, which models the receipt's tables and none of the thesis's. These are the rows such a case seeds — ONE
// spelling of a document row for the gating unit cases and for this suite's amended ones alike.
//
// Every row is a world the design creates: a HELD document has bytes and a title (the CHECK
// `Document_title_required_when_held`), a SEALED one a cid, `verifiedAtReceipt` and its AT_RECEIPT version (§2
// :158–:162 — `currentVersion` refuses a sealed row without it).
// ---------------------------------------------------------------------------

export const COMMITMENT = `0x${'c1'.repeat(32)}`;
export const OTHER_COMMITMENT = `0x${'c2'.repeat(32)}`;
/** CURRENT(d) of the held document `seedHeld` writes. */
export const HELD_NOW = `0x${'b1'.repeat(32)}`;
/** An older version of it, derived under an extractor that is no longer current. */
export const HELD_BEFORE = `0x${'b0'.repeat(32)}`;
/** The sealed document's AT_RECEIPT version. */
export const RECEIPT = `0x${'a1'.repeat(32)}`;
export const TITLE = 'חוזר המנכ״ל';

export const documentRow = (over: Row = {}): Row => ({
  docId: `0x${'d1'.repeat(32)}`,
  commitment: COMMITMENT,
  salt: Buffer.alloc(32),
  cid: null,
  bytes: `0x${'d1'.repeat(32)}`,
  mimeType: 'application/pdf',
  byteLength: 1024,
  receivedAt: new Date(Date.UTC(2026, 8, 20)),
  verifiedAtReceipt: null,
  assertedUrl: null,
  assertedAt: null,
  derivedFromCommitment: null,
  title: TITLE,
  createdAt: new Date(Date.UTC(2026, 8, 20)),
  ...over,
});

export const SEALED: Row = { bytes: null, cid: 'bafy-sealed', verifiedAtReceipt: new Date(Date.UTC(2026, 8, 20)) };

export const versionRow = (contentVersionHash: string, over: Row = {}): Row => ({
  id: `dcv-${contentVersionHash.slice(2, 8)}`,
  commitment: COMMITMENT,
  text: 'הטקסט המחושב',
  contentVersionHash,
  extractor: 'pdf',
  extractorVersion: CURRENT_EXTRACTOR,
  derivedUnder: [CURRENT_EXTRACTOR],
  readFailed: false,
  derivedAt: new Date(Date.UTC(2026, 8, 20)),
  derivedFrom: 'HELD_BYTES',
  ...over,
});

/** A HELD document whose CURRENT(d) is HELD_NOW, beside an older version that is no longer current. */
export function seedHeld(): void {
  store.documents = [documentRow()];
  store.documentContentVersions = [
    versionRow(HELD_BEFORE, { derivedUnder: ['v0-an-older-extractor'], extractorVersion: 'v0-an-older-extractor' }),
    versionRow(HELD_NOW),
  ];
}

/** A SEALED document and its AT_RECEIPT version — derived under an extractor that is not today's, and current forever. */
export function seedSealed(): void {
  store.documents = [documentRow(SEALED)];
  store.documentContentVersions = [
    versionRow(RECEIPT, { derivedFrom: 'AT_RECEIPT', derivedUnder: ['v0-the-receipt-extractor'], extractorVersion: 'v0-the-receipt-extractor' }),
  ];
}

/** A promoted document's Evidence row — `fileHash = commitment` (§6 :669), the key the version write's pin reads. */
export function seedPromoted(affirmed: string): void {
  store.evidenceRows = [
    { fileHash: COMMITMENT, kind: 'DOCUMENT', documentCommitment: COMMITMENT, status: 'PROMOTED', affirmedContentVersionHash: affirmed },
  ];
}
