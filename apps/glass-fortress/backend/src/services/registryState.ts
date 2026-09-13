import { prisma } from '../lib/prisma';
import { toBytes32 } from '../lib/bytes32';
import { Web3Service, type OnChainEvidenceRecord } from './Web3Service';

// ---------------------------------------------------------------------------
// THE REGISTRY, READ FROM STATE. Evidence flows §8; refactor plan §3 step 9,
// sub-steps 1(b) and 2.
//
// The registry is append-only and each entry holds a hash, the submitter, the
// block time and a category. `getEvidence(index)` returns them forever;
// `isRegistered(hash)` returns an index forever. A receipt does neither past the
// RPC's retention horizon, which is why the audit's TX_UNREADABLE was a fact
// about the transaction a row named and never about the chain's attestation.
// So this module reads STATE and nothing else: no receipts, no logs, no block
// search.
//
// THREE RULES, EACH THE SHAPE OF SOMETHING ALREADY PAID FOR.
//
//   COMPLETE OR NOTHING. Every index below totalEvidence() is read and the
//   total is read again at the end. A ledger emitted from N-1 entries would
//   explain the registry's history minus one line and read as finished — the
//   "unexplained entry is indistinguishable from a tampered one" case Level 10
//   names, manufactured by the tool meant to prevent it.
//
//   ATTRIBUTED IS A CONJUNCTION. isRegistered(hash) AND the entry at that
//   index was submitted by OUR registrar. A hash someone else registered is not
//   ours to claim, and the two reads must agree about what sits at the index.
//
//   A LIVE ENTRY IS A CAPTURE'S documentHash, OR IT IS UNEXPLAINED. Evidence
//   flows A7 :1268–:1273: a live registry's every entry is the SHA-256 of a page
//   as served, and a capture row holds it as `documentHash`. A frozen registry's
//   other kinds — extraction anchors over `contentHash`, evidence names over
//   `fileHash` — are explained by its COMMITTED LEDGER, never by a row: the columns
//   that once explained them left the schema (evidence step 11b, R45-B). A hash no
//   capture holds is UNEXPLAINED, the one state step 2 refuses on.
//
// Pure functions over a small reader interface, so the suite proves the three
// rules without a chain; `readRegistryAttribution` is the one orchestrator, and
// it is what the two scripts call.
// ---------------------------------------------------------------------------

/** What this module needs from the chain — the read surface of Web3Service. */
export interface RegistryReader {
  readonly registryAddress: string;
  readonly registrarAddress: string;
  getTotalEvidence(): Promise<bigint>;
  readEvidenceRecord(index: bigint): Promise<OnChainEvidenceRecord>;
  isHashRegistered(fileHash: string): Promise<{ registered: boolean; evidenceId: bigint }>;
}

/** One registry entry, with its index. */
export interface RegistryEntry extends OnChainEvidenceRecord {
  index: number;
}

export interface RegistryState {
  registryAddress: string;
  /** Lower-case. */
  registrarAddress: string;
  totalEvidence: number;
  entries: RegistryEntry[];
  /** When the read completed, so a doc can say which day the total was counted. */
  readAt: string;
}

/** Thrown for every refusal here, so a caller can report rather than stack-trace. */
export class RegistryReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistryReadError';
  }
}

/**
 * Every entry on the registry, or a refusal.
 *
 * Sequential on purpose: staging reads a public endpoint, and a burst of
 * parallel calls is how a rate limit turns into an unreadable index. An index
 * that cannot be read is a refusal, never a gap — see COMPLETE OR NOTHING.
 */
