import { prisma } from '../lib/prisma';
import { ForensicAgent } from './ForensicAgent';
import { WaybackScraper } from './WaybackScraper';
import { CLASSIFIER_VERSION, classifierPromptHash } from '../lib/classifierVersion';
import { deriveSignificance } from './ForensicAgent';

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
  flips: FlipRecord[];
}

function parseRawChunks(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]).filter((c) => typeof c === 'string') : [];
  } catch {
    return [];
  }
}

export interface ReclassifyOptions {
  /** Limit to one tracked URL. Omit to cover every one. */
  url?: string;
  /** Re-run rows already at the current version too. Off by default — pointless and costly. */
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
    const relatedEvidence = await scraper.fetchCorrelatedEvidence(
      diff.afterDate,
      diff.trackedUrlId,
    );

    const analysis = await agent.analyzeChange(
      parseRawChunks(diff.rawDeletedText),
      parseRawChunks(diff.rawAddedText),
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
        },
      });
      reclassified++;
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
    flipsToSignificant,
    flipsToRoutine,
    flipsWithEvidence,
    flips,
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
