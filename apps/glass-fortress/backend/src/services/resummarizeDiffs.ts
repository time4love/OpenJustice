import { prisma } from '../lib/prisma';
import { parseDiffItems } from '../lib/diffItems';
import { ForensicSummaryRewriter } from './ForensicAgent';
import { forensicEvidenceFileHash } from './forensicEvidence';
import { SUMMARY_VERSION } from '../lib/classifierVersion';
import { VectorStoreService } from './VectorStoreService';

// ---------------------------------------------------------------------------
// Rewriting stored summaries so each describes only its own source.
//
// WHY THIS IS A SCRIPT AND NOT A TOOL
//
// This is corpus maintenance, not research. MCP is the researcher's path; an
// npm script is the operator's — it needs repo access, environment credentials
// and a shell, which is a completely different authorization boundary from "any
// approved researcher holding a connector". Rewriting the public prose of an
// anchored record is not something every researcher should be able to do in one
// call, and an earlier draft of this work got that wrong.
//
// WHAT IT REPAIRS
//
// Until v3 the classification prompt instructed the model to "EXPLICITLY
// cross-reference" correlated evidence inside legalSignificance — and that prose
// becomes Evidence.summary verbatim. So evidence records asserted facts drawn
// from OTHER records, unverifiable against their own source, and every
// thesis-stage agent read them as independent observations.
//
// WHY IT REWRITES ONLY THE SUMMARY
//
// The evidence fileHash covers url + date + deletedText + addedText — the
// extracted items. Re-running classification re-extracts them, and the
// classifier is non-deterministic (measured: 10 findings on one run, 5 on
// another from identical input). Different items mean a different hash, which
// would orphan the seven on-chain anchors this vault has. So the items are the
// INPUT here and are never rewritten, and the post-condition below enforces it.
// ---------------------------------------------------------------------------

export interface ResummarizeRow {
  diffId: string;
  url: string;
  afterDate: string;
  previousText: string;
  newText: string;
  /** Present when this diff was promoted to evidence. */
  fileHash: string | null;
  evidenceUpdated: boolean;
  reindexed: boolean;
}

export interface ResummarizeReport {
  examined: number;
  rewritten: number;
  alreadySelfContained: number;
  failed: number;
  /** Must be 0. A non-zero value means a rewrite moved a hashed field. */
  hashDrift: number;
  dryRun: boolean;
  rows: ResummarizeRow[];
}

export async function resummarizeDiffs(opts: {
  url?: string;
  dryRun: boolean;
  limit?: number;
}): Promise<ResummarizeReport> {
  const diffs = await prisma.urlVersionDiff.findMany({
    where: {
      // Rows already carrying a self-contained summary are left exactly alone —
      // re-running must be safe and must not churn prose that is already right.
      //
      // The null branch is not defensive padding, it is the whole target set.
      // `NOT: { summaryVersion: X }` compiles to `NOT (summaryVersion = X)`,
      // which evaluates to NULL — and therefore matches nothing — on a NULL
      // column. Every row needing this repair has summaryVersion NULL, so that
      // filter selected precisely the rows it exists to find, and reported
      // "examined: 0, failed: 0" with exit code 0. A pass that silently does
      // nothing must not look like a pass that found nothing to do.
      OR: [{ summaryVersion: null }, { summaryVersion: { not: SUMMARY_VERSION } }],
      ...(opts.url ? { trackedUrl: { url: opts.url } } : {}),
    },
    select: {
      id: true,
      afterDate: true,
      aiSignificance: true,
      deletedText: true,
      addedText: true,
      trackedUrl: { select: { url: true } },
      evidence: { select: { fileHash: true, status: true } },
    },
    orderBy: { afterDate: 'asc' },
    ...(opts.limit ? { take: opts.limit } : {}),
  });

  const report: ResummarizeReport = {
    examined: diffs.length,
    rewritten: 0,
    alreadySelfContained: 0,
    failed: 0,
    hashDrift: 0,
    dryRun: opts.dryRun,
    rows: [],
  };

  const rewriter = new ForensicSummaryRewriter();

  for (const diff of diffs) {
    const url = diff.trackedUrl.url;
    // Prisma models this side of the 1:1 as a list. Evidence.urlVersionDiffId is
    // @unique, so there is at most one — taking [0] is the shape, not a guess.
    const evidence = diff.evidence[0] ?? null;
    let newText: string;
    try {
      newText = await rewriter.rewrite({
        url,
        date: diff.afterDate,
        deletedItems: parseDiffItems(diff.deletedText),
        addedItems: parseDiffItems(diff.addedText),
      });
    } catch {
      // One bad row must not abort a corpus pass. Counted, never silent.
      report.failed++;
      continue;
    }

    // Post-condition, not decoration. The items are supposed to be untouched, so
    // the hash they produce must equal the hash the evidence row was registered
    // under. If a future change ever re-extracts here, this catches it BEFORE the
    // write rather than after seven anchors stop matching anything.
    if (evidence) {
      const expected = forensicEvidenceFileHash(url, diff.afterDate, diff.deletedText, diff.addedText);
      if (expected !== evidence.fileHash) {
        report.hashDrift++;
        continue;
      }
    }

    const row: ResummarizeRow = {
      diffId: diff.id,
      url,
      afterDate: diff.afterDate,
      previousText: diff.aiSignificance,
      newText,
      fileHash: evidence?.fileHash ?? null,
      evidenceUpdated: false,
      reindexed: false,
    };

    if (opts.dryRun) {
      report.rows.push(row);
      continue;
    }

    await prisma.$transaction([
      prisma.urlVersionDiff.update({
        where: { id: diff.id },
        data: { aiSignificance: newText, summaryVersion: SUMMARY_VERSION },
      }),
      // The previous prose is recorded for EVERY row touched, not only ones that
      // changed meaningfully. Capturing before-state selectively is how a bulk
      // pass rewrites text nobody can recover.
      prisma.summaryCorrection.create({
        data: {
          urlVersionDiffId: diff.id,
          fileHash: evidence?.fileHash ?? '',
          previousText: diff.aiSignificance,
          correctedText: newText,
          reason: `forensics:resummarize — rewritten from this diff's own items under ${SUMMARY_VERSION}`,
        },
      }),
      ...(evidence
        ? [
            prisma.evidence.update({
              where: { fileHash: evidence.fileHash },
              data: { summary: newText },
            }),
          ]
        : []),
    ]);

    row.evidenceUpdated = Boolean(evidence);

    // A CONFIRMED record is in the vector index keyed on its summary. Leaving the
    // embedding behind keeps semantic search answering from the text just
    // established to be wrong — invisible exactly where researchers look.
    if (evidence?.status === 'CONFIRMED') {
      try {
        const store = await VectorStoreService.create();
        await store.upsertEvidence(newText, evidence.fileHash);
        row.reindexed = true;
      } catch {
        row.reindexed = false;
      }
    }

    report.rewritten++;
    report.rows.push(row);
  }

  return report;
}
