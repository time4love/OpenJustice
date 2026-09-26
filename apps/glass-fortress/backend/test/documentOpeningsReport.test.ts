jest.mock('../src/lib/prisma', () => (require('./document/world') as typeof import('./document/world')).prismaDouble);

import { documentOpenings, formatDocumentOpenings } from '../src/services/documentOpeningsReport';
import { resetWorld, store } from './document/world';

// ---------------------------------------------------------------------------
// `forensics:document-openings` — docs/gf-document-flows.md A7 :1592 and §12 :1210–:1211; document step 34 chunk 6.
//
// "openings by custody; SHED by cause; the §2 equality" — SHED by cause is STEP 35's (plan :304, REVIEW's F1, R86 Entry 2),
// so this instrument counts the other two. COUNTS ONLY (REVIEW's suppression, R86 Entry 2): §12 asks "whether a document
// is ever public in full" and "whether the one witness the platform did not create ever appears" — measurements, which
// A7 :1592 lists nothing for, unlike commitments-owed's "owed, listed" (A7 :1560). So no output line names a document: no
// commitment, no DOC_ID, no salt, no title, no page, no capture.
//
// OVER THE DOCUMENT SUITE'S OWN WORLD (`test/document/world.ts`), which throws on a query shape it does not model. Every
// row is one the design creates: a HELD document has bytes and a title; a SEALED one a cid, `verifiedAtReceipt` and no
// bytes; an opening is in force only from a PUBLISHED attempt of a version citing the document (Q9, Q14); a snapshot
// stores its `documentHash` as BARE hex while a DOC_ID is displayed `0x`-prefixed (documentPredicates :260–:267).
// ---------------------------------------------------------------------------

const at = (day: number): Date => new Date(Date.UTC(2026, 8, day));
const hex = (pair: string): string => pair.repeat(32);

/** A document of the given custody — `n` names it; every value planted so the NOT list can sweep for it. */
function doc(n: string, custody: 'HELD' | 'SEALED'): { commitment: string; docId: string; title: string } {
  const commitment = `0x${hex(`c${n}`)}`;
  const docId = `0x${hex(`d${n}`)}`;
  const title = `כותרת-מסמך-${n}`;
  store.documents.push({
    docId,
    commitment,
    salt: Buffer.from(hex(`5${n}`), 'hex'),
    cid: custody === 'SEALED' ? `bafy-sealed-${n}` : null,
    bytes: custody === 'HELD' ? docId : null,
    verifiedAtReceipt: custody === 'SEALED' ? at(10) : null,
    mimeType: 'application/pdf',
    byteLength: 1,
    title,
  });
  return { commitment, docId, title };
}

/** Thesis `t` cites `commitment` on version `v`, published on `publishedDay`; its decisions as given (sequence, opening, day). */
function citedAndPublished(t: string, v: string, commitment: string, publishedDay: number, decisions: [number, string, number][]): void {
  store.mentions.push({ versionId: v, kind: 'DOCUMENT', name: commitment, thesisVersion: { thesisId: t } });
  store.attempts.push({ id: `a-${v}`, thesisId: t, versionId: v, outcome: 'PUBLISHED', createdAt: at(publishedDay) });
  for (const [sequence, opening, day] of decisions) {
    store.openings.push({ id: `d-${t}-${commitment}-${String(sequence)}`, thesisId: t, commitment, sequence, opening, researcherId: 'res_1', createdAt: at(day) });
  }
}

beforeEach(() => resetWorld());

