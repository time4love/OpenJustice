import type { DocumentOpening } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { capturesEqualToEach } from './documentCaptures';
import { openingsOf } from './documentOpenings';
import { OPENING_ORDER, custody, type Custody } from './documentPredicates';

// ---------------------------------------------------------------------------
// `forensics:document-openings` — docs/gf-document-flows.md A7 :1592 and §12 :1210–:1211; document plan step 34 :280.
// Run by `scripts/documentOpenings.ts` inside a deployment (`runOperationalScript`, the environment stated twice), which
// writes its ledger record (A7 :1545). READ-ONLY: it reaches no chain, no bucket and no model, and writes nothing.
//
// TWO MEASUREMENTS, and the third A7 :1592 names is STEP 35's. "SHED by cause" needs the withdrawal door and
// `shed_document`, which step 35 builds, and plan :304 says so in terms ("`forensics:document-openings` gaining SHED by
// cause" — REVIEW's F1, R86 Entry 2). What this step counts:
//
//   openings chosen by custody (§12 :1211) — "whether a document is ever public in full, and whether PASSAGE is the norm
//     for a sealed one". OPENED(d) is `documentOpenings.openingsOf`'s, THE loader (Q9, Q14: the widest in force at any
//     publication of a version citing d), CALLED; CUSTODY(d) is `documentPredicates.custody`, CALLED.
//   the §2 equality (§12 :1210) — "whether the one witness the platform did not create ever appears": documents whose
//     DOC_ID equals a capture's `documentHash`, asked of `equalsCapture` through `documentCaptures.capturesEqualToEach`
//     (ONE read for the corpus, LOW-t), which compares DIGESTS and never spellings.
//
// COUNTS ONLY — REVIEW's suppression (R86 Entry 2, overrulable): §12's questions are measurements, and A7 :1592 lists
// nothing, unlike commitments-owed's "owed, listed" (A7 :1560). So no line names a document — no commitment beside a page
// or capture (which would tie the salted name to the DOC_ID the capture's hash is), no DOC_ID, no title.
//
// EXIT 0 ALWAYS on its subject: a measurement is not a gate (`extractorCoverage.ts`'s precedent). It fails only when it
// cannot LOOK — a read that throws, or counts that do not add up, which would be a report about something it did not see.
// ---------------------------------------------------------------------------

/** An opening cell — the three openings in §7's order, and a document no publication has opened. */
export type OpeningCell = DocumentOpening | 'NOT_OPENED';

export interface DocumentOpeningsReport {
  documents: number;
  /** Every document counted ONCE: under its custody, in the opening in force for it (or NOT_OPENED). */
  byCustody: Record<Custody, Record<OpeningCell, number>>;
  /** Documents whose DOC_ID equals a named capture's `documentHash` — the §2 equality. */
  equalsCapture: number;
}

const CUSTODIES: readonly Custody[] = ['HELD', 'SEALED', 'NONE'];
const CELLS: readonly OpeningCell[] = [...OPENING_ORDER, 'NOT_OPENED'];

const emptyRow = (): Record<OpeningCell, number> => ({ PASSAGE: 0, CONTENT: 0, BYTES: 0, NOT_OPENED: 0 });

export async function documentOpenings(): Promise<DocumentOpeningsReport> {
  const documents = await prisma.document.findMany({ include: { shed: true } });
  const openings = await openingsOf(documents.map((d) => d.commitment));
  const equal = await capturesEqualToEach(documents.map((d) => d.docId));

  const byCustody: Record<Custody, Record<OpeningCell, number>> = { HELD: emptyRow(), SEALED: emptyRow(), NONE: emptyRow() };
  let equalsCapture = 0;
  for (const document of documents) {
    const opened = openings.get(document.commitment)?.opened ?? null;
    byCustody[custody(document, document.shed)][opened ?? 'NOT_OPENED'] += 1;
    if ((equal.get(document.docId) ?? null) !== null) equalsCapture += 1;
  }

  // THE IDENTITY: every document is in exactly one cell. A total that disagrees is a report about something it did not
  // see, and it refuses rather than print one.
  const counted = CUSTODIES.reduce((sum, c) => sum + CELLS.reduce((row, cell) => row + byCustody[c][cell], 0), 0);
  if (counted !== documents.length) {
    throw new Error(`document-openings: ${String(counted)} documents counted in the cells of ${String(documents.length)} read — the report is refused.`);
  }
  return { documents: documents.length, byCustody, equalsCapture };
}

/** The printed report — COUNTS ONLY, every line always printed, zero included (commitmentsOwed :102's rule). */
export function formatDocumentOpenings(report: DocumentOpeningsReport): string {
  const lines = [`document-openings: ${String(report.documents)} documents`];
  for (const c of CUSTODIES) {
    const row = report.byCustody[c];
    lines.push(
      `  ${c.padEnd(7)} PASSAGE ${String(row.PASSAGE)} · CONTENT ${String(row.CONTENT)} · BYTES ${String(row.BYTES)} · not opened ${String(row.NOT_OPENED)}`,
    );
  }
  lines.push(`  the §2 equality: ${String(report.equalsCapture)} of ${String(report.documents)} documents whose DOC_ID equals a capture's documentHash`);
  lines.push('  SHED by cause: document step 35 (plan :304) — not measured by this step');
  return lines.join('\n');
}
