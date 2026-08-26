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
  /**
   * Stored text the recomputation does NOT contain.
   *
   * Must be empty. The repair rewrites rawDeletedText/rawAddedText, so a stored
   * chunk with no counterpart would be destroyed by applying — turning a repair
   * that recovers 159 chunks into one that also silently loses some. Expected to
   * be empty by construction (the old pipeline was a strict truncation of the
   * same computation), but expected is not measured, and this is the one property
   * whose failure is unrecoverable.
   */
  storedTextNotRecomputed: { side: 'deleted' | 'added'; text: string }[];
  /** False when applying this entry would lose stored text. Apply must refuse. */
  safeToApply: boolean;
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
  /** Entries where applying would destroy stored text. Must be 0 to proceed. */
  unsafeEntries: number;
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

    const storedTextNotRecomputed = [
      ...missing(storedDeleted, recomputedDeleted, 'deleted'),
      ...missing(storedAdded, recomputedAdded, 'added'),
    ];

    if (recoveredText.length === 0 && storedTextNotRecomputed.length === 0) continue;

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
      storedTextNotRecomputed,
      safeToApply: storedTextNotRecomputed.length === 0,
    });
  }

  return {
    totalDiffs: diffs.length,
    diffsNeedingRediff: entries.length,
    chunksRecovered: entries.reduce((n, e) => n + e.recoveredChunks, 0),
    diffsWithEvidenceAffected: entries.filter((e) => e.evidence.length > 0).length,
    snapshotHashFailures,
    unlinkedDiffs,
    unsafeEntries: entries.filter((e) => !e.safeToApply).length,
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

// ---------------------------------------------------------------------------
// Applying the repair.
//
// This is an UPDATE that only ever GROWS the record: every entry it writes has
// been verified to contain all of the text currently stored, plus more. An entry
// that fails that check is REFUSED, not merged and not overwritten — the whole
// point is that a repair which recovers 159 chunks must not also lose one.
//
// It deliberately does NOT touch deletedText/addedText (the classifier's items)
// or any verdict. After this runs, a row's chunks are current while its
// classification is not, and the two provenance fields say so honestly:
// diffInputVersion is at the current version, classifierVersion is not.
// Reclassification is a separate decision, made after looking at what was
// recovered.
//
// Evidence identity is untouched by construction: forensicEvidenceFileHash is
// computed from url + the two snapshots' waybackTimestamp and contentHash, and
// contains no diff text. Nothing needs re-anchoring.
// ---------------------------------------------------------------------------

export interface ApplyRediffResult {
  attempted: number;
  applied: number;
  refused: number;
  chunksRecovered: number;
  refusedDiffIds: string[];
  appliedDiffIds: string[];
}

export async function applyRediff(opts: { url?: string } = {}): Promise<ApplyRediffResult> {
  const plan = await planRediff(opts);

  const appliedDiffIds: string[] = [];
  const refusedDiffIds: string[] = [];
  let chunksRecovered = 0;

  for (const entry of plan.entries) {
    if (!entry.safeToApply) {
      refusedDiffIds.push(entry.diffId);
      continue;
    }

    // Recomputed from the snapshots again rather than reconstructed from the
    // plan's diff of the two sets: rebuilding a chunk list by merging "stored
    // plus recovered" would invent an ordering that neither the page nor the
    // recomputation has, and document order is the thing the sort removal was
    // meant to restore.
    const rows = await prisma.urlVersionDiff.findMany({
      where: { id: entry.diffId },
      select: {
        id: true,
        beforeSnapshot: { select: { fullText: true, contentHash: true } },
        afterSnapshot: { select: { fullText: true, contentHash: true } },
      },
    });
    // findMany on a unique id returns 0 or 1 row, and the compiler treats index 0
    // as present, so the only guard that carries information is on the relations.
    const row = rows[0];
    if (!row.beforeSnapshot || !row.afterSnapshot) {
      refusedDiffIds.push(entry.diffId);
      continue;
    }
    if (!hashMatches(row.beforeSnapshot) || !hashMatches(row.afterSnapshot)) {
      refusedDiffIds.push(entry.diffId);
      continue;
    }

    const raw = diffLines(row.beforeSnapshot.fullText, row.afterSnapshot.fullText, {
      ignoreWhitespace: true,
    });

    await prisma.urlVersionDiff.update({
      where: { id: entry.diffId },
      data: {
        rawDeletedText: JSON.stringify(groupDiffChunks(raw, 'removed')),
        rawAddedText: JSON.stringify(groupDiffChunks(raw, 'added')),
        diffInputVersion: DIFF_INPUT_VERSION,
      },
    });

    appliedDiffIds.push(entry.diffId);
    chunksRecovered += entry.recoveredChunks;
  }

  return {
    attempted: plan.entries.length,
    applied: appliedDiffIds.length,
    refused: refusedDiffIds.length,
    chunksRecovered,
    refusedDiffIds,
    appliedDiffIds,
  };
}
