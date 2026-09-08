import { prisma } from '../lib/prisma';
import { recordId } from '../lib/evidenceIdentity';

// ---------------------------------------------------------------------------
// IS EVERY EVIDENCE ROW THE RECORD IT CLAIMS TO BE?
//
// `evidence-recomputable`, docs/gf-evidence-flows.md A7 and Level 7. Evidence is
// a corpus record a researcher has PROMOTED, so its identity is the record's
// identity — and RECOMPUTABLE is therefore a PREDICATE a row either satisfies or
// is malformed by, NEVER A RATE. §2 says it in one line: "a row that fails it is
// MALFORMED, never stale: nothing legitimate makes it false."
//
// THAT IS WHY THIS REPAIRS NOTHING. `forensics:rehash-evidence` used to rewrite
// `fileHash` on a drifting row, which made a wrong row look right and destroyed
// the only evidence of how it got that way. Under this design there is no drift
// to absorb: the three inputs are immutable, so a mismatch is a WRITE DEFECT,
// and the instrument's whole job is to name it and stop.
//
// FOUR THINGS PER ROW, and each is a different way to be wrong:
//
//   RECOMPUTABLE   fileHash = ID(the record it is keyed to)
//   ONE KEY        exactly one record key set, AND it matches `kind`
//   AFFIRMED       the version it says a human stood behind exists on the record
//   ARGUED         its debate is PROMOTED, for that record and that thesis
//
// The first two are also CHECK constraints in the schema, and holding them here
// too is not duplication: a constraint refuses a write, and this asks whether
// what is already stored is true — of a database that may have been restored,
// migrated, or written by a version of the code nobody is reading any more.
//
// ZERO ROWS IS A PASS, AND IT SAYS SO IN ITS FIRST LINE. Elsewhere in this
// repository an empty subject set is a REFUSAL — `auditOnChainAnchors` exits
// non-zero on one, because a reassuring report over nothing reads as proof. The
// difference is what the question is: "does every anchoring claim carry a check?"
// is vacuous with no claims, while "is any stored row malformed?" has a true and
// useful answer at zero. So the count is printed FIRST, before any verdict, and
// the exit code carries no reassurance the number does not.
// ---------------------------------------------------------------------------

export type MalformedReason =
  | 'NOT_RECOMPUTABLE'
  | 'NO_RECORD_KEY'
  | 'MULTIPLE_RECORD_KEYS'
  | 'KEY_DOES_NOT_MATCH_KIND'
  | 'RECORD_MISSING'
  | 'AFFIRMED_VERSION_MISSING'
  | 'DEBATE_NOT_PROMOTED';

export interface MalformedRow {
  fileHash: string;
  kind: string;
  reason: MalformedReason;
  /** What the row claims, and what the corpus says — never a repair instruction. */
  detail: string;
}

export interface EvidenceAuditReport {
  rows: number;
  malformed: MalformedRow[];
}

/** The capture columns a record id is composed from — A1's three inputs. */
const CAPTURE_IDENTITY = {
  waybackTimestamp: true,
  documentHash: true,
  trackedUrl: { select: { url: true } },
} as const;

/**
 * Every evidence row, checked against the corpus record it is keyed to.
 *
 * Read-only by construction: it opens no transaction and writes nothing, so it
 * can be re-run against a corpus it did not touch and cannot be used to verify
 * its own repair — because it performs none.
 */
