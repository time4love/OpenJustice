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
