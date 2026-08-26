import { prisma } from '../lib/prisma';
import { ForensicAgent } from './ForensicAgent';
import { WaybackScraper, recordScanFinding } from './WaybackScraper';
import { CLASSIFIER_VERSION, classifierPromptHash } from '../lib/classifierVersion';
import { parseDiffItems, parseRawChunks } from '../lib/diffItems';
import { classifierInputChunks } from '../lib/diffChunking';
import { investigativeCategoriesField } from '../lib/investigativeCategories';
import { deriveSignificance } from './ForensicAgent';
import { requireSnapshotIdentity } from './forensicEvidence';

// ---------------------------------------------------------------------------
// Re-running the classifier over diffs that were judged by an older one.
//
// Stored LLM-derived columns drift the moment the prompt changes. This brings
// them forward WITHOUT re-scanning: it reads rawDeletedText/rawAddedText, which
// were persisted at scan time, so the Internet Archive is never touched, the
// input is deterministic, and a page that has since changed or vanished from the
// archive cannot alter a past classification.
//
// It is an UPDATE, never a delete. Bringing a corpus up to date must not require
// destroying it — see docs/gf-staging-data-loss-postmortem-2026-08-21.md.
//
// It is also never silent. Overwriting a verdict destroys the only copy of the
// previous one, so every flip is recorded on the run, and flips on diffs that
// already produced Evidence are counted separately: those Evidence rows carry
// the categories they were promoted with, so they and their source diff now
// disagree, and only a human can reconcile that.
// ---------------------------------------------------------------------------

export interface FlipRecord {
  diffId: string;
  beforeDate: string;
  afterDate: string;
  before: string[];
  after: string[];
  hadEvidence: boolean;
}

export interface ReclassifyResult {
  runId: string;
  examined: number;
  reclassified: number;
  flipsToSignificant: number;
  flipsToRoutine: number;
  flipsWithEvidence: number;
  /**
   * Significant diffs that had no evidence and were given a PENDING_REVIEW
   * record. Counts diffs that just flipped AND diffs that were already
   * significant but never recorded — without the latter, orphans created before
   * this existed would stay orphaned forever.
   */
  findingsRecorded: number;
  /**
   * Diffs whose selected input was empty, so the classifier was never invoked.
   *
   * The scan has always skipped these (WaybackScraper: "Minor changes exist but
   * nothing substantial enough for AI"). Reclassification did not, and called the
   * model once per empty diff — 68 of staging's 81. That is the same
   * scan-vs-reclassify asymmetry that produced the truncation defect, in the
   * invocation rather than the input.
   */
  skippedEmpty: number;
  flips: FlipRecord[];
}

export interface ReclassifyOptions {
  /** Limit to one tracked URL. Omit to cover every one. */
  url?: string;
  /**
   * Re-run rows already at the current version.
   *
   * Off by default: re-running them costs an LLM call to reproduce a verdict
   * already held. It is how an ORPHAN gets adopted, though — a diff that is
   * significant with no Evidence row is skipped by the version filter, so
   * without this the self-healing branch can never see it.
   */
  force?: boolean;
  /** Report what would change without writing. */
  dryRun?: boolean;
  onProgress?: (done: number, total: number) => void;
}

