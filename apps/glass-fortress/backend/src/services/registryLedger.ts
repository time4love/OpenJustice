import { EXPECTED_CHAIN_ID } from '../lib/chainIdentity';
import {
  classifyEntry,
  type CorpusHashes,
  type EntryClassification,
  type RegistryEntry,
  type RegistryState,
} from './registryState';

// ---------------------------------------------------------------------------
// THE REGISTRY LEDGER. Evidence flows §8; refactor plan §3 step 9, sub-step 2.
//
// "Every old entry is explained in git, not in a table." Before either database
// is dropped, every index on the frozen registry is written down — hash, what
// formula produced it from which inputs, what it attested, what replaces it —
// verified complete against totalEvidence() and committed to this public
// repository with the old address. An unexplained entry is indistinguishable
// from a tampered one (Level 10), so this module REFUSES rather than emits when
// one exists, and names every offending index rather than the first.
//
// THE KINDS. Four are read from the corpus by `classifyEntry` — the column that
// holds the hash says which formula produced it. Two are the researcher's
// ruling of 2026-09-06 for entries no column explains, recorded verbatim in
// docs/gf-rebuild-staging-measure-2026-09-06.md §2:
//
//   PRE_WIPE  — block time before 2026-08-21, staging only, derived. The row
//               went with the database destroyed that day.
//   ORPHANED  — a committed per-index list, per registry. No current or
//               superseded row holds the hash; the row that produced it was
//               rewritten or removed by a later run; which one is archaeology
//               under CLAUDE.md. A hash matching a column is never ORPHANED,
//               whatever the list says: the list never overrides the join.
//
// A pure function over state already read, so the suite proves every refusal
// without a chain; the script is the one caller that reads.
// ---------------------------------------------------------------------------

/**
 * The indexes ruled ORPHANED, per registry (lower-case address).
 *
 * A COMMITTED LIST, deliberately, rather than "any unexplained post-wipe entry":
 * a rule that accepts whatever it cannot explain is not a rule. Adding an index
 * here is a ruling, made in a dated doc, and this constant cites it.
 */
export const ORPHANED_BY_REGISTRY: Readonly<Record<string, readonly number[]>> = {
  // Base Sepolia, staging's first registry. Ruled 2026-09-06,
  // docs/gf-rebuild-staging-measure-2026-09-06.md §2.
  '0x65b9a7acb45aa05e7ed207844f93a2b308373853': [29, 30, 31, 32, 36],
};

/** The day staging's database was destroyed. Entries before it lost their rows with it. */
const STAGING_WIPE_SECONDS = Date.UTC(2026, 7, 21) / 1000;

export type LedgerKind =
  | 'DOCUMENT_HASH'
  | 'CONTENT_HASH'
  | 'EVIDENCE_FILE_HASH'
  | 'EVIDENCE_PREVIOUS_FILE_HASH'
  | 'PRE_WIPE'
  | 'ORPHANED';

export interface CaptureInput {
  snapshotId: string;
  url: string;
  waybackTimestamp: string | null;
}
export interface EvidenceInput {
  evidenceId: string;
  /**
   * The writer that named the row, so the ledger states the formula per row.
   * A plain string from evidence step 11b: `Evidence.evidenceType` left the
   * schema with the class it described, and the ledgers that used it are already
   * emitted and committed (evidence §8 — "explained in git, not in a table").
   */
  evidenceType: string;
}

export interface LedgerEntry {
  index: number;
  /** 0x-prefixed, lower-case, as the chain holds it. */
  hash: string;
  submitter: string;
  /** ISO, from the block timestamp. */
  blockTime: string;
  /** The category string as written on the chain. */
  category: string;
  kind: LedgerKind;
  /** What produced the hash — the function and its inputs' shape, naming the code. */
  formula: string;
  /** The rows the join found: capture rows or evidence rows, never both. */
  inputs: CaptureInput[] | EvidenceInput[];
  /** What the entry attested, in the words evidence flows §8 uses. */
  attested: string;
  /** What replaces it — a rule per kind at emission. */
  replacedBy: string;
}

