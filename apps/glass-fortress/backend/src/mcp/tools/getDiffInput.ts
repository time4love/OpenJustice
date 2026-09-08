import { z } from 'zod';
import { isWaybackTimestamp } from '../../lib/evidenceIdentity';
import { prisma } from '../../lib/prisma';
import { loadDiffByPair, loadPage, pairName, type Page } from '../../services/corpusReads';
import { currentVersionOf } from '../../services/evidencePredicates';
import { answer, refusal, openPage, shared, type Refusal } from './evidenceRefusals';

// ---------------------------------------------------------------------------
// get_diff_input({ url, before, after }) — PUBLIC — docs/gf-evidence-flows.md A4.
//
// "The pair's two current texts and the CURRENT version's chunks — named by the
// PAIR, never by a date pair; an ambiguous name is impossible by construction."
//
// A DIFF IS ITS PAIR. §7: as built, "the timeline displays `beforeDate`/
// `afterDate` strings that can name a capture the corpus does not hold" — Level
// 8's boundary defect. Here the two parameters are wayback timestamps, which are
// unique per page, so the interval a caller asks about is the interval the
// corpus holds.
//
// EVERY NEGATIVE CARRIES A NAME. `NOT_A_CAPTURE` and `NO_SUCH_DIFF` are
// different answers and are kept apart: "you named something that is not a
// capture of this page" and "these two captures are not a pair the walk wrote"
// are different facts, and the tool this one replaces collapsed exactly that
// kind of distinction into an empty answer.
// ---------------------------------------------------------------------------

export const getDiffInputSchema = {
  url: z.url().describe('The page — exact URL, as it was surveyed'),
  before: z
    .string()
    .describe('The EARLIER capture, by its 14-digit wayback timestamp — never a date'),
  after: z
    .string()
    .describe('The LATER capture, by its 14-digit wayback timestamp — never a date'),
};

interface Side {
  capture: string;
  textHash: string;
  textExtractionVersion: string;
  text: string;
}

interface DiffInput {
  page: { url: string; public: boolean };
  before: Side;
  after: Side;
  current: { contentVersionHash: string; diffVersion: string; chunks: unknown };
}

/**
 * A timestamp that is not fourteen digits is refused rather than guessed at (A4:
 * "a tool given a date instead of a timestamp refuses NOT_A_CAPTURE rather than
 * guessing"), and a well-formed one that names no ACQUIRED capture SAYS WHICH IT
 * IS — the page holds the capture but the corpus holds no text for it, or the
 * page's work-list has no such timestamp at all. Two states, two sentences.
 */
async function captureRefusal(page: Page, role: string, value: string): Promise<Refusal> {
  if (!isWaybackTimestamp(value)) {
    return refusal(
      'NOT_A_CAPTURE',
      `${role}=${value} is not a capture. A capture is named by its 14-digit wayback timestamp ` +
        '(YYYYMMDDHHMMSS), never by a date: three captures on one day are three captures. ' +
        `list_findings url=${page.url} lists every one this page holds.`,
    );
  }
  const row = await prisma.cdxIndexEntry.findFirst({
    where: { trackedUrlId: page.id, waybackTimestamp: value },
    select: { status: true },
  });
  if (row === null) {
    return refusal(
      'NOT_A_CAPTURE',
      `${role}=${value} is not on this page's work-list at all: the archive never reported a ` +
        'capture at that timestamp. Re-survey the page if you expect the archive to have added it.',
    );
  }
  return refusal(
    'NOT_A_CAPTURE',
    `${role}=${value} is on this page's work-list with outcome ${row.status}, so the corpus holds ` +
      'no text for it. Only an ACQUIRED capture has a text version to diff.',
  );
}

export async function getDiffInputHandler(input: {
  url: string;
  before: string;
  after: string;
}): Promise<string> {
  return answer(async (): Promise<DiffInput | Refusal> => {
    const page = await loadPage(input.url);
    if (page === null) return shared.notSurveyed(input.url);

    const access = await openPage(page);
    if (access.refused !== null) return access.refused;

    const diff = await loadDiffByPair(page.id, input.before, input.after);
    if (diff === null) {
      // Which of the three it is, in order: a name that is not a capture at all,
      // then a pair the walk never wrote.
      const captures = await prisma.urlSnapshot.findMany({
        where: {
          trackedUrlId: page.id,
          waybackTimestamp: { in: [input.before, input.after] },
        },
        select: { waybackTimestamp: true },
      });
      const held = new Set(captures.map((c) => c.waybackTimestamp));
      if (!held.has(input.before)) return captureRefusal(page, 'before', input.before);
      if (!held.has(input.after)) return captureRefusal(page, 'after', input.after);
      return refusal(
        'NO_SUCH_DIFF',
        `${input.before} → ${input.after} is not a pair the walk wrote. Both captures are in the ` +
          'corpus, but a diff spans two CONSECUTIVE acquired captures; list_findings shows every ' +
          'pair this page holds.',
      );
    }

    const current = currentVersionOf({
      kind: 'DIFF',
      before: diff.before,
      after: diff.after,
      versions: diff.versions,
    });
    if (!current.defined || current.kind !== 'DIFF') {
      return refusal(
        'AWAITING_DERIVATION',
        `The diff ${pairName(diff)} has no current content version: its endpoints' text has moved ` +
          'and the walk owes a re-derivation. This is not a finding about the change — nothing has ' +
          'been derived to look at yet. Run scan_captures on this page and ask again.',
      );
    }

    const texts = await prisma.urlSnapshot.findMany({
      where: { id: { in: [diff.before.id, diff.after.id] } },
      select: { id: true, text: true },
    });
    const textOf = (id: string): string => {
      const row = texts.find((t) => t.id === id);
      if (row === undefined) {
        throw new Error(
          `Walk defect: the diff ${pairName(diff)} names a capture the corpus does not hold.`,
        );
      }
      return row.text;
    };

    return {
      page: { url: page.url, public: access.public },
      before: {
        capture: diff.before.capture,
        textHash: diff.before.textHash,
        textExtractionVersion: diff.before.textExtractionVersion,
        text: textOf(diff.before.id),
      },
      after: {
        capture: diff.after.capture,
        textHash: diff.after.textHash,
        textExtractionVersion: diff.after.textExtractionVersion,
        text: textOf(diff.after.id),
      },
      current: {
        contentVersionHash: current.contentVersionHash,
        diffVersion: current.version.diffVersion,
        chunks: current.version.chunks,
      },
    };
  });
}
