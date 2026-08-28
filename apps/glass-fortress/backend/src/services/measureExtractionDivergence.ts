import { prisma } from '../lib/prisma';
import { normaliseForPresence } from '../lib/archiveText';
import { checkDiffSurvival } from '../lib/diffSurvival';

// ---------------------------------------------------------------------------
// What did the extraction discard, and which reported changes did that invent?
//
// Level 5 of docs/gf-factual-layer-rebuild-dev-plan.md. Every measurement
// here is a pure function of stored data: no Internet Archive, no model, no
// network. That is only possible because Phase 1 stored the archived document
// beside the extraction derived from it — before that, this question could not
// be answered at all without re-fetching 83 captures.
//
// Two measurements, and the second is the one that matters.
//
// 1. Per snapshot: what `fullText` lost relative to `rawText`.
//
// 2. Per diff: whether a reported change SURVIVES the raw documents. A chunk the
//    platform says was REMOVED must be absent from the raw text of the after
//    capture. If it is present there, the page still said it and the removal
//    never happened — the extraction stopped seeing it, and the diff recorded a
//    change in the pipeline as a change in the world. The mirror case applies to
//    additions against the before capture.
//
// This is the check Phase 4 will run at write time, applied backwards to rows
// already written. Reporting only: nothing here modifies a row, because the
// question being answered is how much of the existing corpus is affected, and a
// measurement that repairs as it goes cannot be re-run to check itself.
// ---------------------------------------------------------------------------

export type ChunkVerdict =
  /** The raw documents agree with what the diff says happened. */
  | 'SURVIVES'
  /** The raw document contradicts it: the page still said this. */
  | 'CONTRADICTED'
  /** One of the two captures holds no archived document, so nothing can be said. */
  | 'UNCHECKABLE';

export interface ContradictedChunk {
  side: 'REMOVED' | 'ADDED';
  /** Trimmed for reporting; matching always uses the whole chunk. */
  excerpt: string;
}

export interface DiffDivergence {
  diffId: string;
  beforeDate: string;
  afterDate: string;
  verdict: ChunkVerdict;
  chunksChecked: number;
  contradicted: ContradictedChunk[];
  /** Why nothing could be checked, when verdict is UNCHECKABLE. */
  reason?: string;
}

export interface SnapshotDivergence {
  snapshotId: string;
  snapshotDate: string;
  /**
   * The Archive's identifier — null for a capture the Archive does not hold.
   *
   * Deliberately NOT narrowed to archived captures. Divergence between a
   * document and its extraction is a property of the extractor, so it is
   * measurable on every capture regardless of who observed it; scoping this
   * measurement to archived captures would shrink the denominator of the one
   * number that says how much the extractor discards.
   */
  waybackTimestamp: string | null;
  rawChars: number;
  extractedChars: number;
  /** Percentage of the document the extraction kept, rounded. */
  retainedPercent: number;
  /** Blocks present in the document and absent from the extraction. */
  droppedBlocks: number;
}

export interface DivergenceReport {
  url: string;
  snapshots: SnapshotDivergence[];
  diffs: DiffDivergence[];
  summary: {
    snapshotsMeasured: number;
    lowestRetainedPercent: number | null;
    diffsChecked: number;
    diffsContradicted: number;
    diffsUncheckable: number;
    chunksContradicted: number;
  };
}