export async function auditEvidence(): Promise<EvidenceAuditReport> {
  const rows = await prisma.evidence.findMany({
    select: {
      fileHash: true,
      kind: true,
      snapshotId: true,
      urlVersionDiffId: true,
      documentCommitment: true,
      affirmedContentVersionHash: true,
      snapshot: { select: CAPTURE_IDENTITY },
      urlVersionDiff: {
        select: {
          beforeSnapshot: { select: CAPTURE_IDENTITY },
          afterSnapshot: { select: CAPTURE_IDENTITY },
          contentVersions: { select: { contentVersionHash: true } },
        },
      },
      debateSession: { select: { status: true, recordFileHash: true } },
    },
    orderBy: { fileHash: 'asc' },
  });

  const malformed: MalformedRow[] = [];
  const fail = (row: { fileHash: string; kind: string }, reason: MalformedReason, detail: string): void => {
    malformed.push({ fileHash: row.fileHash, kind: row.kind, reason, detail });
  };

  for (const row of rows) {
    const keys = [row.snapshotId, row.urlVersionDiffId, row.documentCommitment].filter(
      (k) => k !== null,
    );
    if (keys.length === 0) {
      fail(row, 'NO_RECORD_KEY', 'no snapshotId, urlVersionDiffId or documentCommitment is set');
      continue;
    }
    if (keys.length > 1) {
      fail(row, 'MULTIPLE_RECORD_KEYS', `${String(keys.length)} record keys are set; exactly one may be`);
      continue;
    }

    if (row.kind === 'CAPTURE') {
      if (row.snapshotId === null) {
        fail(row, 'KEY_DOES_NOT_MATCH_KIND', 'kind is CAPTURE and the key set is not snapshotId');
        continue;
      }
      const c = row.snapshot;
      if (c?.waybackTimestamp == null) {
        fail(row, 'RECORD_MISSING', `snapshot ${row.snapshotId} is absent, or holds no waybackTimestamp`);
        continue;
      }
      const expected = recordId({
        kind: 'CAPTURE',
        url: c.trackedUrl.url,
        capture: { waybackTimestamp: c.waybackTimestamp, documentHash: c.documentHash },
      });
      if (expected !== row.fileHash) {
        fail(row, 'NOT_RECOMPUTABLE', `the record it is keyed to names ${expected}`);
      }
      continue;
    }

    if (row.kind === 'DIFF') {
      if (row.urlVersionDiffId === null) {
        fail(row, 'KEY_DOES_NOT_MATCH_KIND', 'kind is DIFF and the key set is not urlVersionDiffId');
        continue;
      }
      const d = row.urlVersionDiff;
      const before = d?.beforeSnapshot;
      const after = d?.afterSnapshot;
      if (
        d === null ||
        before === undefined ||
        after === undefined ||
        before.waybackTimestamp === null ||
        after.waybackTimestamp === null
      ) {
        fail(row, 'RECORD_MISSING', `diff ${row.urlVersionDiffId} is absent, or an endpoint holds no waybackTimestamp`);
        continue;
      }
      const expected = recordId({
        kind: 'DIFF',
        url: before.trackedUrl.url,
        before: { waybackTimestamp: before.waybackTimestamp, documentHash: before.documentHash },
        after: { waybackTimestamp: after.waybackTimestamp, documentHash: after.documentHash },
      });
      if (expected !== row.fileHash) {
        fail(row, 'NOT_RECOMPUTABLE', `the pair it is keyed to names ${expected}`);
        continue;
      }
      const versions = d.contentVersions.map((v) => v.contentVersionHash);
      if (!versions.includes(row.affirmedContentVersionHash)) {
        fail(
          row,
          'AFFIRMED_VERSION_MISSING',
          `it stands behind ${row.affirmedContentVersionHash}, which is not a version of this diff`,
        );
      }
      continue;
    }

    // DOCUMENT: the commitment IS the fileHash (document flows A2). The bytes
    // that reproduce it are the document layer's, built at step 28; until then
    // there is nothing here to recompute from, and saying so is the honest
    // answer rather than a silent pass.
    if (row.documentCommitment === null) {
      fail(row, 'KEY_DOES_NOT_MATCH_KIND', 'kind is DOCUMENT and the key set is not documentCommitment');
    } else if (row.documentCommitment !== row.fileHash) {
      fail(row, 'NOT_RECOMPUTABLE', `fileHash must equal the commitment; the row holds ${row.documentCommitment}`);
    }
  }

  for (const row of rows) {
    const debate = row.debateSession;
    if (debate === null) continue;
    if (debate.status !== 'PROMOTED') {
      fail(row, 'DEBATE_NOT_PROMOTED', `its debate is ${debate.status}; a row exists only from a cleared argument`);
    } else if (debate.recordFileHash !== row.fileHash) {
      fail(row, 'DEBATE_NOT_PROMOTED', `its debate argued for ${debate.recordFileHash}`);
    }
  }

  return { rows: rows.length, malformed };
}

/** The report as a person reads it — the count FIRST, then what is wrong. */
export function formatEvidenceAudit(report: EvidenceAuditReport): string {
  const lines = [`Evidence rows: ${String(report.rows)}`];
  if (report.rows === 0) {
    lines.push('');
    lines.push('No evidence has been promoted in this environment. Nothing is malformed because');
    lines.push('nothing is stored — this is a true answer about the rows, not a check that was');
    lines.push('skipped.');
    return lines.join('\n');
  }
  lines.push(`Malformed:     ${String(report.malformed.length)}`);
  if (report.malformed.length === 0) {
    lines.push('');
    lines.push('Every row names the record it is keyed to.');
    return lines.join('\n');
  }
  lines.push('');
  for (const m of report.malformed) {
    lines.push(`${m.fileHash}  ${m.kind}  ${m.reason}`);
    lines.push(`    ${m.detail}`);
  }
  lines.push('');
  lines.push('NOT REPAIRED, and there is no tool that would. A mismatch here is a WRITE DEFECT:');
  lines.push('the three inputs to a record id are immutable, so nothing legitimate makes one');
  lines.push('false. Rewriting the hash would make a wrong row look right.');
  return lines.join('\n');
}