describe('forensics:document-openings — openings by custody (§12 :1211), read through `openingsOf`', () => {
  it('B17a every document counted ONCE under its custody and the opening IN FORCE — a decision after the last publication opens nothing yet (Q14)', async () => {
    const heldContent = doc('1', 'HELD');
    const sealedPassage = doc('2', 'SEALED');
    doc('3', 'HELD'); // cited by nothing, never opened
    const heldLate = doc('4', 'HELD');
    citedAndPublished('th_1', 'v1', heldContent.commitment, 21, [[1, 'CONTENT', 20]]);
    citedAndPublished('th_2', 'v2', sealedPassage.commitment, 21, [[1, 'PASSAGE', 20]]);
    // Decided the day AFTER the only publication — in force from the NEXT publication of a version citing it (A4 :1444).
    citedAndPublished('th_3', 'v3', heldLate.commitment, 21, [[1, 'CONTENT', 22]]);

    const report = await documentOpenings();
    expect(report.documents).toBe(4);
    expect(report.byCustody).toEqual({
      HELD: { PASSAGE: 0, CONTENT: 1, BYTES: 0, NOT_OPENED: 2 },
      SEALED: { PASSAGE: 1, CONTENT: 0, BYTES: 0, NOT_OPENED: 0 },
      NONE: { PASSAGE: 0, CONTENT: 0, BYTES: 0, NOT_OPENED: 0 },
    });
  });

  it('B17a zero documents is an ANSWER — every cell printed at zero, never an empty report', async () => {
    const report = await documentOpenings();
    expect(report.documents).toBe(0);
    expect(report.equalsCapture).toBe(0);
    const text = formatDocumentOpenings(report);
    expect(text).toContain('document-openings: 0 documents');
    // ALWAYS PRINTED, zero included: a line that appears only when non-zero cannot be told from one never written
    // (commitmentsOwed :102's rule).
    for (const custody of ['HELD', 'SEALED', 'NONE']) expect(text).toMatch(new RegExp(`${custody}\\s+PASSAGE 0 · CONTENT 0 · BYTES 0 · not opened 0`));
    expect(text).toContain('the §2 equality: 0 of 0 documents');
  });
});

describe('forensics:document-openings — the §2 equality (§12 :1210; §4 :440–:442), through `equalsCapture`', () => {
  it('B17b a HELD document whose DOC_ID equals a snapshot’s BARE-hex documentHash counts ONE; a document with no equal capture counts none', async () => {
    const equal = doc('1', 'HELD');
    doc('2', 'HELD');
    store.trackedUrls.push({ id: 'page-1', url: 'https://www.health.gov.il/circular' });
    // Stored BARE — the digest `UrlSnapshot.documentHash` holds (evidenceIdentity :46) — while the DOC_ID reads `0x…`.
    store.snapshots.push({ id: 'snap-1', trackedUrlId: 'page-1', waybackTimestamp: '20220805053301', documentHash: equal.docId.slice(2) });
    // A snapshot the archive never named carries no capture, and is no witness.
    store.snapshots.push({ id: 'snap-2', trackedUrlId: 'page-1', waybackTimestamp: null, documentHash: hex('99') });

    const report = await documentOpenings();
    expect(report.documents).toBe(2);
    expect(report.equalsCapture).toBe(1);
    expect(formatDocumentOpenings(report)).toContain('the §2 equality: 1 of 2 documents');
  });
});

describe('forensics:document-openings — COUNTS ONLY: no line names a document (REVIEW’s suppression, R86 Entry 2; §7 :765–:770)', () => {
  it('B17c the printed report carries no DOC_ID, commitment, salt, title, page or capture — every planted value swept for', async () => {
    const planted = [doc('1', 'HELD'), doc('2', 'SEALED'), doc('3', 'HELD')];
    citedAndPublished('th_1', 'v1', planted[0].commitment, 21, [[1, 'CONTENT', 20]]);
    citedAndPublished('th_2', 'v2', planted[1].commitment, 21, [[1, 'PASSAGE', 20]]);
    store.trackedUrls.push({ id: 'page-1', url: 'https://www.health.gov.il/circular' });
    store.snapshots.push({ id: 'snap-1', trackedUrlId: 'page-1', waybackTimestamp: '20220805053301', documentHash: planted[0].docId.slice(2) });

    const text = formatDocumentOpenings(await documentOpenings());
    // THE FLOOR: the report measured this world — three documents, one opening of each kind that was planted, one equal.
    expect(text).toContain('document-openings: 3 documents');
    expect(text).toContain('the §2 equality: 1 of 3 documents');

    const values = planted.flatMap((d) => [d.docId, d.docId.slice(2), d.commitment, d.commitment.slice(2), d.title]);
    const salts = store.documents.map((row) => (row['salt'] as Buffer).toString('hex'));
    const lowered = text.toLowerCase();
    for (const value of [...values, ...salts, 'https://www.health.gov.il/circular', '20220805053301']) {
      expect(lowered).not.toContain(value.toLowerCase());
    }
    // And no 64-hex run at all — the shape every hash and every salt has, whichever one a future line would print.
    expect(text).not.toMatch(/[0-9a-f]{64}/i);
  });
});
