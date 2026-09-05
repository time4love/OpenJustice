import { z } from 'zod';
import { CdxEntryStatus, type Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { getResearcherId } from '../../context/researcherContext';
import { WaybackScraper } from '../../services/WaybackScraper';
import { rulesetIdAt, type Outcome } from '../derivations';
import { loadWorkListRows } from '../rows';

// ---------------------------------------------------------------------------
// survey_wayback_captures — docs/gf-interaction-flows.md Phase 0 and A5.
//
// THE ONE ENTRY TO THE CORPUS, AND THE WORK-LIST. Before anything is fetched,
// stored or spent: the first survey of a URL creates its TrackedUrl attributed
// to the researcher who asked; every survey asks the CDX index for every
// capture it holds, records each query, and appends one row per capture the
// page does not hold yet — UNFETCHED, carrying the digest — as the existence
// row the walk will later update and never create.
//
// ORDER OF OPERATIONS IS THE CONTRACT. The archive is asked FIRST, every page,
// and nothing is written until it has answered in full: a CDX failure refuses
// ARCHIVE_UNAVAILABLE with nothing written, the TrackedUrl included — creation
// follows the archive's answer. Then ONE transaction (A7) writes the page, the
// queries and the rows together.
//
// THE LEGACY JOIN (refactor plan §5, load-bearing): 83 of 112 staging
// snapshots predated the index table when counted on 2026-09-03. A new row whose (page, timestamp) matches
// an existing UrlSnapshot is written ACQUIRED with that snapshotId, the
// RULESET_ID in force at its timestamp (the empty set's until a rule exists)
// and the snapshot's textExtractionVersion, so a null never reaches STALE.
//
// Built BESIDE the old path (plan §1): the CDX query is reused, uncollapsed;
// `recordCdxObservation` is not, because I5 holds that the one creator of
// work-list rows is a module under src/walk. Nothing here fetches a capture.
// ---------------------------------------------------------------------------

export const surveyWaybackCapturesSchema = {
  url: z.url().describe('The page to survey — exact URL; the first survey brings it into the corpus'),
};

interface CdxRow {
  timestamp: string;
  digest: string;
}

/** One page of the archive's answer, as asked and as answered. */
interface CdxPage {
  queriedAt: Date;
  fromDate: string | undefined;
  rows: CdxRow[];
  hasMore: boolean;
}

interface Refusal {
  error: string;
  code: 'NO_RESEARCHER' | 'ARCHIVE_UNAVAILABLE';
}

interface Survey {
  trackedUrlId: string;
  created: boolean;
  captures: number;
  byteDistinct: number;
  span: { from: string; to: string } | null;
  held: number;
  appended: number;
  unservable: number;
}

/** The next page's `from=` bound: strictly after the last capture seen, as the old path pages. */
function afterTimestamp(waybackTimestamp: string): string {
  return (BigInt(waybackTimestamp) + BigInt(1)).toString().padStart(14, '0');
}

/**
 * Every page of the index, in order. Throws on the first page the archive
 * fails to answer, so the caller can refuse with nothing written.
 */
async function askEveryPage(scraper: WaybackScraper, url: string): Promise<CdxPage[]> {
  const pages: CdxPage[] = [];
  let fromDate: string | undefined;
  for (;;) {
    const queriedAt = new Date();
    const { snapshots, hasMore } = await scraper.queryCdxIndex(url, fromDate, { collapse: false });
    pages.push({ queriedAt, fromDate, rows: snapshots, hasMore });
    const last = snapshots.at(-1);
    // "More exist" with no row to page from is the archive contradicting itself;
    // the answer is recorded as given and the survey stops rather than re-asking
    // the same question forever.
    if (!hasMore || last === undefined) return pages;
    fromDate = afterTimestamp(last.timestamp);
  }
}

/** YYYYMMDDHHMMSS → YYYY-MM-DD. */
function isoDate(waybackTimestamp: string): string {
  return `${waybackTimestamp.slice(0, 4)}-${waybackTimestamp.slice(4, 6)}-${waybackTimestamp.slice(6, 8)}`;
}

/** Captures whose digest differs from the one immediately before, the first counting. */
function byteDistinctCount(rows: readonly CdxRow[]): number {
  let count = 0;
  let previous: string | undefined;
  for (const row of rows) {
    if (row.digest !== previous) count += 1;
    previous = row.digest;
  }
  return count;
}

export async function surveyWaybackCapturesHandler(input: { url: string }): Promise<string> {
  const researcherId = getResearcherId();
  if (researcherId === null) {
    const refusal: Refusal = { error: 'A survey is attributed to a researcher. No researcher in context.', code: 'NO_RESEARCHER' };
    return JSON.stringify(refusal);
  }

  const existingPage = await prisma.trackedUrl.findUnique({ where: { url: input.url }, select: { id: true } });

  let pages: CdxPage[];
  try {
    pages = await askEveryPage(new WaybackScraper(), input.url);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const refusal: Refusal = { error: `The archive's index could not be read: ${message}`, code: 'ARCHIVE_UNAVAILABLE' };
    return JSON.stringify(refusal);
  }
  const reported = pages.flatMap((page) => page.rows.map((row) => ({ ...row, observedAt: page.queriedAt })));

  const survey = await prisma.$transaction(async (tx: Prisma.TransactionClient): Promise<Survey> => {
    const trackedUrlId =
      existingPage?.id ?? (await tx.trackedUrl.create({ data: { url: input.url, createdById: researcherId } })).id;

    for (const page of pages) {
      await tx.cdxQuery.create({
        data: {
          trackedUrlId,
          queriedAt: page.queriedAt,
          fromDate: page.fromDate ?? null,
          rowCount: page.rows.length,
          hasMore: page.hasMore,
        },
      });
    }

    // Read through the one boundary: a row the old path STORED is held.
    const held = await loadWorkListRows(tx, trackedUrlId);
    const known = new Set(held.map((row) => row.waybackTimestamp));
    const fresh = reported.filter((row) => !known.has(row.timestamp));

    // The legacy join: a capture the corpus already holds, keyed by page and
    // timestamp alone. Rules and the log are read only when there is a row to
    // stamp — a page with nothing to join reads nothing it does not need.
    const snapshotByTimestamp = new Map<string, { id: string; textExtractionVersion: string }>();
    if (fresh.length > 0) {
      const snapshots = await tx.urlSnapshot.findMany({
        where: { trackedUrlId, waybackTimestamp: { not: null } },
        select: { id: true, waybackTimestamp: true, textExtractionVersion: true },
      });
      for (const snapshot of snapshots) {
        if (snapshot.waybackTimestamp !== null) snapshotByTimestamp.set(snapshot.waybackTimestamp, snapshot);
      }
    }
    const joined = fresh.filter((row) => snapshotByTimestamp.has(row.timestamp));
    const rules = joined.length > 0 ? await tx.rule.findMany({ where: { trackedUrlId } }) : [];
    const decisions =
      joined.length > 0 ? await tx.pageDecision.findMany({ where: { trackedUrlId }, orderBy: { sequence: 'asc' } }) : [];

    if (fresh.length > 0) {
      await tx.cdxIndexEntry.createMany({
        data: fresh.map((row) => {
          const snapshot = snapshotByTimestamp.get(row.timestamp);
          const base = {
            trackedUrlId,
            waybackTimestamp: row.timestamp,
            digest: row.digest,
            observedAt: row.observedAt,
          };
          return snapshot === undefined
            ? { ...base, status: CdxEntryStatus.UNFETCHED }
            : {
                ...base,
                status: CdxEntryStatus.ACQUIRED,
                snapshotId: snapshot.id,
                rulesetId: rulesetIdAt(rules, decisions, row.timestamp),
                textExtractionVersion: snapshot.textExtractionVersion,
              };
        }),
      });
    }

    // The whole page after the survey: what it held, plus what was appended.
    const page: { timestamp: string; digest: string; outcome: Outcome }[] = [
      ...held.map((row) => ({ timestamp: row.waybackTimestamp, digest: row.digest, outcome: row.outcome })),
      ...fresh.map((row) => ({
        timestamp: row.timestamp,
        digest: row.digest,
        outcome: snapshotByTimestamp.has(row.timestamp) ? ('ACQUIRED' as const) : ('UNFETCHED' as const),
      })),
    ].sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
    const first = page.at(0);
    const last = page.at(-1);

    return {
      trackedUrlId,
      created: existingPage === null,
      captures: reported.length,
      byteDistinct: byteDistinctCount(page),
      span: first !== undefined && last !== undefined ? { from: isoDate(first.timestamp), to: isoDate(last.timestamp) } : null,
      held: page.filter((row) => row.outcome === 'ACQUIRED').length,
      appended: fresh.length,
      unservable: page.filter((row) => row.outcome === 'UNSERVABLE').length,
    };
  });

  return JSON.stringify(survey);
}