export interface RegistryLedger {
  /** Lower-case. */
  registry: string;
  chainId: number;
  /** Derived from the chain id, never a flag. */
  testnet: boolean;
  registrar: string;
  totalEvidence: number;
  readAt: string;
  /** The commit the emitting container was built from; null when Railway did not say. */
  commit: string | null;
  /** The registry that replaced this one, once step 4 has rotated. Null until then; filled in its own commit. */
  successor: string | null;
  entries: LedgerEntry[];
}

export interface LedgerInput {
  state: RegistryState;
  corpus: CorpusHashes;
  chainId: number;
  commit: string | null;
}

/** Thrown for every refusal here, so a caller can report rather than stack-trace. */
export class LedgerRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerRefusal';
  }
}

const EXTRACTION_ANCHOR_FORMULA =
  'sha256(extractArticleText(captureHtml(document), rawCaptureUrl(waybackTimestamp, url))) — ' +
  "Readability's article text of the page (src/lib/archiveText.ts), stored as UrlSnapshot.contentHash; " +
  'one entry covers every capture whose extraction is byte-identical';

const PAYLOAD_ANCHOR_FORMULA =
  'sha256(document) — the payload as served by the archive, bytes as fetched with no decoding ' +
  '(sha256Bytes in src/lib/captureDocument.ts), stored as UrlSnapshot.documentHash';

const FORENSIC_NAME_FORMULA =
  'forensicEvidenceFileHash(url, before, after) = sha256(url + "\\n" + before.waybackTimestamp + "\\n" + ' +
  'before.contentHash + "\\n" + after.waybackTimestamp + "\\n" + after.contentHash) ' +
  '(src/services/forensicEvidence.ts), stored as Evidence.fileHash';

const DOCUMENT_NAME_FORMULA =
  'sha256 of the submitted payload via Web3Service.hashFile, by one of its five writers: ' +
  'createEvidenceFromUrl (the bytes fetched from the URL); evidenceRoutes (an uploaded file); ' +
  'createEvidenceFromText (url + "\\n\\n" + text.slice(0, 40000) — the 40,000-character bound is part of the formula); ' +
  'persistScreenshotEvidence (the concatenated image buffers); thesisRoutes (a document\'s ciphertext, base64-decoded). ' +
  'Which writer produced it is not recorded on the row; stored as Evidence.fileHash';

const EVIDENCE_ATTESTED =
  'a SELECTION: that this deployment named a record as evidence under a formula that is leaving the code, ' +
  "with the classifier's categories written as its public label";

const EVIDENCE_REPLACED_BY =
  "no row — evidence is rebuilt by the researcher's own hand from corpus records under evidence flows; " +
  'this entry stays on the frozen registry, explained here';

const PRE_WIPE_FORMULA =
  'unknown — the row that produced it went with the database destroyed on 2026-08-21 ' +
  '(docs/gf-staging-data-loss-postmortem-2026-08-21.md)';

const ORPHANED_FORMULA =
  'unknown — no current or superseded row holds the hash; the row that produced it was rewritten ' +
  'or removed by a later run, which one is archaeology under CLAUDE.md ' +
  '(docs/gf-rebuild-staging-measure-2026-09-06.md §2)';

/**
 * THE formula string for a kind, given the entry's inputs.
 *
 * One function, two callers: the builder writes it into every entry, and
 * `registryLedgerCommitted.test.ts` holds that every entry in a committed file
 * still carries it. A ledger committed before a formula constant changed is then
 * red until it is re-emitted — file and code cannot drift apart silently.
 */
