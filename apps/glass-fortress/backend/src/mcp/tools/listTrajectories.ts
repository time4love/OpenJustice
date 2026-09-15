import { z } from 'zod';
import { getStoredClaimTrajectories } from '../../services/claimTrajectory';
import {
  compareTrajectoryKeys,
  CORPUS_READ_LIMIT,
  DAY,
  decodeCursor,
  inRange,
  leftAt,
  pageAfter,
  trajectoryFindings,
  trajectoryKeyOf,
  TRAJECTORY_CURSOR_KEYS,
  type CorpusScope,
  type EntryPage,
  type TrajectoryEntry,
  type TrajectoryKey,
} from '../../services/corpusReads';
import { answer, openScope, scopedPages, validRange, type CorpusReadCode, type Refusal } from './evidenceRefusals';

// ---------------------------------------------------------------------------
// list_trajectories({ scope, since?, until?, page?, cursor?, limit? }) — READ — docs/gf-ui-flows.md §6.1 :244–:247,
// §25 :691–:697; evidence A4 :1103; docs/gf-ui-refactor-plan.md UI-2 :170–:171 (2026-09-15).
//
// THE CLAIMS LENS ACROSS EVERY PAGE OF A SCOPE — `get_claim_trajectories`' findings for each page, each with its page,
// ordered by the date the claim LEFT, latest first (§6.1 :246, as written). Scopes and refusals as `list_corpus`.
//
// IT NEVER COMPUTES. `get_claim_trajectories` detects and WRITES a pass on a miss, which is why it is gated; a READ
// reads STORED state — `getStoredClaimTrajectories`, the pass for the page's CURRENT state or none. A page in scope
// whose current state no stored pass describes is NAMED in `undetected`, never silently absent: an absence a reader
// cannot see is an absence reported as "no claims moved" (the R52 sketch §0b, §6-D4).
// ---------------------------------------------------------------------------

export const listTrajectoriesSchema = {
  scope: z
    .enum(['public', 'all'])
    .describe("public — the pages a published thesis has opened, the same for everyone; all — every surveyed page, for a signed-in researcher"),
  since: DAY.optional().describe('Keep claims that LEFT on or after this day (YYYY-MM-DD)'),
  until: DAY.optional().describe('Keep claims that LEFT on or before this day (YYYY-MM-DD)'),
  page: z.url().optional().describe('One page — its exact URL, as list_pages returns it'),
  cursor: z
    .string()
    .refine((c) => decodeCursor(c, TRAJECTORY_CURSOR_KEYS) !== null, 'not a cursor list_trajectories issued')
    .optional()
    .describe('The nextCursor of the previous page of this read'),
  limit: z.number().int().min(1).max(CORPUS_READ_LIMIT).optional().describe(`Findings per page, at most ${String(CORPUS_READ_LIMIT)}`),
};

export interface ListTrajectoriesInput {
  scope: CorpusScope;
  since?: string;
  until?: string;
  page?: string;
  cursor?: string;
  limit?: number;
}

interface TrajectoryList {
  entries: TrajectoryEntry[];
  /** The pages in scope whose current state has no stored detection pass — named, so nothing reads as "nothing moved". */
  undetected: EntryPage[];
  nextCursor: string | null;
}

function cursorOf(cursor: string | undefined): TrajectoryKey | null {
  if (cursor === undefined) return null;
  const key = decodeCursor(cursor, TRAJECTORY_CURSOR_KEYS);
  if (key === null) throw new Error('list_trajectories: the cursor is not one this read issued — the schema refuses it before the handler.');
  return key;
}

export async function listTrajectoriesHandler(input: ListTrajectoriesInput): Promise<string> {
  return answer(async (): Promise<TrajectoryList | Refusal<CorpusReadCode>> => {
    const gate = openScope(input.scope);
    if (gate !== null) return gate;
    const range = validRange(input.since, input.until);
    if (range !== null) return range;
    const cursor = cursorOf(input.cursor);

    const scope = await scopedPages(input.scope, input.page);
    if ('error' in scope) return scope;
    const pages = scope.page === null ? scope.scoped : [scope.page];

    const entries: TrajectoryEntry[] = [];
    const undetected: EntryPage[] = [];
    for (const page of pages) {
      const entryPage: EntryPage = { trackedUrlId: page.id, url: page.url, public: page.public };
      const stored = await getStoredClaimTrajectories(page.url);
      if (stored === null) {
        undetected.push(entryPage);
        continue;
      }
      for (const finding of trajectoryFindings(stored)) entries.push({ ...finding, page: entryPage });
    }

    const kept = entries
      .filter((entry) => inRange(leftAt(entry), input.since, input.until))
      .sort((a, b) => compareTrajectoryKeys(trajectoryKeyOf(a), trajectoryKeyOf(b)));
    const paged = pageAfter(kept, cursor, input.limit ?? CORPUS_READ_LIMIT, trajectoryKeyOf, compareTrajectoryKeys);
    return { entries: paged.entries, undetected, nextCursor: paged.nextCursor };
  });
}
