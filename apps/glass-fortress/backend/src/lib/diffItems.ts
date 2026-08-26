import { type DiffItem } from '../services/ForensicAgent';

// Parses the deletedText/addedText JSON column. Shared by every route that reads
// a UrlVersionDiff's stored claim text — forensicsRoutes and evidenceRoutes both
// surface the same diff content.
//
// Two older shapes are still in the column and must keep parsing:
//
//   string[]                        — before {summary, exactQuote} was coupled
//   {summary, exactQuote}[]         — before classification moved to the item
//
// Both are normalised forward with empty categories and relocated: false. That
// is the honest default, not a guess: a row written before per-item
// classification existed carries no per-item verdict, and inventing one would
// let an unclassified item look like a deliberately cleared one. Bringing such
// rows up to date is `npm run forensics:reclassify`, not a parser default.
export function parseDiffItems(json: string): DiffItem[] {
  const parsed = JSON.parse(json) as unknown[];
  if (parsed.length === 0) return [];

  return parsed.map((raw): DiffItem => {
    if (typeof raw === 'string') {
      return { summary: raw, exactQuote: '', investigativeCategories: [], relocated: false };
    }
    const item = raw as Partial<DiffItem>;
    return {
      summary: item.summary ?? '',
      exactQuote: item.exactQuote ?? '',
      investigativeCategories: item.investigativeCategories ?? [],
      relocated: item.relocated ?? false,
    };
  });
}

// Parses the rawDeletedText/rawAddedText JSON column — the raw page-text chunks
// captured at scan time, BEFORE the classifier turned them into items.
//
// Deliberately not parseDiffItems: these two column pairs hold different things
// and are not interchangeable. deletedText/addedText are the classifier's OUTPUT
// (summary + exactQuote + categories); rawDeletedText/rawAddedText are its
// INPUT. Anything that re-runs the classifier over a stored diff must read the
// raw pair, or it feeds the model its own prior conclusions instead of the page.
//
// Tolerant by design: a malformed or non-array column yields [], because a diff
// with unreadable raw text must degrade to "nothing to classify" rather than
// throw and take down the caller iterating over a corpus.
export function parseRawChunks(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? (parsed as unknown[]).filter((c): c is string => typeof c === 'string') : [];
  } catch {
    return [];
  }
}
