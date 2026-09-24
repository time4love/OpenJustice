jest.mock('../src/lib/prisma', () => (require('./document/world') as typeof import('./document/world')).prismaDouble);
jest.mock('../src/services/documentBucket', () => (require('./document/world') as typeof import('./document/world')).bucketDouble);

import { auditDocuments, exitCodeForAudit } from '../src/services/auditDocuments';
import { commitmentsOwed, exitCodeForOwed, formatCommitmentsOwed, OWED_AGE_FLOOR_MS } from '../src/services/commitmentsOwed';
import { SWEEP_LIFETIME_DAYS, sweepUnclaimedObjects } from '../src/services/sweepUnclaimedObjects';
import { bucketCalls, fixture, nameOf, objects, resetWorld, seedDocument, seedObject, store } from './document/world';
import { commitment as commitmentOf } from '../src/lib/documentIdentity';

// ---------------------------------------------------------------------------
// THE THREE INSTRUMENTS OF DOCUMENT STEP 30 — docs/gf-document-flows.md A7 :1549–:1560; plan :146–:149, :184–:189;
// R76 chunk-1 sketch §(c) (the sweep). Each is an OPERATIONAL SCRIPT in `scripts/`, run inside a deployment with the
// environment stated twice (`runOperationalScript`); what is held here is each one's SERVICE, over the document world,
// with the bucket mocked at its one module. "None is proven until it has been observed to FAIL" (A7 :1546): each
// describe below makes its instrument fail first, then pass, in one world.
// ---------------------------------------------------------------------------

const PDF = fixture('PDF_TEXT_LAYER');
const SALT = Buffer.alloc(32, 7);

function heldDocument(docId: string, receivedAt = new Date(Date.UTC(2026, 8, 20))): string {
  const commitment = commitmentOf(docId, SALT);
  seedDocument({ docId, commitment, salt: SALT, bytes: docId, receivedAt });
  return commitment;
}

beforeEach(() => {
  resetWorld();
});

describe('document-recomputable — forensics:audit-documents (A7 :1549–:1552; plan :146–:149)', () => {
  it('EXIT 1 on a HELD row whose bucket bytes do not hash to its name, and the row is LISTED — never repaired', async () => {
    const good = heldDocument(PDF.docId);
    seedObject(PDF.docId, PDF.bytes);
    // WORLD: an object under a DOC_ID holding OTHER bytes, named by a row — what a `upsert: true` URL could once
    // have written; `upsert: false` now forbids it, and the audit is what would see it if it ever happened.
    const liar = nameOf(new TextEncoder().encode('the bytes the name was computed over'));
    const bad = heldDocument(liar);
    seedObject(liar, PDF.bytes);
    const report = await auditDocuments();
    expect(report.malformed.map((row) => row.commitment)).toEqual([bad]);
    expect(report.examined).toBe(2);
    expect(exitCodeForAudit(report)).toBe(1);
    expect(report.malformed.at(0)?.reason).toMatch(/do not hash to its name/);
    expect(good).not.toBe(bad);
  });

  it('a HELD row whose object is GONE is malformed too — the row claims bytes that are not there', async () => {
    heldDocument(PDF.docId);
    const report = await auditDocuments();
    expect(report.malformed.map((row) => row.reason)).toEqual([expect.stringMatching(/object is absent/) as string]);
  });

  it('an Evidence row of kind DOCUMENT whose fileHash is not its document’s commitment is malformed (A7 :1551)', async () => {
    const commitment = heldDocument(PDF.docId);
    seedObject(PDF.docId, PDF.bytes);
    store.evidence.push({ id: 'evidence-1', kind: 'DOCUMENT', fileHash: PDF.docId, documentCommitment: commitment });
    const report = await auditDocuments();
    expect(report.malformed.map((row) => row.commitment)).toEqual([commitment]);
    expect(report.malformed.at(0)?.reason).toMatch(/Evidence evidence-1/);
  });

  it('EXIT 0 over held documents that recompute — and ZERO EXAMINED on an empty database is reported, never a silent pass', async () => {
    const empty = await auditDocuments();
    expect([empty.examined, exitCodeForAudit(empty)]).toEqual([0, 0]);
    heldDocument(PDF.docId);
    seedObject(PDF.docId, PDF.bytes);
    const report = await auditDocuments();
    expect([report.examined, report.malformed, exitCodeForAudit(report)]).toEqual([1, [], 0]);
  });
});