export async function reclassifyDiffs(opts: ReclassifyOptions = {}): Promise<ReclassifyResult> {
  let trackedUrlId: string | undefined;
  if (opts.url) {
    const tracked = await prisma.trackedUrl.findUnique({
      where: { url: opts.url },
      select: { id: true },
    });
    if (!tracked) throw new Error(`No tracked URL found for: ${opts.url}`);
    trackedUrlId = tracked.id;
  }

  const diffs = await prisma.urlVersionDiff.findMany({
    where: {
      ...(trackedUrlId ? { trackedUrlId } : {}),
      // Rows already at the current version are skipped: re-running them costs
      // an LLM call to reproduce a verdict we already hold.
      //
      // The null branch is not defensive padding. `NOT: { classifierVersion: X }`
      // becomes `classifierVersion != X`, and in SQL `NULL != 'x'` is NULL, not
      // TRUE — so rows never classified by ANY version were silently excluded.
      // Those are the rows most in need of reclassification, and the first real
      // run examined zero of 81 because of it.
      ...(opts.force
        ? {}
        : {
            OR: [
              { classifierVersion: null },
              { NOT: { classifierVersion: CLASSIFIER_VERSION } },
            ],
          }),
    },
    orderBy: { afterDate: 'asc' },
    include: {
      trackedUrl: { select: { url: true } },
      evidence: { select: { id: true } },
      beforeSnapshot: { select: { waybackTimestamp: true, contentHash: true } },
      afterSnapshot: { select: { waybackTimestamp: true, contentHash: true } },
    },
  });

  const run = await prisma.reclassificationRun.create({
    data: { trackedUrlId: trackedUrlId ?? null, classifierVersion: CLASSIFIER_VERSION },
  });

  const agent = new ForensicAgent();
  const scraper = new WaybackScraper();
  const promptHash = classifierPromptHash();
  const flips: FlipRecord[] = [];
  let reclassified = 0;
  let findingsRecorded = 0;
  let skippedEmpty = 0;

  for (const [i, diff] of diffs.entries()) {
    opts.onProgress?.(i + 1, diffs.length);

    // Correlated evidence IS supplied, exactly as the original scan does.
    //
    // Withholding it looked like it bought reproducibility, and bought nothing:
    // the classifier is already non-deterministic at temperature 0 — the same
    // page yielded 10 findings on one run and 5 on another — so there was no
    // stability to protect. What it cost was the classifier's most valuable
    // output. Three of this corpus's five findings turn on a correlation
    // ("two weeks before the recordings surfaced"), and a reclassification
    // without the vault would overwrite that prose with a version that has none
    // of it, and could flip a verdict for a reason unrelated to the page.
    //
    // A classification that improves as more evidence arrives is the system
    // working, not drift: evidence matters partly BECAUSE it can be cross-
    // referenced against what is found later.
    //
    // Evidence from this same tracked URL is excluded. Correlation is only worth
    // anything when it comes from a DIFFERENT source than the page being
    // classified; a sibling diff of the same page is that page one snapshot
    // earlier, not outside support.
    const deletions = classifierInputChunks(parseRawChunks(diff.rawDeletedText));
    const additions = classifierInputChunks(parseRawChunks(diff.rawAddedText));

    // Empty input: no model call, ever.
    //
    // A diff with no chunks has nothing for a classifier to judge, and the scan
    // has always skipped it. Reclassification invoking the model on an empty
    // deletions/additions pair spends a call to be told what is already known,
    // and asks a non-deterministic model a question with no content — which can
    // only add noise to a corpus.
    //
    // Provenance is still advanced, because the honest statement about such a row
    // under the current classifier is "no items, no categories", and that is what
    // it already holds. Leaving the version behind would re-target it on every
    // future run forever.
    if (deletions.length === 0 && additions.length === 0) {
      skippedEmpty++;
      if (!opts.dryRun) {
        await prisma.urlVersionDiff.update({
          where: { id: diff.id },
          data: {
            classifierVersion: CLASSIFIER_VERSION,
            classifierPromptHash: promptHash,
            classifierModel: agent.modelId,
          },
        });
      }
      continue;
    }

    const relatedEvidence = await scraper.fetchCorrelatedEvidence(
      diff.afterDate,
      diff.trackedUrlId,
    );

    // Through the SAME selection step the scan uses. Reading the stored chunks
    // and passing them straight to the agent is how this path silently diverged
    // from the scan in the first place.
    const analysis = await agent.analyzeChange(
      deletions,
      additions,
      diff.trackedUrl.url,
      diff.afterDate,
      relatedEvidence,
    );

    const before = diff.investigativeCategories;
    const after = analysis.investigativeCategories;
    const wasSignificant = diff.isLegallySignificant;
    const isSignificant = deriveSignificance(after);

    if (wasSignificant !== isSignificant) {
      flips.push({
        diffId: diff.id,
        beforeDate: diff.beforeDate,
        afterDate: diff.afterDate,
        before: [...before],
        after: [...after],
        hadEvidence: diff.evidence.length > 0,
      });
    }

    if (!opts.dryRun) {
      await prisma.urlVersionDiff.update({
        where: { id: diff.id },
        data: {
          investigativeCategories: after,
          isLegallySignificant: isSignificant,
          aiSignificance: analysis.legalSignificance,
          deletedText: JSON.stringify(analysis.deletedItems),
          addedText: JSON.stringify(analysis.addedItems),
          classifierVersion: CLASSIFIER_VERSION,
          classifierPromptHash: promptHash,
          classifierModel: agent.modelId,
        },
      });
      reclassified++;

      // A significant diff is not yet a FINDING. recordScanFinding runs during a
      // scan; reclassification only rewrote the diff's columns, so without this
      // the diff reports as significant while no Evidence row exists — and
      // promote_scan_findings silently promotes a subset. The first real run
      // produced exactly that: 7 significant diffs, 5 findings, 2 unrecorded.
      //
      // The condition is "significant AND has no evidence", NOT "just flipped".
      // Keying on the flip would only help rows that had not already hit the bug
      // — the two orphans it was written for would stay orphaned, since they are
      // already significant and so would never flip again. Deriving the action
      // from the CURRENT state rather than from the transition makes the pass
      // self-healing, the same reason hasSubstance is derived from the debate's
      // event log rather than latched off its own previous value.
      //
      // Deliberately the same function a scan calls, so a finding recovered by
      // reclassification is indistinguishable from one a scan found: same
      // content-addressed fileHash, same PENDING_REVIEW status, same refusal
      // when no category matched.
      //
      // A flip to routine leaves existing evidence untouched. The Evidence row
      // carries the categories it was promoted with and only a human can decide
      // whether the claim should stand — see findOutOfSyncEvidence, which
      // reports that divergence rather than resolving it.
      if (isSignificant && diff.evidence.length === 0) {
        await recordScanFinding({
          diffId: diff.id,
          url: diff.trackedUrl.url,
          afterDate: diff.afterDate,
          snapshotUrl: diff.snapshotUrl,
          beforeSnapshot: requireSnapshotIdentity(diff.beforeSnapshot, 'before'),
          afterSnapshot: requireSnapshotIdentity(diff.afterSnapshot, 'after'),
          aiSignificance: analysis.legalSignificance,
          investigativeCategories: [...after],
          deletedText: JSON.stringify(analysis.deletedItems),
          addedText: JSON.stringify(analysis.addedItems),
          deletedItems: analysis.deletedItems,
          addedItems: analysis.addedItems,
        });
        findingsRecorded++;
      }
    }
  }

  const flipsToSignificant = flips.filter((f) => f.after.length > 0).length;
  const flipsToRoutine = flips.length - flipsToSignificant;
  const flipsWithEvidence = flips.filter((f) => f.hadEvidence).length;

  await prisma.reclassificationRun.update({
    where: { id: run.id },
    data: {
      diffsExamined: diffs.length,
      diffsReclassified: reclassified,
      flipsToSignificant,
      flipsToRoutine,
      flipsWithEvidence,
      flips: JSON.stringify(flips),
      finishedAt: new Date(),
    },
  });

  return {
    runId: run.id,
    examined: diffs.length,
    reclassified,
    skippedEmpty,
    flipsToSignificant,
    flipsToRoutine,
    flipsWithEvidence,
    findingsRecorded,
    flips,
  };
}

