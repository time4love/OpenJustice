import { CURRENT_EXTRACTOR } from '../../src/lib/documentExtractor';
import { commitment as commitmentOf, contentVersionHashOf, docId as docIdOf } from '../../src/lib/documentIdentity';
import { resetWorld, seedDocument, seedObject, seedVersion, store } from './world';

// ---------------------------------------------------------------------------
// A DOCUMENT OPENED BY A PUBLICATION, IN THE RECEIPT'S WORLD — document step 34 chunk 4b (R85). ONE spelling of the world
// the two public serves stand on: the gating cases (`test/documentPublicServes.test.ts`) and the document suite's contract
// cases (`routes.test.ts`, `invariants.test.ts`). th_1's version v1 cites the document and was PUBLISHED; the decisions
// handed in are made on the days given (A4 :1444 as CONFORMED: in force from a publication at or after them). The
// document's DOC_ID is its bytes' REAL hash and its commitment the REAL `sha256(bytes32(DOC_ID) ‖ salt)`.
// ---------------------------------------------------------------------------

export const BYTES = new TextEncoder().encode('%PDF-1.4 the circular, as the researcher gave it');
export const DOC_ID = docIdOf(BYTES);
export const SALT = Buffer.alloc(32, 7);
export const DOC = commitmentOf(DOC_ID, SALT);
export const TEXT = 'the circular instructed that the reporting channel be kept open';
export const at = (day: number): Date => new Date(Date.UTC(2026, 8, day));

/** A published version of th_1 citing the document, and the decisions given — each `[opening, day]`. */
export function world(over: { decisions?: [string, number][]; text?: string | null; document?: Record<string, unknown>; publishedDay?: number } = {}): void {
  resetWorld();
  const text = over.text === undefined ? TEXT : over.text;
  seedDocument({ docId: DOC_ID, commitment: DOC, salt: SALT, bytes: DOC_ID, mimeType: 'application/pdf', byteLength: BYTES.length, title: 'the circular', ...over.document });
  seedVersion({ commitment: DOC, text, contentVersionHash: contentVersionHashOf(text, DOC), derivedUnder: [CURRENT_EXTRACTOR] });
  seedObject(DOC_ID, BYTES);
  store.theses.push({ id: 'th_1', createdById: 'res_1', headVersionId: 'v1', publishedVersionId: 'v1' });
  // THE PIN the version write computes for every document mention (A1 :1242–:1243 as CONFORMED; T2) — the seeded version's
  // own hash. `/content` serves a PINNED version (A5 :1505 as CONFORMED, R85 Q-H; declared at chunk 4b round 2).
  store.mentions.push({ versionId: 'v1', kind: 'DOCUMENT', name: DOC, contentVersionHash: contentVersionHashOf(text, DOC), thesisVersion: { thesisId: 'th_1' } });
  store.attempts.push({ id: 'a-v1', thesisId: 'th_1', versionId: 'v1', outcome: 'PUBLISHED', createdAt: at(over.publishedDay ?? 21) });
  (over.decisions ?? [['CONTENT', 20]]).forEach(([opening, day], index) => {
    store.openings.push({ id: `d-${String(index)}`, thesisId: 'th_1', commitment: DOC, sequence: index + 1, opening, researcherId: 'res_1', createdAt: at(day) });
  });
}
