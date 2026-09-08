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
//   AN ENTRY IS EXPLAINED BY THE COLUMN THAT PRODUCED IT. The design names three
//   kinds — extraction anchors over contentHash, payload anchors over
//   documentHash, evidence names over fileHash — and the join finds which. A
//   hash matching no column is UNEXPLAINED, the one state step 2 refuses on;
//   a hash matching two columns is AMBIGUOUS, reported rather than resolved by
//   picking the first.
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
    /** Bare hex, as stored. */
    contentHash: string;
  }[];
  // THE EVIDENCE ARM LEFT AT EVIDENCE STEP 11b, AND ITS ENTRIES ARE STILL
  // EXPLAINED — in the place evidence §8 says they are explained.
  //
  // It matched a frozen registry's entry against `Evidence.fileHash` and
  // `previousFileHash`, to say "index 14 is an evidence name under the retired
  // formula". Both columns are gone: identity never moves under the target, so
  // there is no previous name, and no evidence row is registered at all —
  // nothing above the corpus is anchored (§5).
  //
  // §8 ANTICIPATED EXACTLY THIS: "every old entry is explained in GIT, not in a
  // table". The ledger for each frozen registry is emitted ONCE, before its
  // database is dropped, and committed — staging's is
  // `registry-ledger/84532-0x65b9….json`, written at refactor step 9. Those
  // explanations survive the rows that produced them, which is the entire reason
  // the design put them in a file rather than in a query. What this module still
  // does is explain the entries of a LIVE registry, where every entry is a
  // capture's `documentHash` under one scheme.
}

export type EntryKind =
  /** The payload anchor — the target's scheme, SHA-256 of the bytes as served. */
  | 'DOCUMENT_HASH'
  /** The extraction anchor — SHA-256 of Readability's article; one entry covers every twin. */
  | 'CONTENT_HASH'
  /** An evidence name under the retired formula. */
  | 'EVIDENCE_FILE_HASH'
  /** An evidence name the row has since moved off. */
  | 'EVIDENCE_PREVIOUS_FILE_HASH'
  /** No column holds it. The state step 2 refuses on. */
  | 'UNEXPLAINED'
  /** More than one column holds it. Reported, never resolved by picking one. */
  | 'AMBIGUOUS';

export interface EntryClassification {
  kind: EntryKind;
  snapshots: { id: string; waybackTimestamp: string | null; url: string }[];
  evidence: { id: string }[];
}

/** Which column of the corpus produced this entry's hash. */
export function classifyEntry(entry: RegistryEntry, corpus: CorpusHashes): EntryClassification {
  const hash = entry.fileHash;
  const same = (stored: string | null): boolean =>
    stored !== null && toBytes32(stored).toLowerCase() === hash;

  const byDocument = corpus.snapshots.filter((s) => same(s.documentHash));
  const byContent = corpus.snapshots.filter((s) => same(s.contentHash));

  const kinds: EntryKind[] = [];
  if (byDocument.length > 0) kinds.push('DOCUMENT_HASH');
  if (byContent.length > 0) kinds.push('CONTENT_HASH');

  const snapshot = (s: CorpusHashes['snapshots'][number]): EntryClassification['snapshots'][number] => ({
    id: s.id,
    waybackTimestamp: s.waybackTimestamp,
    url: s.url,
  });
  const only = kinds.at(0);
  if (only === undefined) return { kind: 'UNEXPLAINED', snapshots: [], evidence: [] };
  if (kinds.length > 1) {
    return {
      kind: 'AMBIGUOUS',
      snapshots: [...byDocument, ...byContent].map(snapshot),
      evidence: [],
    };
  }
  return {
    kind: only,
    snapshots: (only === 'DOCUMENT_HASH' ? byDocument : only === 'CONTENT_HASH' ? byContent : []).map(
      snapshot,
    ),
    evidence: [],
  };
}