// ---------------------------------------------------------------------------
// Adopting orphans: significant diffs that never became findings.
//
// An orphan already carries its classification — investigativeCategories,
// aiSignificance, and the extracted items are all on the row. Nothing needs
// re-deciding, so this makes NO LLM call at all. Reclassifying to adopt them
// would spend a call per diff to reproduce a verdict already held, and would
// rewrite the prose of every other row as a side effect.
//
// That distinction matters at scale: recovering two orphans on this page cost
// 81 LLM calls through --force, and nothing about that ratio improves on a
// corpus of thousands.
// ---------------------------------------------------------------------------

export interface AdoptOrphansResult {
  examined: number;
  adopted: number;
  /** Orphans that recordScanFinding refused — no investigative category matched. */
  refused: number;
  orphans: { diffId: string; beforeDate: string; afterDate: string; categories: string[] }[];
}

export async function adoptOrphanedFindings(
  opts: { url?: string; dryRun?: boolean } = {},
): Promise<AdoptOrphansResult> {
  let trackedUrlId: string | undefined;
  if (opts.url) {
    const tracked = await prisma.trackedUrl.findUnique({
      where: { url: opts.url },
      select: { id: true },
    });
    if (!tracked) throw new Error(`No tracked URL found for: ${opts.url}`);
    trackedUrlId = tracked.id;
  }

  const orphans = await prisma.urlVersionDiff.findMany({
    where: {
      ...(trackedUrlId ? { trackedUrlId } : {}),
      isLegallySignificant: true,
      // The definition of an orphan: classified significant, never recorded.
      evidence: { none: {} },
    },
    orderBy: { afterDate: 'asc' },
    include: {
      trackedUrl: { select: { url: true } },
      beforeSnapshot: { select: { waybackTimestamp: true, contentHash: true } },
      afterSnapshot: { select: { waybackTimestamp: true, contentHash: true } },
    },
  });

  let adopted = 0;
  let refused = 0;

  for (const diff of orphans) {
    if (opts.dryRun) continue;

    const before = await prisma.evidence.count({ where: { urlVersionDiffId: diff.id } });

    await recordScanFinding({
      diffId: diff.id,
      url: diff.trackedUrl.url,
      afterDate: diff.afterDate,
      snapshotUrl: diff.snapshotUrl,
      beforeSnapshot: requireSnapshotIdentity(diff.beforeSnapshot, 'before'),
      afterSnapshot: requireSnapshotIdentity(diff.afterSnapshot, 'after'),
      // The stored classification, unchanged. Adoption records what the diff
      // already asserts; it never re-decides it.
      aiSignificance: diff.aiSignificance,
      investigativeCategories: investigativeCategoriesField.parse(diff.investigativeCategories),
      deletedText: diff.deletedText,
      addedText: diff.addedText,
      deletedItems: parseDiffItems(diff.deletedText),
      addedItems: parseDiffItems(diff.addedText),
    });

    // recordScanFinding is non-fatal and refuses silently when no category
    // matched, so success is confirmed rather than assumed.
    const after = await prisma.evidence.count({ where: { urlVersionDiffId: diff.id } });
    if (after > before) adopted++;
    else refused++;
  }

  return {
    examined: orphans.length,
    adopted,
    refused,
    orphans: orphans.map((d) => ({
      diffId: d.id,
      beforeDate: d.beforeDate,
      afterDate: d.afterDate,
      categories: [...d.investigativeCategories],
    })),
  };
}

