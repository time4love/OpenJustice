jest.mock('../src/lib/prisma', () => (require('./document/world') as typeof import('./document/world')).prismaDouble);
jest.mock('../src/services/documentBucket', () => (require('./document/world') as typeof import('./document/world')).bucketDouble);

import { auditDocuments, exitCodeForAudit } from '../src/services/auditDocuments';
import { commitmentsOwed, exitCodeForOwed } from '../src/services/commitmentsOwed';
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

describe('commitments-owed — forensics:commitments-owed (A7 :1558–:1560; plan :188–:189)', () => {
  it('EXIT 2 listing EXACTLY the documents whose commitment the registry does not attribute to us, with their age', async () => {
    const owed = heldDocument(PDF.docId, new Date(Date.UTC(2026, 8, 20)));
    const paid = heldDocument('0x' + 'ab'.repeat(32), new Date(Date.UTC(2026, 8, 21)));
    const asked: string[] = [];
    const report = await commitmentsOwed(
      (commitment) => {
        asked.push(commitment);
        return Promise.resolve(commitment === paid ? 'ATTRIBUTED' : 'UNREGISTERED');
      },
      new Date(Date.UTC(2026, 8, 23)),
    );
    // It asks about the COMMITMENT, never the DOC_ID (§4 :429–:438), and about every document.
    expect(asked.sort()).toEqual([owed, paid].sort());
    expect(report.owed).toEqual([{ commitment: owed, verdict: 'UNREGISTERED', ageDays: 3 }]);
    expect(exitCodeForOwed(report)).toBe(2);
  });

  it('a commitment someone ELSE registered is still owed — ATTRIBUTED is ours, and FOREIGN_SUBMITTER is not', async () => {
    const commitment = heldDocument(PDF.docId);
    const report = await commitmentsOwed(() => Promise.resolve('FOREIGN_SUBMITTER'), new Date(Date.UTC(2026, 8, 23)));
    expect(report.owed.map((row) => [row.commitment, row.verdict])).toEqual([[commitment, 'FOREIGN_SUBMITTER']]);
  });

  it('EXIT 0 when nothing is owed — and the count of documents asked is reported', async () => {
    heldDocument(PDF.docId);
    const report = await commitmentsOwed(() => Promise.resolve('ATTRIBUTED'), new Date(Date.UTC(2026, 8, 23)));
    expect([report.examined, report.owed, exitCodeForOwed(report)]).toEqual([1, [], 0]);
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