/** Non-empty lines of a document, which is the granularity htmlToText produces. */
function blocksOf(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export async function measureExtractionDivergence(url: string): Promise<DivergenceReport> {
  const tracked = await prisma.trackedUrl.findFirst({
    where: { url },
    select: { id: true },
  });
  if (!tracked) throw new Error(`No tracked URL found for: ${url}`);

  const snapshots = await prisma.urlSnapshot.findMany({
    where: { trackedUrlId: tracked.id },
    select: {
      id: true,
      snapshotDate: true,
      waybackTimestamp: true,
      fullText: true,
      text: true,
    },
    // capturedAt: every capture has one, so the measurement stays in
    // chronological order across provenances. Ordering by the nullable Archive
    // timestamp would sort non-archived captures to the end (Postgres ASC is
    // NULLS LAST) rather than into their place in time.
    orderBy: { capturedAt: 'asc' },
  });

  const measured: SnapshotDivergence[] = [];

  // No "holds no document" branch and no counter for it. Since
  // 20260827120000_snapshot_document_required, `rawText` is NOT NULL, so a
  // capture without its document cannot exist to be counted. A metric tallying
  // rows that lack mandatory data is an admission that the schema permits
  // invalid rows — see the plan's §3. The check below is now total over captures.
  for (const snap of snapshots) {
    const extractedNormalised = normaliseForPresence(snap.fullText);
    const droppedBlocks = blocksOf(snap.text).filter(
      (block) => !extractedNormalised.includes(normaliseForPresence(block)),
    ).length;

    measured.push({
      snapshotId: snap.id,
      snapshotDate: snap.snapshotDate,
      waybackTimestamp: snap.waybackTimestamp,
      rawChars: snap.text.length,
      extractedChars: snap.fullText.length,
      retainedPercent:
        snap.text.length === 0
          ? 0
          : Math.round((snap.fullText.length / snap.text.length) * 100),
      droppedBlocks,
    });
  }

  const diffs = await prisma.urlVersionDiff.findMany({
    where: { trackedUrlId: tracked.id },
    select: {
      id: true,
      beforeDate: true,
      afterDate: true,
      rawDeletedText: true,
      rawAddedText: true,
      beforeSnapshot: { select: { text: true, textExtractionVersion: true } },
      afterSnapshot: { select: { text: true, textExtractionVersion: true } },
    },
    orderBy: { beforeDate: 'asc' },
  });

  const checked: DiffDivergence[] = [];

  for (const diff of diffs) {
    // `text` is NOT NULL, so a capture that EXISTS always holds its derived text.
    // What can still be absent is the capture itself: beforeSnapshotId and
    // afterSnapshotId are both optional FKs, so a diff may reference no capture
    // on either side.
    //
    // That distinction is the whole of §3. This is UNCHECKABLE because there is
    // nothing to check against — a verdict about a CHECK. It is never a verdict
    // about a capture missing mandatory data, which the schema now forbids.
    const beforeRaw = diff.beforeSnapshot?.text ?? null;
    const afterRaw = diff.afterSnapshot?.text ?? null;

    if (beforeRaw === null || afterRaw === null) {
      checked.push({
        diffId: diff.id,
        beforeDate: diff.beforeDate,
        afterDate: diff.afterDate,
        verdict: 'UNCHECKABLE',
        chunksChecked: 0,
        contradicted: [],
        reason:
          beforeRaw === null && afterRaw === null
            ? 'This diff references no capture on either side.'
            : `This diff references no ${beforeRaw === null ? 'before' : 'after'} capture.`,
      });
      continue;
    }

    // THE SAME FUNCTION THE WRITE PATH USES. Level 5 moved this logic to write
    // time; keeping a second copy here would make the measurement and the
    // enforcement two definitions of what a contradiction IS, and any drift
    // between them would mean they disagreed about what the corpus contains.
    const survival = checkDiffSurvival({
      rawDeletedText: diff.rawDeletedText,
      rawAddedText: diff.rawAddedText,
      beforeText: beforeRaw,
      afterText: afterRaw,
      beforeVersion: diff.beforeSnapshot.textExtractionVersion,
      afterVersion: diff.afterSnapshot.textExtractionVersion,
    });
    const { contradicted, chunksChecked } = survival;

    checked.push({
      diffId: diff.id,
      beforeDate: diff.beforeDate,
      afterDate: diff.afterDate,
      verdict: survival.verdict,
      chunksChecked,
      contradicted,
    });
  }

  const retained = measured.map((m) => m.retainedPercent);

  return {
    url,
    snapshots: measured,
    diffs: checked,
    summary: {
      snapshotsMeasured: measured.length,
      lowestRetainedPercent: retained.length === 0 ? null : Math.min(...retained),
      diffsChecked: checked.filter((d) => d.verdict !== 'UNCHECKABLE').length,
      diffsContradicted: checked.filter((d) => d.verdict === 'CONTRADICTED').length,
      diffsUncheckable: checked.filter((d) => d.verdict === 'UNCHECKABLE').length,
      chunksContradicted: checked.reduce((n, d) => n + d.contradicted.length, 0),
    },
  };
}