// ---------------------------------------------------------------------------
// Evidence whose classification no longer matches its source diff.
//
// buildForensicEvidence COPIES investigativeCategories onto the Evidence row at
// promotion time, so the Evidence is its own snapshot of the verdict that
// justified it. Comparing that snapshot against the diff's current verdict
// detects divergence with no classification history at all.
//
// Reporting only. Reconciling means either re-promoting or withdrawing an
// evidentiary claim, and neither is a decision a maintenance script should make.
// ---------------------------------------------------------------------------

export interface OutOfSyncEvidence {
  evidenceId: string;
  fileHash: string;
  status: string;
  evidenceCategories: string[];
  diffCategories: string[];
  diffStillSignificant: boolean;
}

export async function findOutOfSyncEvidence(): Promise<OutOfSyncEvidence[]> {
  const records = await prisma.evidence.findMany({
    where: { urlVersionDiffId: { not: null } },
    select: {
      id: true,
      fileHash: true,
      status: true,
      investigativeCategories: true,
      urlVersionDiff: {
        select: { investigativeCategories: true, isLegallySignificant: true },
      },
    },
  });

  const out: OutOfSyncEvidence[] = [];
  for (const r of records) {
    if (!r.urlVersionDiff) continue;
    const a = [...r.investigativeCategories].sort();
    const b = [...r.urlVersionDiff.investigativeCategories].sort();
    if (a.join('|') === b.join('|')) continue;

    out.push({
      evidenceId: r.id,
      fileHash: r.fileHash,
      status: r.status,
      evidenceCategories: a,
      diffCategories: b,
      diffStillSignificant: r.urlVersionDiff.isLegallySignificant,
    });
  }
  return out;
}
