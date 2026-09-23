import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { CURRENT_EXTRACTOR, extract } from '../lib/documentExtractor';
import { prisma } from '../lib/prisma';
import { AWAITING_DERIVATION, currentVersion } from './documentPredicates';

// ---------------------------------------------------------------------------
// `extractor-coverage` — docs/gf-document-flows.md A7 :1591, §12 :1207.
//
// "COMPUTED text against bytes-only, BY TYPE AND BY DOOR … whether the OCR engine
// earns its place, and how many citations rest on an image."
//
// IT REPORTS TWO SUBJECTS AND SAYS WHICH IS WHICH, because the design asks it two
// questions at two different times. Plan step 29 judges the DEPENDENCY CHOICE "over
// a fixture set that holds one of each of §3's four kinds" (:154-:157) — and at
// step 29 the corpus holds no document at all, so a measurement over the corpus
// alone would report zero and judge nothing. §12 asks the same script, later, how
// much of the REAL corpus has computed text. So it reports the FIXTURES, which
// exist from this step, and the CORPUS, which fills from step 30 — never one
// number standing for both.
//
// A ZERO IS AN OBSERVATION AND NOT AN OUTAGE (interaction A5 :1084-:1086): a corpus
// with no documents reports zero documents, in terms, and the reader is never left
// to wonder whether the pass ran. A fixture set that cannot be READ, by contrast, is
// a broken instrument and THROWS — the difference between "nothing is there" and "I
// could not look" is the one this house has paid for repeatedly.
//
// READ-ONLY, AND IT NEVER EXITS NON-ZERO ON ITS OWN SUBJECT. Coverage is a
// measurement, not a gate: a document whose content is its bytes is counted as
// BYTES-ONLY and never as a failure (plan :169-:170), because the design states that
// outcome as a cost it accepts rather than a defect to hide.
// ---------------------------------------------------------------------------

const manifestSchema = z.object({
  kinds: z.number(),
  fixtures: z.array(
    z.object({
      kind: z.string(),
      file: z.string(),
      mimeType: z.string(),
      byteLength: z.number(),
      docId: z.string(),
      groundTruth: z.string(),
      proves: z.string(),
    }),
  ),
});

export interface FixtureCoverage {
  kind: string;
  file: string;
  mimeType: string;
  /** Did a reader return COMPUTED text for these bytes? */
  computed: boolean;
  /** Where it did not, why — the reader class selected, and what stopped it. */
  reason: string;
  /** Characters returned, so "computed" is never a bare bit. */
  characters: number;
}

export interface CorpusCoverage {
  /** `mimeType` · `doors` · computed · bytes-only — §12's "by type and by door". */
  mimeType: string;
  doors: string;
  computed: number;
  bytesOnly: number;
  /**
   * A READ THAT FAILED, counted APART from bytes no reader was selected for — A7 :1591,
   * RULED 2026-09-23. A broken PDF and a photograph are the same COUNT and NOT the same
   * FACT: one is a document the platform could not read and the other is a document there
   * is nothing to read in. A single "bytes-only" number would report a corpus of damaged
   * files as a corpus of photographs, and the instrument would be measuring its own
   * failures as the material's nature. These rows are a SUBSET of `bytesOnly`.
   */
  readFailed: number;
  awaiting: number;
  shed: number;
}

export interface CoverageReport {
  /** Never null: the researcher ruled the extractor on 2026-09-23 and it is set. */
  extractor: string;
  fixtures: FixtureCoverage[];
  corpus: CorpusCoverage[];
  documents: number;
}

/**
 * The committed fixture set — `fixtures/documents/`, beside `registry-ledger/`.
 *
 * Resolved from the process's working directory, which every invocation of every
 * operational script fixes: `cd apps/glass-fortress/backend && npm run …`, and npm
 * runs a script from its package root. A missing or unreadable set THROWS rather
 * than reporting an empty one.
 */
export function fixtureDirectory(): string {
  return join(process.cwd(), 'fixtures', 'documents');
}

