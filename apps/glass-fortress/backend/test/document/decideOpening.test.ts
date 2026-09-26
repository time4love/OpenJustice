jest.mock('../../src/lib/prisma', () => (require('./world') as typeof import('./world')).prismaDouble);

import { built } from './built';
import { DECIDE_OPENING_REFUSALS, type Opening } from './contract';
import { resetWorld, store } from './world';

// ---------------------------------------------------------------------------
// A4 :1443-:1446, §7 :797-:809 — decide_opening. STEP 34'S.
//
// OPENING ONLY WIDENS: a decision narrower than OPENED(d) is refused CANNOT_NARROW, and a
// later version that drops the citation changes nothing — what the public has read, it has
// read (§7 :797-:801). The one act that REMOVES public content is not the platform's and
// is §8's: a sender withdrawing what they gave.
//
// IT IS IN FORCE FROM THE NEXT `publish_thesis`, never from the decision itself (A4 :1444).
//
// THE WORLD — DECLARED EDIT, document step 34 (R84 sketch S3). Written at step 27 with none, so no correct implementation
// could satisfy these cases (the R76 finding). It now seeds what each case names: thesis th_1, its author res_1, its head
// citing CITED (held) and SEALED (sealed). CANNOT_NARROW refuses "below OPENED(d)" (A4 :1446, §7 :797) and OPENED(d) is
// undefined until a version citing d is published (A3 :1377–:1378), so the narrowing case PUBLISHES between its two
// decisions — the world that refusal lives in. Every assertion is as it was.
// ---------------------------------------------------------------------------

interface Refusal { error: string; code: string }

interface Tool {
  decideOpening: (
    args: { thesisId: string; commitment: string; opening: Opening; expectedSequence: number },
    researcherId: string | null,
  ) => Promise<{ opening: Opening; sequence: number; inForceFrom: 'publish_thesis' } | Refusal>;
}

const tool = () => built<Tool>('services/decideOpening');
const isRefusal = (a: unknown): a is Refusal => typeof (a as Refusal)?.code === 'string';

const CITED = '0x' + 'c1'.repeat(32);
const SEALED = '0x' + 'c2'.repeat(32);
const HEAD = 'v_head';

const documentRow = (commitment: string, sealed: boolean) => ({
  docId: '0x' + (sealed ? 'd2' : 'd1').repeat(32),
  commitment,
  salt: Buffer.alloc(32),
  cid: sealed ? 'bafy-sealed' : null,
  bytes: sealed ? null : '0x' + 'd1'.repeat(32),
  mimeType: 'application/pdf',
  byteLength: 1024,
  verifiedAtReceipt: sealed ? new Date(Date.UTC(2026, 8, 20)) : null,
});

beforeEach(() => {
  resetWorld();
  store.theses.push({ id: 'th_1', createdById: 'res_1', headVersionId: HEAD });
  store.documents.push(documentRow(CITED, false), documentRow(SEALED, true));
  // A sealed document's CURRENT(d) is its AT_RECEIPT version, forever (A3 :1370).
  // DECLARED EDIT, step 34 chunk 5-0 (Q-R1): its producer's DocumentContentDerivation row, no longer a column.
  store.versions.push({ id: 'version-sealed', commitment: SEALED, contentVersionHash: '0x' + 'a1'.repeat(32), text: 'the receipt text', derivedFrom: 'AT_RECEIPT' });
  store.derivations.push({ id: 'derivation-sealed', versionId: 'version-sealed', extractorVersion: 'v0', at: new Date(Date.UTC(2026, 8, 20)) });
  store.mentions.push(
    { versionId: HEAD, kind: 'DOCUMENT', name: CITED, thesisVersion: { thesisId: 'th_1' } },
    { versionId: HEAD, kind: 'DOCUMENT', name: SEALED, thesisVersion: { thesisId: 'th_1' } },
  );
});

/** th_1's head PUBLISHED now — the act that puts every decision made before it in force (A4 :1444). */
const publish = (): void => {
  store.attempts.push({ id: 'attempt-1', thesisId: 'th_1', versionId: HEAD, outcome: 'PUBLISHED', createdAt: new Date() });
};

describe('A4 :1443-:1444 — decide_opening appends a decision, in force from the next publication', () => {
  it('records the opening and says it takes effect at publish_thesis, not now', async () => {
    const { decideOpening } = await tool();
    const answer = await decideOpening({ thesisId: 'th_1', commitment: CITED, opening: 'CONTENT', expectedSequence: 0 }, 'res_1');
    expect(!isRefusal(answer) && answer.inForceFrom).toBe('publish_thesis');
  });
});

describe('A4 :1445-:1446 — the refusals, closed', () => {
  it('NOT_CITED when the head does not mention it — an opening decides nothing about an uncited document', async () => {
    const { decideOpening } = await tool();
    const answer = await decideOpening({ thesisId: 'th_1', commitment: '0x' + 'ee'.repeat(32), opening: 'PASSAGE', expectedSequence: 0 }, 'res_1');
    expect(isRefusal(answer) && answer.code).toBe('NOT_CITED');
  });

  it('NOT_HELD for BYTES on a SEALED document — which has no bytes anywhere (§7 :787)', async () => {
    const { decideOpening } = await tool();
    const answer = await decideOpening({ thesisId: 'th_1', commitment: SEALED, opening: 'BYTES', expectedSequence: 0 }, 'res_1');
    expect(isRefusal(answer) && answer.code).toBe('NOT_HELD');
  });

  it('CANNOT_NARROW below OPENED(d) — PASSAGE after CONTENT is refused (§7 :797)', async () => {
    const { decideOpening } = await tool();
    await decideOpening({ thesisId: 'th_1', commitment: CITED, opening: 'CONTENT', expectedSequence: 0 }, 'res_1');
    publish();
    const answer = await decideOpening({ thesisId: 'th_1', commitment: CITED, opening: 'PASSAGE', expectedSequence: 1 }, 'res_1');
    expect(isRefusal(answer) && answer.code).toBe('CANNOT_NARROW');
  });

  it('WIDENING IS ALLOWED — CONTENT after PASSAGE, and BYTES after CONTENT on a held document', async () => {
    const { decideOpening } = await tool();
    await decideOpening({ thesisId: 'th_1', commitment: CITED, opening: 'PASSAGE', expectedSequence: 0 }, 'res_1');
    const wider = await decideOpening({ thesisId: 'th_1', commitment: CITED, opening: 'BYTES', expectedSequence: 1 }, 'res_1');
    expect(isRefusal(wider)).toBe(false);
  });

  it('NOT_AUTHOR, NO_RESEARCHER and STALE_SEQUENCE are in the set, and the set is SIX', () => {
    expect([...DECIDE_OPENING_REFUSALS].sort()).toEqual([
      'CANNOT_NARROW',
      'NOT_AUTHOR',
      'NOT_CITED',
      'NOT_HELD',
      'NO_RESEARCHER',
      'STALE_SEQUENCE',
    ]);
  });
});
