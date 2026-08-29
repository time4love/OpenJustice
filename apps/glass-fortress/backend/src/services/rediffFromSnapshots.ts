import { createHash } from 'crypto';
import { prisma } from '../lib/prisma';
import { computeDiffSurvival } from './computeDiffSurvival';
import { diffChunkPair, DIFF_INPUT_VERSION } from '../lib/diffChunking';
import { textLostByRewrite, type LostText } from '../lib/chunkRewriteLoss';
import { checkDiffSurvival, type SurvivalVerdict } from '../lib/diffSurvival';
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
  recoveredText: LostText[];
  /**
   * Stored text a rewrite would DESTROY.
   *
   * Must be empty. Applying rewrites rawDeletedText/rawAddedText in place, so
   * stored text with no counterpart is gone — turning a repair into a loss. This
   * is the one property whose failure is unrecoverable.
   *
   * A sentence dropped because it never changed does NOT count: narrowing an
   * over-broad claim is the point of `v3-sentence-claims`. See
   * `textLostByRewrite` for why that exception is exactly as wide as the rider
   * and no wider.
   */
  storedTextNotRecomputed: LostText[];
  /** False when applying this entry would lose stored text. Apply must refuse. */
  safeToApply: boolean;
  /** The stored Level 5 verdict, or null for a row written before the check. */
  currentSurvivalVerdict: SurvivalVerdict | null;
  /** The verdict this row WOULD carry after repair. Derived, never written here. */
  projectedSurvivalVerdict: SurvivalVerdict;
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
      // `text` as well as `fullText`: the diff is computed over the extraction,
      // and Level 5 checks the result against the whole document. Projecting the
      // verdict needs both, and reading them here is what makes the projection a
      // property of the PLAN rather than something only applying can reveal.
      beforeSnapshot: { select: { fullText: true, contentHash: true, text: true, textExtractionVersion: true } },
      afterSnapshot: { select: { fullText: true, contentHash: true, text: true, textExtractionVersion: true } },
      evidence: { select: { id: true, status: true, fileHash: true } },
      survivalVerdict: true,
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

    const { removed: recomputedDeleted, added: recomputedAdded } = diffChunkPair(
      before.fullText,
      after.fullText,
    );

    const storedDeleted = parseRawChunks(diff.rawDeletedText);
    const storedAdded = parseRawChunks(diff.rawAddedText);

    const recoveredText = [
      ...missing(recomputedDeleted, storedDeleted, 'deleted'),
      ...missing(recomputedAdded, storedAdded, 'added'),
    ];

    // What a rewrite would DESTROY, not merely what it would restate. Under a
    // narrowing migration those are different questions, and only the first one
    // may block an apply.
    const storedTextNotRecomputed = [
      ...textLostByRewrite(storedDeleted, recomputedDeleted, 'deleted', before.fullText, after.fullText),
      ...textLostByRewrite(storedAdded, recomputedAdded, 'added', before.fullText, after.fullText),
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
      currentSurvivalVerdict: diff.survivalVerdict,
      // WHAT THE VERDICT WOULD BECOME, computed without writing anything.
      //
      // `checkDiffSurvival` is pure — no Archive, no model, no network — so the
      // outcome of a cascade is knowable before the cascade. That is the
      // difference between attributing a result to a fix and guessing which of
      // two bundled fixes underperformed, and it costs one local function call
      // per row.
      projectedSurvivalVerdict: checkDiffSurvival({
        rawDeletedText: JSON.stringify(recomputedDeleted),
        rawAddedText: JSON.stringify(recomputedAdded),
        beforeText: before.text,
        afterText: after.text,
        beforeVersion: before.textExtractionVersion,
        afterVersion: after.textExtractionVersion,
      }).verdict,
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
// This is an UPDATE that never LOSES A CHANGE. Under the truncation repair that
// was the same thing as only ever growing the record; under a narrowing
// migration it is not, and the distinction is the whole of `textLostByRewrite`.
// An entry that fails the check is REFUSED, not merged and not overwritten — a
// repair that recovers 159 chunks must not also lose one, and a repair that
// narrows an over-broad claim must not narrow away a real removal.
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
    // findUniqueOrThrow, not findMany-then-[0]. A unique id yields one row or
    // none, and indexing into an array to say so left five call sites reading a
    // possibly-undefined value — debt the noUncheckedIndexedAccess ratchet
    // counted, and which grew the moment this select gained two more fields.
    // Asking for the single row the id identifies removes the indexing rather
    // than guarding it.
    const row = await prisma.urlVersionDiff.findUniqueOrThrow({
      where: { id: entry.diffId },
      select: {
        id: true,
        beforeSnapshotId: true,
        afterSnapshotId: true,
        beforeSnapshot: { select: { fullText: true, contentHash: true } },
        afterSnapshot: { select: { fullText: true, contentHash: true } },
      },
    });
    // The only guard that carries information is on the relations: the row itself
    // is now either returned or thrown for.
    if (!row.beforeSnapshot || !row.afterSnapshot) {
      refusedDiffIds.push(entry.diffId);
      continue;
    }
    if (!hashMatches(row.beforeSnapshot) || !hashMatches(row.afterSnapshot)) {
      refusedDiffIds.push(entry.diffId);
      continue;
    }

    const recomputed = diffChunkPair(row.beforeSnapshot.fullText, row.afterSnapshot.fullText);

    const rawDeletedText = JSON.stringify(recomputed.removed);
    const rawAddedText = JSON.stringify(recomputed.added);

    // THE VERDICT IS RECOMPUTED HERE BECAUSE THIS IS WHAT INVALIDATES IT.
    //
    // These two payloads are two of `checkDiffSurvival`'s four inputs. Rewriting
    // them without re-running the check leaves a Level 5 verdict describing chunks
    // that no longer exist — and, before the source-state hash was widened to
    // cover them, one that reported itself as CURRENT while doing so, because the
    // captures this tool re-derives from do not move.
    //
    // Computed on the NEW payloads and written in the same statement, so a row can
    // never hold new chunks beside a verdict about the old ones.
    const survival = await computeDiffSurvival({
      beforeSnapshotId: row.beforeSnapshotId,
      afterSnapshotId: row.afterSnapshotId,
      rawDeletedText,
      rawAddedText,
    });

    await prisma.urlVersionDiff.update({
      where: { id: entry.diffId },
      data: {
        rawDeletedText,
        rawAddedText,
        diffInputVersion: DIFF_INPUT_VERSION,
        ...survival,
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
