import { z } from 'zod';
import {
  compareCorpusKeys,
  corpusKeyOf,
  CORPUS_CURSOR_KEYS,
  CORPUS_READ_LIMIT,
  DAY,
  decodeCursor,
  entryInstant,
  inRange,
  loadCorpus,
  pageAfter,
  type CorpusEntry,
  type CorpusKey,
  type CorpusScope,
  type PageFacet,
  type PageRef,
} from '../../services/corpusReads';
import { answer, openScope, pageByUrl, scopedPages, validRange, type CorpusReadCode, type Refusal } from './evidenceRefusals';

// ---------------------------------------------------------------------------
// list_corpus({ scope, since?, until?, page?, kind?, cited?, cursor?, limit? }) — READ — docs/gf-ui-flows.md §6.1
// :236–:243, §28 :746–:753; docs/gf-ui-refactor-plan.md UI-2 :163–:169 (2026-09-15).
//
// THE CHRONOLOGY ACROSS EVERY PAGE OF A SCOPE — the same rows `list_findings` gives for one page (A4 :1081–:1090),
// each with its page, in TIMESTAMP order across pages and no other (A4 :1091), oldest first (§24 :682), paged on this
// read's own cursor, with the `pages` facet of the scope computed from the same load. `list_findings` is this read at
// one page, and the acceptance suite holds the two equal.
//
// `scope` DECIDES, NEVER IDENTITY (evidence A4 :1074–:1077 as amended). `public` answers over PUBLIC_PAGE's pages and
// reads no caller — the bytes are the same for everyone; `all` answers over every surveyed page and refuses
// NO_RESEARCHER without one, before any query. A named page not opened is NOT_PUBLIC at `public` whoever asks.
//
// `cited` is the RECORDS lens (§25 :699): the entries with `evidence` ≠ null, on the one read — never a second read.
// The facet is the page filter's source and so is never filtered by the call (§28 :748).
// ---------------------------------------------------------------------------

export const listCorpusSchema = {
  scope: z
    .enum(['public', 'all'])
    .describe("public — the pages a published thesis has opened, the same for everyone; all — every surveyed page, for a signed-in researcher"),
  since: DAY.optional().describe('Keep entries on or after this day (YYYY-MM-DD); a change is placed at the capture that shows it'),
  until: DAY.optional().describe('Keep entries on or before this day (YYYY-MM-DD)'),
  page: z.url().optional().describe('One page — its exact URL, as list_pages returns it'),
  kind: z.enum(['CAPTURE', 'DIFF']).optional().describe('Captures only, or changes only'),
  cited: z.boolean().optional().describe('true — only the entries a published thesis cites (the records lens)'),
  cursor: z
    .string()
    .refine((c) => decodeCursor(c, CORPUS_CURSOR_KEYS) !== null, 'not a cursor list_corpus issued')
    .optional()
    .describe('The nextCursor of the previous page of this read'),
  limit: z.number().int().min(1).max(CORPUS_READ_LIMIT).optional().describe(`Entries per page, at most ${String(CORPUS_READ_LIMIT)}`),
};

export interface ListCorpusInput {
  scope: CorpusScope;
  since?: string;
  until?: string;
  page?: string;
  kind?: 'CAPTURE' | 'DIFF';
  cited?: boolean;
  cursor?: string;
  limit?: number;
}

/** The core's input: the tool's, with the named page as a door's `PageRef` — the tool names it by url, a route by id (UI-3). */
export type CorpusInput = Omit<ListCorpusInput, 'page'> & { page?: PageRef };

interface CorpusList {
  entries: CorpusEntry[];
  pages: PageFacet[];
  nextCursor: string | null;
}

/** The cursor's key — the schema refused anything else before this ran, so a miss here is a caller that skipped it. */
function cursorOf(cursor: string | undefined): CorpusKey | null {
  if (cursor === undefined) return null;
  const key = decodeCursor(cursor, CORPUS_CURSOR_KEYS);
  if (key === null) throw new Error('list_corpus: the cursor is not one this read issued — the schema refuses it before the handler.');
  return key;
}

/** THE ONE FUNCTION behind the tool and both corpus routes (docs/gf-ui-flows.md §5 :184–:189): the read over a named page's ref. */
export async function corpusOf(input: CorpusInput): Promise<CorpusList | Refusal<CorpusReadCode>> {
  const gate = openScope(input.scope);
  if (gate !== null) return gate;
  const range = validRange(input.since, input.until);
  if (range !== null) return range;
  const cursor = cursorOf(input.cursor);

  const scope = await scopedPages(input.scope, input.page);
  if ('error' in scope) return scope;

  // THE FACET IS LOADED HERE, BEFORE THE FILTER BELOW AND BEFORE THE CURSOR'S SLICE, and that is what makes the
  // page card's strip the PAGE's shape rather than the view's (§24 region 3, ruled 2026-09-21). `scope.page` is the
  // page this call NAMED — the only row whose `shape` is computed, because region 0 draws no strip (§24 :695–:701).
  const { entries, pages } = await loadCorpus(scope.scoped, scope.page?.id ?? null);
  const kept = entries.filter(
    (entry) =>
      (scope.page === null || entry.page.trackedUrlId === scope.page.id) &&
      (input.kind === undefined || entry.kind === input.kind) &&
      (input.cited !== true || entry.evidence !== null) &&
      inRange(entryInstant(entry), input.since, input.until),
  );
  const paged = pageAfter(kept, cursor, input.limit ?? CORPUS_READ_LIMIT, corpusKeyOf, compareCorpusKeys);
  return { entries: paged.entries, pages, nextCursor: paged.nextCursor };
}

export async function listCorpusHandler(input: ListCorpusInput): Promise<string> {
  return answer(() => corpusOf({ ...input, page: input.page === undefined ? undefined : pageByUrl(input.page) }));
}
