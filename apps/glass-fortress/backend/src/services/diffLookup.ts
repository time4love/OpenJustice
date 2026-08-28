import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

// ---------------------------------------------------------------------------
// Finding one diff, the same way from every tool.
//
// Diff ids are database-local: the same page change carries a different uuid in
// each environment. A tool that accepted only an id would make every
// cross-environment comparison begin with a manual lookup in each environment —
// and comparing environments is the reason these tools exist.
//
// url + afterDate is the pair that means the same thing everywhere, so one
// prompt runs unchanged against any deployment.
// ---------------------------------------------------------------------------

/**
 * The relations both lookup paths load.
 *
 * Declared once so the by-id and by-url-and-date paths cannot drift: a relation
 * added to one and not the other makes a tool correct when called one way and
 * wrong when called the other. The capture fields are here because every reader
 * of a diff must be able to show its Level 5 verdict.
 */
export const DIFF_LOOKUP_INCLUDE = {
  trackedUrl: true,
  beforeSnapshot: { select: { textHash: true, textExtractionVersion: true } },
  afterSnapshot: { select: { textHash: true, textExtractionVersion: true } },
} as const;

export type DiffWithUrl = Prisma.UrlVersionDiffGetPayload<{
  include: typeof DIFF_LOOKUP_INCLUDE;
}>;

export type DiffLookupResult =
  | { status: 'FOUND'; diff: DiffWithUrl }
  | { status: 'NOT_FOUND'; explanation: string }
  | {
      status: 'AMBIGUOUS';
      explanation: string;
      candidates: { diffId: string; beforeDate: string; afterDate: string }[];
    };

export interface DiffLookupInput {
  diffId?: string;
  url?: string;
  afterDate?: string;
}

export async function resolveDiff(input: DiffLookupInput): Promise<DiffLookupResult> {
  if (input.diffId !== undefined) {
    const diff = await prisma.urlVersionDiff.findUnique({
      where: { id: input.diffId },
      include: DIFF_LOOKUP_INCLUDE,
    });
    if (diff === null) {
      return {
        status: 'NOT_FOUND',
        explanation:
          `No diff with id ${input.diffId}. Diff ids are per-environment: the same page change has ` +
          'a different id in each database, so an id copied from another environment will not ' +
          'resolve here. Identify the diff by url + afterDate instead.',
      };
    }
    return { status: 'FOUND', diff };
  }

  if (input.url === undefined || input.afterDate === undefined) {
    return {
      status: 'NOT_FOUND',
      explanation:
        'Identify the diff either by diffId, or by url AND afterDate together. url alone is not ' +
        'enough — a tracked page has many diffs.',
    };
  }

  const matches = await prisma.urlVersionDiff.findMany({
    where: { trackedUrl: { url: input.url }, afterDate: input.afterDate },
    include: DIFF_LOOKUP_INCLUDE,
    orderBy: { beforeDate: 'asc' },
  });

  if (matches.length === 0) {
    return {
      status: 'NOT_FOUND',
      explanation:
        'No diff on that url with that afterDate. get_forensic_timeline lists every diff with its ' +
        'beforeDate and afterDate.',
    };
  }

  // Reported rather than resolved by picking the first. Silently classifying
  // whichever row sorted first would answer a question nobody asked.
  if (matches.length > 1) {
    return {
      status: 'AMBIGUOUS',
      explanation:
        `That url has ${String(matches.length)} diffs with afterDate ${input.afterDate}. Pass ` +
        'diffId to choose one — the candidates are listed below.',
      candidates: matches.map((d) => ({
        diffId: d.id,
        beforeDate: d.beforeDate,
        afterDate: d.afterDate,
      })),
    };
  }

  // Exactly one match: length 0 and >1 are both handled above.
  return { status: 'FOUND', diff: matches[0] };
}
