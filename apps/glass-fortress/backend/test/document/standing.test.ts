import { built } from './built';
import type { DocumentRow, ShedRow } from './contract';
import { held, sealed } from './fixtures';

// ---------------------------------------------------------------------------
// §4 :377-:488, A3 :1364-:1367, :1383-:1384 — STANDING.
//
// ANCHORED IS READ FROM CHAIN STATE ON EVERY READ, AND NOTHING IS STORED (§4 :447-:450;
// plan step 31 :196-:197). Attribution is never a receipt (evidence §8 :689-:697): a
// receipt is readable only inside the RPC's retention horizon, and the audit's
// TX_UNREADABLE was a fact about a transaction, never about the chain's attestation.
//
// RECEIPT IS NEVER REFUSED BECAUSE THE CHAIN IS UNREACHABLE (§4 :444). A whistleblower
// turned away by an RPC outage may never return — so the anchor is OWED, and at step 30
// it is owed BY CONSTRUCTION because step 31 builds what pays it (plan :179-:180).
// ---------------------------------------------------------------------------

interface Standing {
  anchored: (commitment: string, attributed: (hash: string) => boolean) => boolean;
  verifiedDocument: (
    document: DocumentRow,
    shed: ShedRow | null,
    bytes: Uint8Array | null,
    attributed: (hash: string) => boolean,
  ) => boolean;
  recomputableEvidence: (fileHash: string, document: DocumentRow) => boolean;
  equalsCapture: (
    document: DocumentRow,
    snapshots: readonly { documentHash: string; url: string; capture: string }[],
  ) => { url: string; capture: string } | null;
}

const standing = (only: readonly string[]) => built<Standing>('services/documentPredicates', only);

const ATTRIBUTES_NOTHING = () => false;
const ATTRIBUTES_EVERYTHING = () => true;

describe('A3 :1366 — ANCHORED(d) = ATTRIBUTED(d.commitment), from CHAIN STATE', () => {
  it('true when the registry attributes the commitment to our registrar', async () => {
    const { anchored } = await standing(['anchored']);
    expect(anchored(held().commitment, ATTRIBUTES_EVERYTHING)).toBe(true);
  });

  it('FALSE, not an error, while the anchor is OWED — every read says so (§4 :447-:450)', async () => {
    const { anchored } = await standing(['anchored']);
    expect(anchored(held().commitment, ATTRIBUTES_NOTHING)).toBe(false);
  });

  it('it asks about the COMMITMENT and never the DOC_ID — no hash of a source’s copy is ever looked up (§4 :429-:438)', async () => {
    const { anchored } = await standing(['anchored']);
    const asked: string[] = [];
    anchored(held().commitment, (hash) => {
      asked.push(hash);
      return true;
    });
    expect(asked).toEqual([held().commitment]);
    expect(asked).not.toContain(held().docId);
  });
});

describe('A3 :1367 — VERIFIED(d) = RECOMPUTABLE(d) AND ANCHORED(d)', () => {
  it('a HELD document whose bytes hash to its name AND is attributed is VERIFIED', async () => {
    const { verifiedDocument } = await standing(['verifiedDocument']);
    const bytes = new Uint8Array([1, 2, 3]);
    const { createHash } = await import('node:crypto');
    const name = '0x' + createHash('sha256').update(bytes).digest('hex');
    expect(verifiedDocument(held({ docId: name }), null, bytes, ATTRIBUTES_EVERYTHING)).toBe(true);
  });

  it('an OWED commitment makes it NOT verified, whatever the bytes say', async () => {
    const { verifiedDocument } = await standing(['verifiedDocument']);
    const bytes = new Uint8Array([1, 2, 3]);
    const { createHash } = await import('node:crypto');
    const name = '0x' + createHash('sha256').update(bytes).digest('hex');
    expect(verifiedDocument(held({ docId: name }), null, bytes, ATTRIBUTES_NOTHING)).toBe(false);
  });

  it('a SEALED document is VERIFIED on the RECEIPT STAMP plus the anchor — one witness and one observation (§4 :464-:470)', async () => {
    const { verifiedDocument } = await standing(['verifiedDocument']);
    expect(verifiedDocument(sealed(), null, null, ATTRIBUTES_EVERYTHING)).toBe(true);
    expect(verifiedDocument(sealed({ verifiedAtReceipt: null }), null, null, ATTRIBUTES_EVERYTHING)).toBe(false);
  });
});

describe('A3 :1364-:1365 — RECOMPUTABLE(e), evidence A3’s predicate, THIRD ARM', () => {
  it('an Evidence row of kind DOCUMENT is recomputable when fileHash = sha256(docId ‖ salt)', async () => {
    const { recomputableEvidence } = await standing(['recomputableEvidence']);
    const document = held();
    expect(recomputableEvidence(document.commitment, document)).toBe(true);
  });

  it('a fileHash that is the DOC_ID rather than the COMMITMENT is MALFORMED — the public name is the commitment', async () => {
    const { recomputableEvidence } = await standing(['recomputableEvidence']);
    const document = held();
    expect(recomputableEvidence(document.docId, document)).toBe(false);
  });
});

describe('A3 :1383-:1384 — EQUALS_CAPTURE(d), READ ON DEMAND, naming page and capture', () => {
  it('names the page and capture when a snapshot’s documentHash EQUALS the docId (§2 :236-:242)', async () => {
    const { equalsCapture } = await standing(['equalsCapture']);
    const document = held();
    // EACH SIDE IN THE SPELLING ITS WRITER STORES: a DOC_ID is `0x`-prefixed (A1 :1244) and
    // `UrlSnapshot.documentHash` is BARE hex (`lib/evidenceIdentity.ts` :46-:47). Seeding both in one
    // spelling was a world no writer creates, and a raw string comparison passed it (R76 REVIEW's decoy).
    const match = { documentHash: document.docId.slice(2), url: 'https://example.gov.il/p', capture: '20220805053301' };
    expect(equalsCapture(document, [match])).toEqual({ url: match.url, capture: match.capture });
  });

  it('null when nothing equals it — the ONE witness the platform did not create is usually absent (§9 :1024)', async () => {
    const { equalsCapture } = await standing(['equalsCapture']);
    expect(equalsCapture(held(), [{ documentHash: '0x' + 'ff'.repeat(32), url: 'u', capture: '2' }])).toBeNull();
  });

  it('it compares the DOC_ID, never the commitment — the salt makes a commitment incomparable by construction', async () => {
    const { equalsCapture } = await standing(['equalsCapture']);
    const document = held();
    expect(equalsCapture(document, [{ documentHash: document.commitment, url: 'u', capture: '2' }])).toBeNull();
  });
});
