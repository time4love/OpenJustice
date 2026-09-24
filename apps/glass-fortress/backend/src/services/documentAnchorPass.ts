import { anchorDocument, type AnchorableDocument } from './anchorDocuments';
import { ChainUnavailableError, type RegistryWindow } from './anchorSnapshots';
import { commitmentsOwed, type CommitmentsOwedReport, type OwedCommitment, type OwedStanding } from './commitmentsOwed';

// ---------------------------------------------------------------------------
// THE STANDING PASS — `forensics:anchor-documents -- --env <env>`, docs/gf-document-refactor-plan.md :198–:204; relay
// item 8 as ruled 2026-09-24. "Takes commitments-owed's list, anchors each through the same caller, and reads chain
// state after. It is run ON DEMAND, in the container, like every maintenance act" — a MAINTENANCE act (CLAUDE.md), so
// its window is the environment's, behind the deployment guard, and it runs nowhere else.
//
// ITS INPUT IS THE LIST BEYOND THE 10-MINUTE FLOOR: a receipt's own anchor may still be mining, and the floor keeps the
// receipt's set and the pass's set disjoint. It anchors through `anchorDocument` — the ONE document-anchoring function,
// whose own before-read makes a second attempt safe.
//
// IT STOPS, three ways, and each is an exit code:
//   a FOREIGN_SUBMITTER in its input → BEFORE THE FIRST WRITE, exit 1, naming each: a defect, never a debt;
//   the first CHAIN_UNAVAILABLE      → no further attempt (the walk's memoised rejection); still owed → exit 2;
//   any other failure                → a defect, exit 1.
// Then it reads the list AGAIN — the after-read is the check — and exits 0 only when nothing beyond the floor is owed.
//
// A second concurrent run is the operator's error, prevented by the word, not by code (recorded in step 31's dated
// doc); the before-read and the duplicate refusal keep one from producing a false answer.
// ---------------------------------------------------------------------------

export interface PassResult {
  before: CommitmentsOwedReport;
  /** FOREIGN_SUBMITTER rows in the input — non-empty means nothing was written. */
  foreign: OwedCommitment[];
  paid: { commitment: string; wrote: boolean; anchored: boolean }[];
  stopped: { commitment: string; reason: string } | null;
  /** The list read again after the writes; null where the after-read itself could not be made. */
  after: CommitmentsOwedReport | null;
  exit: 0 | 1 | 2;
}

export async function runAnchorPass(
  window: RegistryWindow,
  read: (document: AnchorableDocument) => Promise<OwedStanding>,
  now: () => Date,
): Promise<PassResult> {
  const before = await commitmentsOwed(read, now());
  const foreign = before.owed.filter((row) => row.verdict === 'FOREIGN_SUBMITTER');
  if (foreign.length > 0) return { before, foreign, paid: [], stopped: null, after: null, exit: 1 };

  const paid: PassResult['paid'] = [];
  let stopped: PassResult['stopped'] = null;
  let defect = false;
  for (const row of before.owed) {
    try {
      const outcome = await anchorDocument(window, { commitment: row.commitment, docId: row.docId, held: row.held });
      paid.push({ commitment: row.commitment, wrote: outcome.wrote, anchored: outcome.anchored });
    } catch (error) {
      stopped = { commitment: row.commitment, reason: error instanceof Error ? error.message : String(error) };
      defect = !(error instanceof ChainUnavailableError);
      break;
    }
  }

  let after: CommitmentsOwedReport | null = null;
  try {
    after = await commitmentsOwed(read, now());
  } catch (error) {
    stopped ??= { commitment: '(the after-read)', reason: error instanceof Error ? error.message : String(error) };
  }
  const exit = defect ? 1 : after !== null && after.owed.length === 0 ? 0 : 2;
  return { before, foreign, paid, stopped, after, exit };
}

export function formatAnchorPass(result: PassResult): string {
  const lines = [`anchor-documents: ${String(result.before.owed.length)} owed beyond the floor, ${String(result.before.younger)} younger, ${String(result.before.byCapture)} anchored by an equal capture`];
  for (const row of result.foreign) lines.push(`  STOPPED BEFORE ANY WRITE — FOREIGN_SUBMITTER  ${row.commitment}: a defect to investigate, never a debt`);
  for (const row of result.paid) lines.push(`  ${row.wrote ? 'WROTE ' : 'FOUND '}  ${row.commitment}  anchored ${String(row.anchored)}`);
  if (result.stopped !== null) lines.push(`  STOPPED at ${result.stopped.commitment} — ${result.stopped.reason}`);
  lines.push(result.after === null ? '  after: not read' : `  after: ${String(result.after.owed.length)} owed beyond the floor`);
  return lines.join('\n');
}
