import { z } from 'zod';
import { compareCorpusKeys, DAY, searchCaptures, type CorpusKey, type CorpusScope, type PageRef, type SearchVerdict } from '../../services/corpusReads';
import { answer, openScope, pageByUrl, refusal, scopedPages, validRange, type CorpusReadCode, type Refusal } from './evidenceRefusals';

// ---------------------------------------------------------------------------
// search_corpus({ scope, phrase, since?, until?, page? }) — READ — docs/gf-ui-flows.md §6.1 :248–:252; evidence A4
// :1101; thesis §10 :1053–:1057; docs/gf-ui-refactor-plan.md UI-2 :172–:173 (2026-09-15).
//
// AN EXACT PHRASE IN THE TEXT THE PLATFORM STORED for every held capture of every page in scope — one verdict per
// capture, `verify_claim_text`'s `presentInStoredSnapshot` (the ONE presence rule, `lib/htmlText.phrasePresent`),
// each with its page, in timestamp order across pages. THE STORED REGISTER ONLY, ruled 2026-09-15: A4 :1101 is "the
// corpus read by text, over current text versions" and thesis §10 "a phrase search over every text version … no index"
// — bounded, no network, a READ; the raw archive is asked by `verify_claim_text`, one capture at a time, and stays
// gated for that cost. Scopes and refusals as `list_corpus`, plus PHRASE_REQUIRED for a blank phrase — REASON_REQUIRED's
// shape, decided from the input before any query. No cursor: §6.1 gives it none, and no index is built before a
// measurement says the read is slow.
// ---------------------------------------------------------------------------

export const searchCorpusSchema = {
  scope: z
    .enum(['public', 'all'])
    .describe("public — the pages a published thesis has opened, the same for everyone; all — every surveyed page, for a signed-in researcher"),
  phrase: z
    .string()
    .describe('The exact text to find. Matched after collapsing whitespace; nothing else is normalised and no fuzzy matching is done.'),
  since: DAY.optional().describe('Search captures on or after this day (YYYY-MM-DD)'),
  until: DAY.optional().describe('Search captures on or before this day (YYYY-MM-DD)'),
  page: z.url().optional().describe('One page — its exact URL, as list_pages returns it'),
};

export interface SearchCorpusInput {
  scope: CorpusScope;
  phrase: string;
  since?: string;
  until?: string;
  page?: string;
}

/** The core's input: the tool's, with the named page as a door's `PageRef` (UI-3). */
export type SearchInput = Omit<SearchCorpusInput, 'page'> & { page?: PageRef };

interface SearchResult {
  phrase: string;
  entries: SearchVerdict[];
}

/** A verdict's place in the chronology — a capture's key, as `list_corpus` orders one. */
const keyOf = (verdict: SearchVerdict): CorpusKey => ({ t: verdict.capture, k: verdict.kind, p: verdict.page.url, b: '', h: verdict.fileHash });

/** THE ONE FUNCTION behind the tool and both search routes (UI-3). */
export async function searchOf(input: SearchInput): Promise<SearchResult | Refusal<CorpusReadCode>> {
  const gate = openScope(input.scope);
  if (gate !== null) return gate;
  const range = validRange(input.since, input.until);
  if (range !== null) return range;
  if (input.phrase.trim().length === 0) {
    return refusal('PHRASE_REQUIRED', 'A phrase is required; a blank one is found everywhere and says nothing.');
  }

  const scope = await scopedPages(input.scope, input.page);
  if ('error' in scope) return scope;
  const pages = scope.page === null ? scope.scoped : [scope.page];

  const entries: SearchVerdict[] = [];
  for (const page of pages) entries.push(...(await searchCaptures(page, input.phrase, input.since, input.until)));
  return { phrase: input.phrase, entries: entries.sort((a, b) => compareCorpusKeys(keyOf(a), keyOf(b))) };
}

export async function searchCorpusHandler(input: SearchCorpusInput): Promise<string> {
  return answer(() => searchOf({ ...input, page: input.page === undefined ? undefined : pageByUrl(input.page) }));
}
