import { prisma } from '../lib/prisma';
import type { AttributionVerdict } from './registryState';

// ---------------------------------------------------------------------------
// `commitments-owed` — docs/gf-document-flows.md A7 :1558–:1560, §4; plan :188–:189. Run by
// `scripts/commitmentsOwed.ts` inside a deployment, which hands it the chain's own answer (`attributeClaim` over
// the registry reader) — so this module holds no chain client and the suite asks no chain.
//
// A COMMITMENT IS OWED UNLESS THE REGISTRY ATTRIBUTES IT TO OUR REGISTRAR — ANCHORED(d) = ATTRIBUTED(d.commitment)
// (A3 :1366). UNREGISTERED is owed; FOREIGN_SUBMITTER is owed too, because an entry someone else wrote attests
// nothing about this platform's receipt. It asks about the COMMITMENT and never the DOC_ID (§4 :429–:438).
//
// exit 0: none owed · exit 2: owed, listed with age — AN EXPECTED STATE, never a failure (A7 :1560). At step 30
// every document is owed by construction: step 31 builds the pass that pays the debt this lists.
// ---------------------------------------------------------------------------

export interface OwedCommitment {
  commitment: string;
  verdict: Exclude<AttributionVerdict, 'ATTRIBUTED'>;
  /** Whole days since the document was received. */
  ageDays: number;
}

export interface CommitmentsOwedReport {
  examined: number;
  owed: OwedCommitment[];
}

const DAY_MS = 86_400_000;

export async function commitmentsOwed(
  attribute: (commitment: string) => Promise<AttributionVerdict>,
  now: Date,
): Promise<CommitmentsOwedReport> {
  const documents = await prisma.document.findMany({ select: { commitment: true, receivedAt: true } });
  const owed: OwedCommitment[] = [];
  for (const document of [...documents].sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())) {
    const verdict = await attribute(document.commitment);
    if (verdict === 'ATTRIBUTED') continue;
    owed.push({ commitment: document.commitment, verdict, ageDays: Math.floor((now.getTime() - document.receivedAt.getTime()) / DAY_MS) });
  }
  return { examined: documents.length, owed };
}

export function exitCodeForOwed(report: CommitmentsOwedReport): 0 | 2 {
  return report.owed.length === 0 ? 0 : 2;
}

export function formatCommitmentsOwed(report: CommitmentsOwedReport): string {
  const lines = [`commitments-owed: ${String(report.examined)} documents asked, ${String(report.owed.length)} owed`];
  for (const row of report.owed) lines.push(`  OWED  ${row.commitment}  ${row.verdict}  ${String(row.ageDays)} days`);
  return lines.join('\n');
}