export function formulaFor(kind: LedgerKind, inputs: LedgerEntry['inputs']): string {
  const forensic = inputs.some((i) => 'evidenceType' in i && i.evidenceType === 'FORENSIC_DIFF');
  switch (kind) {
    case 'DOCUMENT_HASH':
      return PAYLOAD_ANCHOR_FORMULA;
    case 'CONTENT_HASH':
      return EXTRACTION_ANCHOR_FORMULA;
    case 'EVIDENCE_FILE_HASH':
      return forensic ? FORENSIC_NAME_FORMULA : DOCUMENT_NAME_FORMULA;
    case 'EVIDENCE_PREVIOUS_FILE_HASH':
      return (
        `${forensic ? FORENSIC_NAME_FORMULA : DOCUMENT_NAME_FORMULA} — over the inputs as they stood ` +
        'before forensics:rehash-evidence re-derived them; stored as Evidence.previousFileHash'
      );
    case 'PRE_WIPE':
      return PRE_WIPE_FORMULA;
    case 'ORPHANED':
      return ORPHANED_FORMULA;
  }
}

function iso(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

function captureInputs(c: EntryClassification): CaptureInput[] {
  return c.snapshots.map((s) => ({ snapshotId: s.id, url: s.url, waybackTimestamp: s.waybackTimestamp }));
}

function evidenceInputs(c: EntryClassification): EvidenceInput[] {
  return c.evidence.map((e) => ({
    evidenceId: e.id,
    // A live registry classifies no entry as an evidence name — nothing above the
    // corpus is anchored — so this arm has no producer and the constant says so
    // rather than reaching for a column that has left.
    evidenceType: 'RETIRED_FORMULA',
  }));
}

function explained(
  entry: RegistryEntry,
  c: EntryClassification,
): Pick<LedgerEntry, 'kind' | 'formula' | 'inputs' | 'attested' | 'replacedBy'> | null {
  const when = iso(entry.timestamp);
  switch (c.kind) {
    case 'DOCUMENT_HASH':
      return {
        kind: 'DOCUMENT_HASH',
        formula: formulaFor('DOCUMENT_HASH', []),
        inputs: captureInputs(c),
        attested: `that this deployment held these exact bytes of the page, as the archive served them, on ${when}`,
        replacedBy:
          'the same documentHash registered afresh on the successor registry with its own block time, ' +
          'its category carrying the anchoring scheme; this entry stays as the earlier date',
      };
    case 'CONTENT_HASH':
      return {
        kind: 'CONTENT_HASH',
        formula: formulaFor('CONTENT_HASH', []),
        inputs: captureInputs(c),
        attested:
          `that this deployment held the EXTRACTION of these captures on ${when} — narrower than the ` +
          'payload, not false',
        replacedBy:
          "each listed capture's documentHash on the successor registry; the extractor-equality " +
          'measurement (docs/gf-rebuild-staging-measure-2026-09-06.md §3) ties the bytes registered there ' +
          'to the text attested here',
      };
    case 'EVIDENCE_FILE_HASH': {
      const inputs = evidenceInputs(c);
      return {
        kind: 'EVIDENCE_FILE_HASH',
        formula: formulaFor('EVIDENCE_FILE_HASH', inputs),
        inputs,
        attested: `${EVIDENCE_ATTESTED}, on ${when}`,
        replacedBy: EVIDENCE_REPLACED_BY,
      };
    }
    case 'EVIDENCE_PREVIOUS_FILE_HASH': {
      const inputs = evidenceInputs(c);
      return {
        kind: 'EVIDENCE_PREVIOUS_FILE_HASH',
        formula: formulaFor('EVIDENCE_PREVIOUS_FILE_HASH', inputs),
        inputs,
        attested: `an earlier name of the same evidence row — ${EVIDENCE_ATTESTED}, on ${when}`,
        replacedBy: "the row's current fileHash entry on this registry, itself replaced by no row",
      };
    }
    case 'UNEXPLAINED':
    case 'AMBIGUOUS':
      return null;
  }
}

/** The researcher's ruled kinds, for an entry no column explains; null means refuse. */
function ruled(entry: RegistryEntry, registry: string, chainId: number): 'PRE_WIPE' | 'ORPHANED' | null {
  if (chainId === EXPECTED_CHAIN_ID.staging && entry.timestamp < STAGING_WIPE_SECONDS) return 'PRE_WIPE';
  if ((ORPHANED_BY_REGISTRY[registry] ?? []).includes(entry.index)) return 'ORPHANED';
  return null;
}

function ruledEntry(entry: RegistryEntry, kind: 'PRE_WIPE' | 'ORPHANED'): Pick<
  LedgerEntry,
  'kind' | 'formula' | 'inputs' | 'attested' | 'replacedBy'
> {
  const when = iso(entry.timestamp);
  const onlyTheChain =
    `only what the chain says: category "${entry.category}", submitted by our registrar on ${when}`;
  return kind === 'PRE_WIPE'
    ? {
        kind,
        formula: formulaFor(kind, []),
        inputs: [],
        attested: `${onlyTheChain}; the block time precedes the 2026-08-21 wipe`,
        replacedBy: 'nothing',
      }
    : {
        kind,
        formula: formulaFor(kind, []),
        inputs: [],
        attested: onlyTheChain,
        replacedBy: 'nothing',
      };
}

/**
 * The ledger, or a refusal naming every reason.
 *
 * `state.entries.length === state.totalEvidence` is asserted again here although
 * `readRegistryState` already refuses a partial read: this function takes a
 * value it did not produce, and a ledger is the one artefact that must not be
 * short by one whatever produced its input.
 */
export function buildRegistryLedger(input: LedgerInput): RegistryLedger {
  const { state, corpus, chainId, commit } = input;
  const registry = state.registryAddress.toLowerCase();

  if (state.entries.length !== state.totalEvidence) {
    throw new LedgerRefusal(
      `Refusing: ${String(state.entries.length)} entries against totalEvidence() ${String(state.totalEvidence)}. ` +
        'A ledger short by one explains a tampered registry as a complete one.',
    );
  }
  if (state.entries.length === 0) {
    throw new LedgerRefusal('Refusing: the registry is empty — there is nothing to explain, and a ledger of nothing is not a ledger.');
  }

  const refusals: string[] = [];
  const entries: LedgerEntry[] = [];
  for (const entry of state.entries) {
    const classification = classifyEntry(entry, corpus);
    let explanation = explained(entry, classification);
    if (explanation === null && classification.kind === 'AMBIGUOUS') {
      refusals.push(
        `  index ${String(entry.index)} is AMBIGUOUS — ${String(classification.snapshots.length)} capture(s) and ` +
          `${String(classification.evidence.length)} evidence row(s) hold ${entry.fileHash}; which formula produced it ` +
          'cannot be read from the join',
      );
      continue;
    }
    if (explanation === null) {
      const kind = ruled(entry, registry, chainId);
      if (kind === null) {
        refusals.push(
          `  index ${String(entry.index)} (${iso(entry.timestamp)}, category "${entry.category}") matches no hash ` +
            'column and is not on the ORPHANED list for this registry',
        );
        continue;
      }
      explanation = ruledEntry(entry, kind);
    }
    entries.push({
      index: entry.index,
      hash: entry.fileHash,
      submitter: entry.submitter,
      blockTime: iso(entry.timestamp),
      category: entry.category,
      ...explanation,
    });
  }

  if (refusals.length > 0) {
    throw new LedgerRefusal(
      `Refusing to emit a ledger for ${registry}: ${String(refusals.length)} of ${String(state.entries.length)} ` +
        `entries are unexplained.\n${refusals.join('\n')}\n` +
        'Nothing below step 2 runs while an index is unexplained (evidence flows §8).',
    );
  }

  return {
    registry,
    chainId,
    testnet: chainId !== EXPECTED_CHAIN_ID.production,
    registrar: state.registrarAddress,
    totalEvidence: state.totalEvidence,
    readAt: state.readAt,
    commit,
    successor: null,
    entries,
  };
}