/** Every hash column the corpus holds, for the join and for the claim walk. */
export async function loadCorpusHashes(): Promise<CorpusHashes> {
  const [snapshots] = await Promise.all([
    prisma.urlSnapshot.findMany({
      orderBy: [{ trackedUrlId: 'asc' }, { capturedAt: 'asc' }],
      select: {
        id: true,
        waybackTimestamp: true,
        documentHash: true,
        contentHash: true,
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
      contentHash: s.contentHash,
    })),
  };
}

export interface ClassifiedEntry extends RegistryEntry {
  classification: EntryClassification;
}

/** One corpus hash asked of the chain, and where it came from. */
export interface CorpusClaim {
  subject: 'UrlSnapshot' | 'Evidence';
  subjectId: string;
  column: 'documentHash' | 'contentHash' | 'fileHash' | 'previousFileHash';
  attribution: ClaimAttribution;
}

export type SnapshotAttribution =
  | 'ATTRIBUTED_BY_DOCUMENT_HASH'
  | 'ATTRIBUTED_BY_CONTENT_HASH'
  | 'BOTH'
  | 'FOREIGN'
  | 'NEITHER';

export type EvidenceAttribution =
  | 'BY_FILE_HASH'
  | 'BY_PREVIOUS_FILE_HASH'
  | 'BOTH'
  | 'FOREIGN'
  | 'NEITHER';

/** The registry explained per SUBJECT — the number a reader of the dated doc acts on. */
export interface SubjectRollUp {
  snapshots: Record<SnapshotAttribution, number>;
  evidence: Record<EvidenceAttribution, number>;
}

export interface RegistryAttributionReport {
  state: RegistryState;
  entries: ClassifiedEntry[];
  byKind: Record<EntryKind, number>;
  /** Every hash column of every row, asked of the chain — the reverse join. */
  claims: CorpusClaim[];
  /** Per claim. True, and by construction ~one UNREGISTERED per legacy row — read bySubject. */
  byVerdict: Record<AttributionVerdict, number>;
  bySubject: SubjectRollUp;
}

/** Claims by verdict — one count per hash column asked. */
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
 * Claims rolled up per subject.
 *
 * WHY THIS EXISTS BESIDE byVerdict. Every snapshot is asked twice — documentHash
 * and contentHash — and a legacy row is registered on exactly one of them, so on
 * a fully anchored corpus UNREGISTERED ≈ the snapshot count. That is a true
 * number and the wrong one to act on. Evidence flows §8 explains the registry
 * per subject ("12 entries covering all 83 captures"), and "recompute, never
 * restate" wants that number in the raw output, not derived by hand from the
 * claims table.
 *
 * A subject attributed on one column and foreign on the other counts as
 * attributed: its own custody is answered by the column that is ours, and the
 * foreign registration stays visible in byVerdict and in the claims.
 */
export function rollUpBySubject(claims: readonly CorpusClaim[]): SubjectRollUp {
  const snapshots: Record<SnapshotAttribution, number> = {
    ATTRIBUTED_BY_DOCUMENT_HASH: 0,
    ATTRIBUTED_BY_CONTENT_HASH: 0,
    BOTH: 0,
    FOREIGN: 0,
    NEITHER: 0,
  };
  const evidence: Record<EvidenceAttribution, number> = {
    BY_FILE_HASH: 0,
    BY_PREVIOUS_FILE_HASH: 0,
    BOTH: 0,
    FOREIGN: 0,
    NEITHER: 0,
  };

  const bySubject = new Map<string, CorpusClaim[]>();
  for (const c of claims) {
    const key = `${c.subject}:${c.subjectId}`;
    bySubject.set(key, [...(bySubject.get(key) ?? []), c]);
  }

  const verdictOf = (own: readonly CorpusClaim[], column: CorpusClaim['column']): AttributionVerdict | null =>
    own.find((c) => c.column === column)?.attribution.verdict ?? null;

  for (const own of bySubject.values()) {
    const subject = own.at(0)?.subject;
    if (subject === undefined) continue;
    const [first, second] =
      subject === 'UrlSnapshot'
        ? [verdictOf(own, 'documentHash'), verdictOf(own, 'contentHash')]
        : [verdictOf(own, 'fileHash'), verdictOf(own, 'previousFileHash')];
    const a = first === 'ATTRIBUTED';
    const b = second === 'ATTRIBUTED';
    const foreign = first === 'FOREIGN_SUBMITTER' || second === 'FOREIGN_SUBMITTER';

    if (subject === 'UrlSnapshot') {
      if (a && b) snapshots.BOTH += 1;
      else if (a) snapshots.ATTRIBUTED_BY_DOCUMENT_HASH += 1;
      else if (b) snapshots.ATTRIBUTED_BY_CONTENT_HASH += 1;
      else if (foreign) snapshots.FOREIGN += 1;
      else snapshots.NEITHER += 1;
    } else {
      if (a && b) evidence.BOTH += 1;
      else if (a) evidence.BY_FILE_HASH += 1;
      else if (b) evidence.BY_PREVIOUS_FILE_HASH += 1;
      else if (foreign) evidence.FOREIGN += 1;
      else evidence.NEITHER += 1;
    }
  }

  return { snapshots, evidence };
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
  const byKind: Record<EntryKind, number> = {
    DOCUMENT_HASH: 0,
    CONTENT_HASH: 0,
    EVIDENCE_FILE_HASH: 0,
    EVIDENCE_PREVIOUS_FILE_HASH: 0,
    UNEXPLAINED: 0,
    AMBIGUOUS: 0,
  };
  for (const e of entries) byKind[e.classification.kind] += 1;

  const claims: CorpusClaim[] = [];
  for (const s of corpus.snapshots) {
    claims.push({
      subject: 'UrlSnapshot',
      subjectId: s.id,
      column: 'documentHash',
      attribution: await attributeClaim(reader, entriesAlreadyRead(state.entries), s.documentHash),
    });
    claims.push({
      subject: 'UrlSnapshot',
      subjectId: s.id,
      column: 'contentHash',
      attribution: await attributeClaim(reader, entriesAlreadyRead(state.entries), s.contentHash),
    });
  }
  // The evidence claims left with the columns that made them (above). A frozen
  // registry's evidence entries are explained by its committed ledger file, and a
  // live registry has none to explain: the walk is the only chain writer.
  return {
    state,
    entries: entries.map(({ entry, classification }) => ({ ...entry, classification })),
    byKind,
    claims,
    byVerdict: countByVerdict(claims),
    bySubject: rollUpBySubject(claims),
  };
}