describe('commitments-owed — forensics:commitments-owed (A7 :1558–:1560 as ruled 2026-09-24; plan :188–:189; relay item 8)', () => {
  // THE READ IS THE ONE ANCHORED(d) READ — both arms (A3 :1366 as ruled): the double answers per DOCUMENT, as
  // `readStanding` does, so OWED and ANCHORED cannot be two spellings. Ages are measured in MILLISECONDS against the
  // floor, then floored to whole MINUTES for the row (relay item 8: `ageDays` could not tell 9 minutes from 11).
  const NOW = new Date(Date.UTC(2026, 8, 23, 12, 0, 0));
  const minutesAgo = (m: number): Date => new Date(NOW.getTime() - m * 60_000);
  const answering =
    (verdictOf: (commitment: string) => 'ATTRIBUTED' | 'UNREGISTERED' | 'FOREIGN_SUBMITTER') =>
    (d: { commitment: string }): Promise<{ anchored: boolean; by: 'COMMITMENT' | 'CAPTURE' | null; verdict: 'ATTRIBUTED' | 'UNREGISTERED' | 'FOREIGN_SUBMITTER' | null }> => {
      const verdict = verdictOf(d.commitment);
      return Promise.resolve({ anchored: verdict === 'ATTRIBUTED', by: verdict === 'ATTRIBUTED' ? 'COMMITMENT' : null, verdict });
    };

  it('EXIT 2 listing EXACTLY the documents the chain does not attribute, with the moment and the age in MINUTES', async () => {
    const owed = heldDocument(PDF.docId, new Date(Date.UTC(2026, 8, 20)));
    const paid = heldDocument('0x' + 'ab'.repeat(32), new Date(Date.UTC(2026, 8, 21)));
    const asked: string[] = [];
    const report = await commitmentsOwed((d) => {
      asked.push(d.commitment);
      return answering((c) => (c === paid ? 'ATTRIBUTED' : 'UNREGISTERED'))(d);
    }, NOW);
    // It asks about every document, by its COMMITMENT (§4 :429–:438) — the capture arm is the read's own business.
    expect(asked.sort()).toEqual([owed, paid].sort());
    expect(report.owed.map(({ commitment, verdict, receivedAt, ageMinutes }) => ({ commitment, verdict, receivedAt, ageMinutes }))).toEqual([
      { commitment: owed, verdict: 'UNREGISTERED', receivedAt: '2026-09-20T00:00:00.000Z', ageMinutes: 3 * 24 * 60 + 12 * 60 },
    ]);
    expect(exitCodeForOwed(report)).toBe(2);
  });

  it('a commitment someone ELSE registered is still owed — ATTRIBUTED is ours, and FOREIGN_SUBMITTER is not', async () => {
    const commitment = heldDocument(PDF.docId);
    const report = await commitmentsOwed(answering(() => 'FOREIGN_SUBMITTER'), NOW);
    expect(report.owed.map((row) => [row.commitment, row.verdict])).toEqual([[commitment, 'FOREIGN_SUBMITTER']]);
  });

  it('EXIT 0 when nothing is owed — and the count of documents asked is reported', async () => {
    heldDocument(PDF.docId);
    const report = await commitmentsOwed(answering(() => 'ATTRIBUTED'), NOW);
    expect([report.examined, report.owed, exitCodeForOwed(report)]).toEqual([1, [], 0]);
  });

  it('THE FLOOR: at 9 minutes a document is NOT owed and is counted on the YOUNGER line; at 11 it IS owed', async () => {
    const young = heldDocument(PDF.docId, minutesAgo(9));
    const old = heldDocument('0x' + 'ab'.repeat(32), minutesAgo(11));
    const report = await commitmentsOwed(answering(() => 'UNREGISTERED'), NOW);
    expect(report.owed.map((row) => row.commitment)).toEqual([old]);
    expect(report.owed.map((row) => row.commitment)).not.toContain(young);
    expect(report.younger).toBe(1);
    expect(formatCommitmentsOwed(report)).toMatch(/^ {2}1 younger than the floor, not yet owed$/m);
  });

  it('exactly the floor, 10:00, IS owed — the comparison is on milliseconds, before any flooring', async () => {
    heldDocument(PDF.docId, minutesAgo(10));
    const report = await commitmentsOwed(answering(() => 'UNREGISTERED'), NOW);
    expect([report.owed.length, report.younger]).toEqual([1, 0]);
  });

  it('EXIT 2 counts only the documents BEYOND the floor — a younger one alone exits 0', async () => {
    heldDocument(PDF.docId, minutesAgo(3));
    const report = await commitmentsOwed(answering(() => 'UNREGISTERED'), NOW);
    expect([report.owed.length, report.younger, exitCodeForOwed(report)]).toEqual([0, 1, 0]);
  });

  it('a document ANCHORED by the capture arm is EXCLUDED and counted on its own line (A7 :1559 as ruled)', async () => {
    heldDocument(PDF.docId);
    const report = await commitmentsOwed(() => Promise.resolve({ anchored: true, by: 'CAPTURE', verdict: null }), NOW);
    expect([report.owed, report.byCapture]).toEqual([[], 1]);
    expect(formatCommitmentsOwed(report)).toMatch(/^ {2}1 anchored by an equal capture$/m);
  });

  it('BOTH lines are ALWAYS printed, zero included — a line that appears only when non-zero cannot be told from one never written', async () => {
    heldDocument(PDF.docId, minutesAgo(60));
    const text = formatCommitmentsOwed(await commitmentsOwed(answering(() => 'ATTRIBUTED'), NOW));
    expect(text).toMatch(/^ {2}0 younger than the floor, not yet owed$/m);
    expect(text).toMatch(/^ {2}0 anchored by an equal capture$/m);
  });

  it('the floor is TEN MINUTES, one named constant (relay item 8)', () => {
    expect(OWED_AGE_FLOOR_MS).toBe(10 * 60_000);
  });
});