export async function readRegistryState(reader: RegistryReader): Promise<RegistryState> {
  const before = Number(await reader.getTotalEvidence());
  const entries: RegistryEntry[] = [];
  for (let index = 0; index < before; index += 1) {
    try {
      const record = await reader.readEvidenceRecord(BigInt(index));
      entries.push({ index, ...record });
    } catch (err) {
      throw new RegistryReadError(
        `Refusing a partial read: index ${String(index)} of ${String(before)} could not be read ` +
          `(${err instanceof Error ? err.message : String(err)}). No entry list is returned.`,
      );
    }
  }
  const after = Number(await reader.getTotalEvidence());
  if (after !== before) {
    throw new RegistryReadError(
      `Refusing: totalEvidence() moved during the read — ${String(before)} before, ` +
        `${String(after)} after. Something wrote to the registry; read it again.`,
    );
  }
  return {
    registryAddress: reader.registryAddress,
    registrarAddress: reader.registrarAddress.toLowerCase(),
    totalEvidence: before,
    entries,
    readAt: new Date().toISOString(),
  };
}

export type AttributionVerdict = 'ATTRIBUTED' | 'FOREIGN_SUBMITTER' | 'UNREGISTERED';

export interface ClaimAttribution {
  /** 0x-prefixed, lower-case — the spelling the chain was asked about. */
  hash: string;
  verdict: AttributionVerdict;
  index: number | null;
  submitter: string | null;
}

/**
 * How the entry at an index is obtained — the one thing that differs between
 * ATTRIBUTED's callers.
 *
 * ADDED AT EVIDENCE STEP 12, and it is what keeps ATTRIBUTED at ONE SPELLING.
 * The ledger and the audits have already read the whole registry and look the
 * index up in what they hold; the anchor-time check and the per-capture reads
 * have one hash in hand and must not walk the contract to answer about it. Those
 * are two ways to FETCH AN ENTRY, not two definitions of attribution — so the
 * definition stays here, once, and the fetch is the parameter.
 */
export type EntryLookup = (index: number) => Promise<RegistryEntry | undefined>;

/** The lookup for a caller that has already read the registry's whole state. */
export function entriesAlreadyRead(entries: readonly RegistryEntry[]): EntryLookup {
  return (index) => Promise.resolve(entries.at(index));
}

/** The lookup for a caller asking about ONE hash: one read, at the index the chain named. */
export function entryFromChain(reader: RegistryReader): EntryLookup {
  return async (index) => ({ index, ...(await reader.readEvidenceRecord(BigInt(index))) });
}

/**
 * ATTRIBUTED(hash) = isRegistered(hash) AND getEvidence(index).submitter = our registrar.
 *
 * `entryAt` says where the entry comes from (above); the index the chain returns
 * is checked against what was read at it, and a disagreement is a refusal — two
 * reads of one state that contradict each other are not a verdict.
 */
export async function attributeClaim(
  reader: RegistryReader,
  entryAt: EntryLookup,
  hash: string,
): Promise<ClaimAttribution> {
  const asBytes32 = toBytes32(hash).toLowerCase();
  const { registered, evidenceId } = await reader.isHashRegistered(asBytes32);
  if (!registered) return { hash: asBytes32, verdict: 'UNREGISTERED', index: null, submitter: null };

  const index = Number(evidenceId);
  const entry = await entryAt(index);
  if (entry?.fileHash !== asBytes32) {
    throw new RegistryReadError(
      `isRegistered says ${asBytes32} sits at index ${String(index)}, but the entry read there ` +
        `is ${entry === undefined ? 'absent' : entry.fileHash}. The two reads disagree; no verdict.`,
    );
  }
  const ours = entry.submitter === reader.registrarAddress.toLowerCase();
  return {
    hash: asBytes32,
    verdict: ours ? 'ATTRIBUTED' : 'FOREIGN_SUBMITTER',
    index,
    submitter: entry.submitter,
  };
}

/** The hash-bearing columns of the corpus, as the join needs them. */
export interface CorpusHashes {
  snapshots: {
    id: string;
    waybackTimestamp: string | null;
    url: string;
    /** Bare hex, as stored. */
    documentHash: string;
  }[];
}

export type EntryKind =
  /** The payload anchor — the target's scheme, SHA-256 of the bytes as served. */
  | 'DOCUMENT_HASH'
  /** No capture holds it. The state step 2 refuses on. */
  | 'UNEXPLAINED';

