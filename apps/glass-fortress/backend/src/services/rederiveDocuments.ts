import { Prisma, type Document } from '@prisma/client';
import { CURRENT_EXTRACTOR } from '../lib/documentExtractor';
import { prisma } from '../lib/prisma';
import { WRITE_TRANSACTION } from '../walk/pageLog';
import { deriveContent, recordContentVersion } from './documentContentVersions';
import { currentVersion, custody } from './documentPredicates';

// ---------------------------------------------------------------------------
// THE DERIVATION PASS OVER HELD BYTES — plan step 29 :159-:161, §3 :346-:348.
//
// "the derivation pass over HELD bytes for when `CURRENT_EXTRACTOR` moves, in the
// deployment, WRITING VERSIONS AND NEVER A DECISION."
//
// WHAT IT DOES, AND THE THREE THINGS IT REFUSES TO DO. It reads every HELD document
// whose CURRENT is not defined under today's extractor, derives from the bytes, and
// appends a version — keeping the old, because content moves only by a new version
// that keeps the old (§3 :271-:275).
//
// WHEN THE TEXT DID NOT MOVE IT STILL RECORDS SOMETHING (RULED 2026-09-23). A document
// whose text a new extractor REPRODUCES gets no new row — §3 :317 forbids one — but the
// row it already has gains today's extractor in `derivedUnder`, so CURRENT(d) resolves
// to it (A3 :1368). Before that ruling this case was a TRAP: the pass reported UNCHANGED,
// no row carried the new version, and the document read AWAITING_DERIVATION forever —
// permanently uncitable under A6 :1531. The append is `recordContentVersion`'s, because
// this table has ONE writer and a pass issuing its own update would be a second. It does NOT affirm anything: when a promoted
// document's content moves, the human owes a decision and the pass never makes it
// (evidence Flow E3, "no automatic re-affirmation, ever"). It does NOT touch a
// SEALED document: that document's plaintext existed once and nothing can derive
// another (§3 :339-:342), so a better engine improves every held scan and no sealed
// one — a cost the design states rather than hides. And it does NOT delete.
//
// ONE TRANSACTION PER DOCUMENT, AND THE DERIVATION HAPPENS OUTSIDE IT. The five
// second window is real and the suite cannot see it; a workbook's cell walk inside
// a transaction is exactly the shape that failed on 2026-09-06.
//
// IT IS RUN ON DEMAND, IN THE DEPLOYMENT, like every maintenance act — never on a
// schedule, and never from a laptop. `runOperationalScript` is what holds that.
// ---------------------------------------------------------------------------

export interface RederiveOutcome {
  commitment: string;
  /** `SUPERSEDED` wrote a new version · `UNCHANGED` found the same content · `SKIPPED` says why. */
  outcome: 'SUPERSEDED' | 'UNCHANGED' | 'SKIPPED';
  detail: string;
}

export interface RederiveReport {
  /** Never null: the researcher ruled the extractor on 2026-09-23 and it is set. */
  extractor: string;
  examined: number;
  outcomes: RederiveOutcome[];
}

/** Reads the object a HELD document's `bytes` column names — the bucket, by DOC_ID. */
export type ReadObject = (document: Document) => Promise<Uint8Array | null>;

/**
 * The pass. `readObject` is injected because the bucket is reachable only from a
 * deployment, and injecting it is what lets the outage arm be proven in the suite
 * with a reader that fails rather than staged on an environment.
 */
export async function rederiveDocuments(readObject: ReadObject): Promise<RederiveReport> {
  const outcomes: RederiveOutcome[] = [];
  const documents = await prisma.document.findMany({ include: { versions: true, shed: true } });
  for (const document of documents) {
    if (document.shed !== null) {
      outcomes.push({ commitment: document.commitment, outcome: 'SKIPPED', detail: 'SHED — nothing is derived from a document whose content was taken back' });
      continue;
    }
    if (custody(document, null) !== 'HELD') {
      outcomes.push({ commitment: document.commitment, outcome: 'SKIPPED', detail: 'SEALED — its plaintext existed once, at receipt (§3 :339-:342)' });
      continue;
    }
    const current = currentVersion(document, document.versions, CURRENT_EXTRACTOR, null);
    if (!('awaiting' in current) && !('shed' in current)) {
      outcomes.push({ commitment: document.commitment, outcome: 'UNCHANGED', detail: 'already current under this extractor' });
      continue;
    }
    const bytes = await readObject(document);
    if (bytes === null) {
      outcomes.push({ commitment: document.commitment, outcome: 'SKIPPED', detail: 'the bucket object could not be read — the row is listed, never repaired' });
      continue;
    }
    // OUTSIDE the transaction, deliberately: see the header.
    const derived = await deriveContent(bytes, document.mimeType, document.docId, 'HELD_BYTES');
    const before = document.versions.map((version) => version.contentVersionHash);
    const write = (tx: Prisma.TransactionClient): Promise<unknown> =>
      recordContentVersion(tx, document.commitment, derived);
    await prisma.$transaction(write, WRITE_TRANSACTION);
    outcomes.push({
      commitment: document.commitment,
      outcome: before.includes(derived.contentVersionHash) ? 'UNCHANGED' : 'SUPERSEDED',
      detail: before.includes(derived.contentVersionHash)
        ? "re-derived to content the document already holds — NOT a new row (§3 :316-:317), and this extractor is APPENDED to that row's derivedUnder, so CURRENT(d) resolves to it (A3 :1368)"
        : `a new version, the old kept; the citing theses owe a review (evidence Flow E3)`,
    });
  }
  return { extractor: CURRENT_EXTRACTOR, examined: documents.length, outcomes };
}

export function formatRederive(report: RederiveReport): string {
  const lines: string[] = [];
  const superseded = report.outcomes.filter((o) => o.outcome === 'SUPERSEDED').length;
  lines.push('THE DERIVATION PASS OVER HELD BYTES');
  lines.push(`  CURRENT_EXTRACTOR: ${report.extractor}`);
  lines.push(`  examined ${String(report.examined)} documents · ${String(superseded)} superseded`);
  lines.push('  It writes versions and NEVER a decision: a document whose content moved puts its');
  lines.push('  citing theses into review, and no pass re-affirms one (evidence Flow E3).');
  for (const outcome of report.outcomes) {
    lines.push(`    ${outcome.outcome.padEnd(11)} ${outcome.commitment.slice(0, 18)}… ${outcome.detail}`);
  }
  return lines.join('\n');
}
