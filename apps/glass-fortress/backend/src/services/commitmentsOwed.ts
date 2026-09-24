import { prisma } from '../lib/prisma';
import { readStanding, type AnchorableDocument, type AnchoredBy } from './anchorDocuments';
import { openDocumentRegistryWindow } from './anchorSnapshots';
import { custody } from './documentPredicates';
import type { AttributionVerdict } from './registryState';

// ---------------------------------------------------------------------------
// `commitments-owed` — docs/gf-document-flows.md A7 :1558–:1560, §4; plan :188–:189. Run by
// `scripts/commitmentsOwed.ts` inside a deployment, which hands it the chain's own answer (`attributeClaim` over
// the registry reader) — so this module holds no chain client and the suite asks no chain.
//
// A DOCUMENT IS OWED UNLESS IT IS ANCHORED — A3 :1366 as ruled 2026-09-24, BOTH arms, read by `readStanding`, the one
// read every caller shares. UNREGISTERED is owed; FOREIGN_SUBMITTER is owed too, because an entry someone else wrote
// attests nothing about this platform's receipt (the PASS stops on it; this list only names it). A document ANCHORED
// by an equal attributed capture is EXCLUDED (A7 :1559 as ruled) and counted on its own line.
//
// THE AGE FLOOR — relay item 8, ruled 2026-09-24. A document younger than OWED_AGE_FLOOR_MS is not yet owed: its
// receipt may still be mining its own anchor, and the floor keeps the receipt's set and the pass's set disjoint. It is
// COUNTED on its own line, never dropped in silence — a filter names what it dropped. The age is compared in
// MILLISECONDS, before any flooring; the row carries its moment and whole minutes.
//
// exit 0: none owed · exit 2: owed beyond the floor, listed — AN EXPECTED STATE, never a failure (A7 :1560).
// ---------------------------------------------------------------------------

/** RULED 2026-09-24 (relay item 8): an OPERATIONAL PARAMETER, measured on `Document.receivedAt`. */
export const OWED_AGE_FLOOR_MS = 10 * 60_000;

/** What `readStanding` answers for one document. */
export interface OwedStanding {
  anchored: boolean;
  by: AnchoredBy;
  verdict: AttributionVerdict | null;
}

export interface OwedCommitment {
  commitment: string;
  /** Carried for the pass, which anchors through the same function; never printed (§4: the DOC_ID is served only with bytes). */
  docId: string;
  held: boolean;
  verdict: Exclude<AttributionVerdict, 'ATTRIBUTED'>;
  /** ISO — the moment, so any age can be recomputed. */
  receivedAt: string;
  /** Whole minutes since receipt, floored. */
  ageMinutes: number;
}

export interface CommitmentsOwedReport {
  examined: number;
  /** Beyond the floor only. */
  owed: OwedCommitment[];
  /** Not anchored and younger than the floor — counted, never listed as owed. */
  younger: number;
  /** Anchored by an equal attributed capture (A3 :1366's capture arm) — excluded, counted. */
  byCapture: number;
}

const MINUTE_MS = 60_000;

export async function commitmentsOwed(
  read: (document: AnchorableDocument) => Promise<OwedStanding>,
  now: Date,
): Promise<CommitmentsOwedReport> {
  const documents = await prisma.document.findMany({ include: { shed: true } });
  const report: CommitmentsOwedReport = { examined: documents.length, owed: [], younger: 0, byCapture: 0 };
  for (const document of [...documents].sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())) {
    const held = custody(document, document.shed) === 'HELD';
    const standing = await read({ commitment: document.commitment, docId: document.docId, held });
    if (standing.anchored) {
      if (standing.by === 'CAPTURE') report.byCapture += 1;
      continue;
    }
    if (standing.verdict === null || standing.verdict === 'ATTRIBUTED') {
      throw new Error(`commitments-owed: ${document.commitment} reads not anchored with the verdict ${String(standing.verdict)} — the two reads disagree`);
    }
    const ageMs = now.getTime() - document.receivedAt.getTime();
    if (ageMs < OWED_AGE_FLOOR_MS) {
      report.younger += 1;
      continue;
    }
    report.owed.push({
      commitment: document.commitment,
      docId: document.docId,
      held,
      verdict: standing.verdict,
      receivedAt: document.receivedAt.toISOString(),
      ageMinutes: Math.floor(ageMs / MINUTE_MS),
    });
  }
  return report;
}

export function exitCodeForOwed(report: CommitmentsOwedReport): 0 | 2 {
  return report.owed.length === 0 ? 0 : 2;
}

const ageOf = (minutes: number): string =>
  `${String(Math.floor(minutes / 1440))}d ${String(Math.floor((minutes % 1440) / 60)).padStart(2, '0')}h ${String(minutes % 60).padStart(2, '0')}m`;

export function formatCommitmentsOwed(report: CommitmentsOwedReport): string {
  const lines = [`commitments-owed: ${String(report.examined)} documents asked, ${String(report.owed.length)} owed`];
  for (const row of report.owed) lines.push(`  OWED  ${row.commitment}  ${row.verdict}  received ${row.receivedAt}  ${ageOf(row.ageMinutes)}`);
  // ALWAYS PRINTED, zero included: a line that appears only when non-zero cannot be told from one never written.
  lines.push(`  ${String(report.younger)} younger than the floor, not yet owed`);
  lines.push(`  ${String(report.byCapture)} anchored by an equal capture`);
  return lines.join('\n');
}

/**
 * `get_environment`'s `documentsOwed` (plan :201–:203): the owed count beyond the floor, or NULL where the chain could
 * not be read — never 0, which would read as "nothing owed" for a chain nobody reached.
 */
export async function documentsOwedNow(now: Date): Promise<number | null> {
  const window = openDocumentRegistryWindow();
  try {
    return (await commitmentsOwed((document) => readStanding(window, document), now)).owed.length;
  } catch (error) {
    console.error(`documentsOwed: the chain could not be read — ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