describe('the sweep — forensics:sweep-unclaimed-objects (§9 :998; sketch §(c))', () => {
  const NOW = new Date(Date.UTC(2026, 8, 30));
  const OLD = new Date(NOW.getTime() - (SWEEP_LIFETIME_DAYS + 1) * 86_400_000);
  const YOUNG = new Date(NOW.getTime() - (SWEEP_LIFETIME_DAYS - 1) * 86_400_000);
  const UNCLAIMED = '0x' + 'aa'.repeat(32);
  const CLAIMED = PDF.docId;
  const FRESH = '0x' + 'bb'.repeat(32);

  beforeEach(() => {
    seedObject(UNCLAIMED, new Uint8Array([1]), OLD);
    seedObject(CLAIMED, PDF.bytes, OLD);
    heldDocument(CLAIMED);
    seedObject(FRESH, new Uint8Array([2]), YOUNG);
  });

  it('THE FLOOR — one object SWEPT and one NAMED object KEPT, in one run with --delete', async () => {
    const report = await sweepUnclaimedObjects({ remove: true, now: NOW });
    expect(report.due.map((object) => object.key)).toEqual([UNCLAIMED]);
    expect(report.swept).toEqual([UNCLAIMED]);
    expect([...objects.keys()].sort()).toEqual([CLAIMED, FRESH].sort());
  });

  it('LISTS BY DEFAULT — without --delete nothing is removed', async () => {
    const report = await sweepUnclaimedObjects({ remove: false, now: NOW });
    expect(report.due.map((object) => object.key)).toEqual([UNCLAIMED]);
    expect(report.swept).toEqual([]);
    expect(bucketCalls.filter((call) => call.startsWith('remove '))).toEqual([]);
  });

  it(`an object younger than ${String(SWEEP_LIFETIME_DAYS)} days is never due — it may be an upload whose command is not yet run`, async () => {
    const report = await sweepUnclaimedObjects({ remove: true, now: NOW });
    expect(report.due.map((object) => object.key)).not.toContain(FRESH);
    expect(objects.has(FRESH)).toBe(true);
  });

  it('THE RE-CHECK — an object CLAIMED between the list and its removal is KEPT, and said so', async () => {
    // WORLD: add_document runs for the unclaimed object while the sweep is between its list and its delete.
    const claimLate = async (): Promise<void> => {
      heldDocument(UNCLAIMED);
      await Promise.resolve();
    };
    const report = await sweepUnclaimedObjects({ remove: true, now: NOW, beforeEachRemoval: claimLate });
    expect(report.swept).toEqual([]);
    expect(report.keptOnRecheck).toEqual([UNCLAIMED]);
    expect(objects.has(UNCLAIMED)).toBe(true);
  });
});

describe('the rederive pass READS THE BUCKET — R78-state §8 LOW, closed at step 30', () => {
  it('its reader is `documentBucket`’s `readObject` (null on absence), never a stub that rejects every read', () => {
    const { readFileSync } = jest.requireActual<typeof import('node:fs')>('node:fs');
    const { join } = jest.requireActual<typeof import('node:path')>('node:path');
    const source = readFileSync(join(__dirname, '..', 'scripts', 'rederiveDocuments.ts'), 'utf8');
    expect(source).toMatch(/import \{ readObject \} from '\.\.\/src\/services\/documentBucket';/);
    expect(source).toMatch(/rederiveDocuments\(\(document\) => readObject\(document\.bytes \?\? document\.docId\)\)/);
    expect(source).not.toMatch(/Promise\.reject/);
  });
});
