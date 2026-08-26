import { createHash } from 'crypto';
import { diffLines } from 'diff';
import { prisma } from '../lib/prisma';
import { groupDiffChunks, DIFF_INPUT_VERSION } from '../lib/diffChunking';
import { parseRawChunks } from '../lib/diffItems';

// ---------------------------------------------------------------------------
// Recomputing a diff's raw chunks from the two snapshots it sits between.
//
// WHY RECLASSIFICATION CANNOT FIX THIS
//
// `forensics:reclassify` re-runs the classifier over rawDeletedText/rawAddedText.
// Those columns are the damage: the old pipeline sorted chunks longest-first and
// kept 8 per side, discarding the rest BEFORE the write. Reclassification can
// only ever re-read what scanning chose to keep, so re-judging 131 chunks when
// 290 exist re-judges the same truncated record more expensively.
//
// The repair has to go back to the source. It is available: UrlSnapshot.fullText
// is the exact text the scan diffed, and contentHash is sha256 of it — a hash
// that is itself registered on-chain. So the recomputation is verifiable and
// needs no Internet Archive fetch. A page that has since changed or vanished from
// the archive cannot alter the result.
//
// WHY THE PLAN IS SEPARATE FROM THE APPLY
//
// This module only PLANS. Nothing here writes, and the write path is a separate,
// reviewed operation, because the numbers matter before they are acted on: on the
// measured corpus this roughly doubles the chunk count on the six diffs that back
// every promoted evidence record, and a later reclassification will then judge
// text no model has ever seen. Some of it will be significant. That is a change
// to records a published thesis cites, and it is a researcher's call, not a
// script's.
//
// Per-diff verification, not per-corpus: each entry re-hashes BOTH of its
// snapshots and refuses to plan anything for a pair that fails. A recomputation
// run over text that has drifted would silently attribute the drift to the cap.
// ---------------------------------------------------------------------------

export interface RediffPlanEntry {
  diffId: string;
  beforeDate: string;
  afterDate: string;
  storedDeleted: number;
  storedAdded: number;
  recomputedDeleted: number;
  recomputedAdded: number;
  /** Chunks the stored record is missing. Zero means this diff needs no repair. */
  recoveredChunks: number;
  currentlySignificant: boolean;
  /** Evidence promoted from this diff, if any — the reason a change here matters. */
  evidence: { id: string; status: string; fileHash: string }[];
  diffInputVersion: string | null;
  /** Text present in the recomputation and absent from the stored record. */
  recoveredText: { side: 'deleted' | 'added'; text: string }[];
}

export interface RediffPlan {
  totalDiffs: number;
  /** Diffs whose stored chunks are missing text the snapshots still contain. */
  diffsNeedingRediff: number;
  chunksRecovered: number;
  diffsWithEvidenceAffected: number;
  /** Diffs skipped because a snapshot's text no longer hashes to its contentHash. */
  snapshotHashFailures: number;
  /** Diffs skipped because they are not linked to both snapshots. */
  unlinkedDiffs: number;
  entries: RediffPlanEntry[];
}

/**
 * What a re-diff would recover, without writing anything.
 *
 * Read-only by construction: this module imports no write helper and the query
 * surface is findMany alone.
 */
export async function planRediff(opts: { url?: string } = {}): Promise<RediffPlan> {
  const diffs = await prisma.urlVersionDiff.findMany({
    where: opts.url === undefined ? {} : { trackedUrl: { url: opts.url } },
    orderBy: [{ beforeDate: 'asc' }, { afterDate: 'asc' }],
    select: {
      id: true,
      beforeDate: true,
      afterDate: true,
      isLegallySignificant: true,
      diffInputVersion: true,
      rawDeletedText: true,
      rawAddedText: true,
      beforeSnapshot: { select: { fullText: true, contentHash: true } },
      afterSnapshot: { select: { fullText: true, contentHash: true } },
      evidence: { select: { id: true, status: true, fileHash: true } },
    },
  });

  const entries: RediffPlanEntry[] = [];
  let snapshotHashFailures = 0;
  let unlinkedDiffs = 0;

  for (const diff of diffs) {
    if (!diff.beforeSnapshot || !diff.afterSnapshot) {
      unlinkedDiffs++;
      continue;
    }

    const before = diff.beforeSnapshot;
    const after = diff.afterSnapshot;
    if (!hashMatches(before) || !hashMatches(after)) {
      // Refused, not repaired. If the stored text no longer hashes to the value
      // that was anchored, the disagreement is about chain of custody and must
      // not be quietly folded into a truncation repair.
      snapshotHashFailures++;
      continue;
    }

    const raw = diffLines(before.fullText, after.fullText, { ignoreWhitespace: true });
    const recomputedDeleted = groupDiffChunks(raw, 'removed');
    const recomputedAdded = groupDiffChunks(raw, 'added');

    const storedDeleted = parseRawChunks(diff.rawDeletedText);
    const storedAdded = parseRawChunks(diff.rawAddedText);

    const recoveredText = [
      ...missing(recomputedDeleted, storedDeleted, 'deleted'),
      ...missing(recomputedAdded, storedAdded, 'added'),
    ];

    if (recoveredText.length === 0) continue;

    entries.push({
      diffId: diff.id,
      beforeDate: diff.beforeDate,
      afterDate: diff.afterDate,
      storedDeleted: storedDeleted.length,
      storedAdded: storedAdded.length,
      recomputedDeleted: recomputedDeleted.length,
      recomputedAdded: recomputedAdded.length,
      recoveredChunks: recoveredText.length,
      currentlySignificant: diff.isLegallySignificant,
      evidence: diff.evidence,
      diffInputVersion: diff.diffInputVersion,
      recoveredText,
    });
  }

  return {
    totalDiffs: diffs.length,
    diffsNeedingRediff: entries.length,
    chunksRecovered: entries.reduce((n, e) => n + e.recoveredChunks, 0),
    diffsWithEvidenceAffected: entries.filter((e) => e.evidence.length > 0).length,
    snapshotHashFailures,
    unlinkedDiffs,
    entries,
  };
}

/** The version a repaired row would carry, exported so the report can state it. */
export const REDIFF_TARGET_VERSION = DIFF_INPUT_VERSION;

function hashMatches(snapshot: { fullText: string; contentHash: string }): boolean {
  return createHash('sha256').update(snapshot.fullText, 'utf8').digest('hex') === snapshot.contentHash;
}

/**
 * Recomputed chunks with no counterpart in the stored record.
 *
 * Compared on normalised text rather than identity: the stored chunk survived a
 * JSON round-trip, and a whitespace difference would report a chunk as both lost
 * and recovered, inflating the repair.
 */
function missing(
  recomputed: readonly string[],
  stored: readonly string[],
  side: 'deleted' | 'added',
): { side: 'deleted' | 'added'; text: string }[] {
  const seen = new Set(stored.map(normalise));
  return recomputed.filter((c) => !seen.has(normalise(c))).map((text) => ({ side, text }));
}

function normalise(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}