/** The four kinds, measured by running the real `extract` over the real bytes. */
export async function measureFixtures(directory: string): Promise<FixtureCoverage[]> {
  let raw: string;
  try {
    raw = readFileSync(join(directory, 'manifest.json'), 'utf8');
  } catch (cause) {
    throw new Error(
      `extractor-coverage: the fixture set at ${directory} could not be read, so coverage was not measured. ` +
        'An unreadable instrument reports nothing, never zero.',
      { cause },
    );
  }
  const manifest = manifestSchema.parse(JSON.parse(raw));
  const measured: FixtureCoverage[] = [];
  for (const fixture of manifest.fixtures) {
    const bytes = readFileSync(join(directory, fixture.file));
    const extraction = await extract(bytes, fixture.mimeType);
    measured.push({
      kind: fixture.kind,
      file: fixture.file,
      mimeType: fixture.mimeType,
      computed: extraction.text !== null,
      reason: extraction.reason ?? 'COMPUTED',
      characters: extraction.text?.length ?? 0,
    });
  }
  return measured;
}

/** The corpus, by type and by door — zero documents is an answer (§12). */
export async function measureCorpus(): Promise<{ rows: CorpusCoverage[]; documents: number }> {
  const documents = await prisma.document.findMany({
    include: {
      versions: true,
      shed: true,
      arrivals: { include: { arrival: true } },
    },
  });
  const buckets = new Map<string, CorpusCoverage>();
  for (const document of documents) {
    const doors = [...new Set(document.arrivals.map((link) => link.arrival.door))].sort().join('+');
    // Keyed by the PAIR rather than by a joined string: a separator is a character
    // that one day appears in the thing it separates, and a MIME type carries both
    // punctuation and parameters.
    const key = JSON.stringify([document.mimeType, doors]);
    const bucket = buckets.get(key) ?? {
      mimeType: document.mimeType,
      doors: doors === '' ? 'NONE' : doors,
      computed: 0,
      bytesOnly: 0,
      readFailed: 0,
      awaiting: 0,
      shed: 0,
    };
    const current = currentVersion(document, document.versions, CURRENT_EXTRACTOR, document.shed);
    if ('shed' in current) bucket.shed += 1;
    else if ('awaiting' in current) bucket.awaiting += 1;
    else if (current.text === null) {
      bucket.bytesOnly += 1;
      // A SUBSET of bytes-only, never a fifth exclusive state: the row IS bytes-only,
      // and this says WHY. Counting it apart from the total would make the columns
      // stop summing to the document count, which is how a reader checks the table.
      if (current.readFailed) bucket.readFailed += 1;
    } else bucket.computed += 1;
    buckets.set(key, bucket);
  }
  return { rows: [...buckets.values()], documents: documents.length };
}

export async function extractorCoverage(): Promise<CoverageReport> {
  const fixtures = await measureFixtures(fixtureDirectory());
  const { rows, documents } = await measureCorpus();
  return { extractor: CURRENT_EXTRACTOR, fixtures, corpus: rows, documents };
}

/** The report, with the counts first so a reader never has to total a table. */
export function formatCoverage(report: CoverageReport): string {
  const lines: string[] = [];
  const computed = report.fixtures.filter((fixture) => fixture.computed).length;
  lines.push('EXTRACTOR COVERAGE');
  lines.push(`  CURRENT_EXTRACTOR: ${report.extractor}`);
  lines.push('');
  lines.push(`THE FIXTURE SET — ${String(report.fixtures.length)} kinds, ${String(computed)} with COMPUTED text, ${String(report.fixtures.length - computed)} BYTES-ONLY`);
  lines.push('  bytes-only is an OUTCOME the design accepts, never a failure (plan :169-:170).');
  for (const fixture of report.fixtures) {
    lines.push(
      `    ${fixture.kind.padEnd(16)} ${fixture.mimeType.padEnd(62)} ` +
        `${fixture.computed ? 'COMPUTED' : 'BYTES-ONLY'} (${fixture.reason}), ${String(fixture.characters)} chars`,
    );
  }
  lines.push('');
  lines.push(`THE CORPUS — ${String(report.documents)} documents`);
  if (report.documents === 0) {
    lines.push('  ZERO documents, which is an observation and not an outage: the researcher’s door is');
    lines.push('  document step 30 and no document has been received yet.');
  }
  for (const row of report.corpus) {
    lines.push(
      `    ${row.mimeType.padEnd(62)} ${row.doors.padEnd(20)} ` +
        `computed ${String(row.computed)} · bytes-only ${String(row.bytesOnly)} (read FAILED ${String(row.readFailed)}) · ` +
        `${AWAITING_DERIVATION} ${String(row.awaiting)} · shed ${String(row.shed)}`,
    );
  }
  return lines.join('\n');
}