export interface EntryClassification {
  kind: EntryKind;
  snapshots: { id: string; waybackTimestamp: string | null; url: string }[];
}

/** Which captures, if any, hold this entry's hash as their `documentHash`. */
export function classifyEntry(entry: RegistryEntry, corpus: CorpusHashes): EntryClassification {
  const holders = corpus.snapshots
    .filter((s) => toBytes32(s.documentHash).toLowerCase() === entry.fileHash)
    .map((s) => ({ id: s.id, waybackTimestamp: s.waybackTimestamp, url: s.url }));
  return holders.length === 0
    ? { kind: 'UNEXPLAINED', snapshots: [] }
    : { kind: 'DOCUMENT_HASH', snapshots: holders };
}

/** Every capture's hash, for the join and for the claim walk. */
export async function loadCorpusHashes(): Promise<CorpusHashes> {
  const [snapshots] = await Promise.all([
    prisma.urlSnapshot.findMany({
      orderBy: [{ trackedUrlId: 'asc' }, { capturedAt: 'asc' }],
      select: {
        id: true,
        waybackTimestamp: true,
        documentHash: true,
        trackedUrl: { select: { url: true } },
      },
    }),
  ]);
  return {
    snapshots: snapshots.map((s) => ({
      id: s.id,
      waybackTimestamp: s.waybackTimestamp,
      url: s.trackedUrl.url,
      documentHash: s.documentHash,
    })),
  };
}

export interface ClassifiedEntry extends RegistryEntry {
  classification: EntryClassification;
}

/** One capture's `documentHash` asked of the chain. */
export interface CorpusClaim {
  snapshotId: string;
  attribution: ClaimAttribution;
}

export interface RegistryAttributionReport {
  state: RegistryState;
  entries: ClassifiedEntry[];
  byKind: Record<EntryKind, number>;
  /** Every capture's `documentHash`, asked of the chain — the reverse join. */
  claims: CorpusClaim[];
  /**
   * One claim per capture, so this IS the per-capture count. A per-subject roll-up
   * stood beside it until R45-B, when every capture was asked twice — `documentHash`
   * and `contentHash` — and a per-claim count over-read UNREGISTERED.
   */
  byVerdict: Record<AttributionVerdict, number>;
}

/** Claims by verdict — one count per capture asked. */
export function countByVerdict(claims: readonly CorpusClaim[]): Record<AttributionVerdict, number> {
  const byVerdict: Record<AttributionVerdict, number> = {
    ATTRIBUTED: 0,
    FOREIGN_SUBMITTER: 0,
    UNREGISTERED: 0,
  };
  for (const c of claims) byVerdict[c.attribution.verdict] += 1;
  return byVerdict;
}

/**
 * The whole measurement: the registry from state, each entry classified against
 * the corpus, and each corpus hash asked of the registry. Both directions,
 * because they find different things — an entry with no row (UNEXPLAINED) and a
 * row with no entry (UNREGISTERED) are two findings, not one.
 */
export async function readRegistryAttribution(
  reader: RegistryReader = new Web3Service(),
): Promise<RegistryAttributionReport> {
  const [state, corpus] = await Promise.all([readRegistryState(reader), loadCorpusHashes()]);

  const entries = state.entries.map((entry) => ({ entry, classification: classifyEntry(entry, corpus) }));
  const byKind: Record<EntryKind, number> = { DOCUMENT_HASH: 0, UNEXPLAINED: 0 };
  for (const e of entries) byKind[e.classification.kind] += 1;

  const claims: CorpusClaim[] = [];
  for (const s of corpus.snapshots) {
    claims.push({
      snapshotId: s.id,
      attribution: await attributeClaim(reader, entriesAlreadyRead(state.entries), s.documentHash),
    });
  }
  return {
    state,
    entries: entries.map(({ entry, classification }) => ({ ...entry, classification })),
    byKind,
    claims,
    byVerdict: countByVerdict(claims),
  };
}
