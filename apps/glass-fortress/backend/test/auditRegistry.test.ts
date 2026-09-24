import { ANCHOR_SCHEME, DOCUMENT_COMMITMENT } from '../src/lib/anchoredCaptureHash';
import { commitment as commitmentOf } from '../src/lib/documentIdentity';
import { auditRegistry, exitCodeForRegistryAudit, formatRegistryAudit } from '../src/services/auditRegistry';
import type { CorpusHashes, RegistryEntry, RegistryState } from '../src/services/registryState';

// ---------------------------------------------------------------------------
// `anchors-explainable` — `forensics:audit-registry`, evidence flows A7 :1268–:1273, EXTENDED by document flows A7
// :1554–:1556 at document step 31: "every entry's category ∈ { ANCHOR_SCHEME, DOCUMENT_COMMITMENT }; every commitment
// entry is reproduced by one Document row's (docId, salt); exit 1 on an unexplained entry, by index."
//
// THE CATEGORY RULE IS THE AUDIT'S OWN, over the LIVE registry. `classifyEntry` explains a hash; it lets every category
// but DOCUMENT_COMMITMENT take the documentHash arm, so a frozen registry's entries classify as they always did. An
// entry on the LIVE registry with a THIRD category whose hash happens to match a capture is therefore "explained" by the
// join — and is exactly what A7 :1555 forbids. That case is REVIEW's (R80-review-state Entry 7).
//
// "None is proven until it has been observed to FAIL" (A7 :1546): each exit-1 case is the failure, beside the pass.
// ---------------------------------------------------------------------------

const REGISTRAR = '0x9de2e74b3c5dac4c3e2a0d18a5b76eeac8989a28';
const hash = (n: number): string => `0x${n.toString(16).padStart(64, '0')}`;
const docId = hash(5);
const salt = Buffer.alloc(32, 9);
const name = commitmentOf(docId, salt);

const corpus: CorpusHashes = {
  snapshots: [{ id: 's1', waybackTimestamp: '20220724130104', url: 'https://x/', documentHash: hash(1).slice(2) }],
  documents: [{ commitment: name, docId, salt }],
};

function entry(index: number, fileHash: string, category: string): RegistryEntry {
  return { index, fileHash, submitter: REGISTRAR, timestamp: 1_758_000_000 + index, category };
}

function state(entries: RegistryEntry[]): RegistryState {
  return { registryAddress: '0xda3b', registrarAddress: REGISTRAR, totalEvidence: entries.length, entries, readAt: '2026-09-24T12:00:00.000Z' };
}

const BOTH = [entry(0, hash(1), ANCHOR_SCHEME), entry(1, name, DOCUMENT_COMMITMENT)];

describe('anchors-explainable — both categories, exit 0 when every live entry is explained', () => {
  it('a capture’s entry and a document’s commitment are both explained — exit 0', () => {
    const audit = auditRegistry(state(BOTH), corpus);
    expect([audit.examined, audit.unexplained, exitCodeForRegistryAudit(audit)]).toEqual([2, [], 0]);
    expect(audit.byKind).toEqual({ DOCUMENT_HASH: 1, DOCUMENT_COMMITMENT: 1 });
  });

  it('the FLOOR: an empty registry examines nothing and SAYS so — zero examined is reported, never a silent pass', () => {
    const audit = auditRegistry(state([]), corpus);
    expect(audit.examined).toBe(0);
    expect(formatRegistryAudit(audit)).toMatch(/0 entries examined/);
  });
});

describe('anchors-explainable — exit 1 on an unexplained entry, BY INDEX (A7 :1556)', () => {
  it('a planted entry NO row explains → exit 1 naming its index; then removed → exit 0 (plan :206–:207)', () => {
    const planted = auditRegistry(state([...BOTH, entry(2, hash(999), ANCHOR_SCHEME)]), corpus);
    expect(planted.unexplained.map((u) => u.index)).toEqual([2]);
    expect(exitCodeForRegistryAudit(planted)).toBe(1);
    expect(formatRegistryAudit(planted)).toMatch(/index 2/);
    expect(exitCodeForRegistryAudit(auditRegistry(state(BOTH), corpus))).toBe(0);
  });

  it('a commitment entry whose row’s salt does NOT reproduce it → exit 1, by index', () => {
    const wrongSalt: CorpusHashes = { ...corpus, documents: [{ commitment: name, docId, salt: Buffer.alloc(32, 1) }] };
    const audit = auditRegistry(state(BOTH), wrongSalt);
    expect(audit.unexplained.map((u) => u.index)).toEqual([1]);
    expect(exitCodeForRegistryAudit(audit)).toBe(1);
  });

  it('REVIEW’s case: a live entry with a THIRD category whose hash MATCHES a capture → exit 1, by index', () => {
    const audit = auditRegistry(state([...BOTH, entry(2, hash(1), 'Public Health,Vaccine Safety')]), corpus);
    expect(audit.unexplained).toEqual([{ index: 2, category: 'Public Health,Vaccine Safety', reason: expect.stringMatching(/category/) as unknown }]);
    expect(exitCodeForRegistryAudit(audit)).toBe(1);
  });

  it('every unexplained index is named, not the first', () => {
    const audit = auditRegistry(state([entry(0, hash(998), ANCHOR_SCHEME), entry(1, name, DOCUMENT_COMMITMENT), entry(2, hash(999), ANCHOR_SCHEME)]), corpus);
    expect(audit.unexplained.map((u) => u.index)).toEqual([0, 2]);
  });
});
