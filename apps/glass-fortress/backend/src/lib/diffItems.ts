import { type DiffItem } from '../services/ForensicAgent';

// Parses the deletedText/addedText JSON column, handling the legacy string[] format
// produced before the coupled {summary, exactQuote} schema was introduced. Shared by
// every route that reads a UrlVersionDiff's stored claim text — forensicsRoutes and
// evidenceRoutes both surface the same diff content.
export function parseDiffItems(json: string): DiffItem[] {
  const parsed = JSON.parse(json) as unknown[];
  if (parsed.length === 0) return [];
  if (typeof parsed[0] === 'string') {
    return (parsed as string[]).map((s) => ({ summary: s, exactQuote: '' }));
  }
  return parsed as DiffItem[];
}
