import { prisma } from '../../lib/prisma';
import { OUTCOMES, type Outcome } from '../../walk/derivations';
import { answer } from './evidenceRefusals';

// ---------------------------------------------------------------------------
// list_pages({})
// GATED read · not paid — built 2026-09-14 on the researcher's ruling, between thesis steps 20 and 22.
//
// THE GAP IT CLOSES: docs/gf-thesis-step-19-2026-09-12.md §3 F3 — nothing listed the pages the corpus holds,
// and the connector's instructions said so in terms ("the researcher names a page by its exact URL"). A
// session driven by the tools alone cannot produce a URL it was never given; the exercise of thesis step 20
// met that wall one step after the framing's. Interaction A5 names no such read; the amendment is owed beside
// thesis A4's (the docs PR).
//
// GATED, NOT PUBLIC. The corpus reads are open because the public surface is the corpus (evidence §5) — but
// `list_findings` refuses NOT_PUBLIC for a page no published thesis cites, so the SET of surveyed pages is a
// researcher's working state until a thesis publishes; a public list would name what a researcher is
// looking at. The standing precedent is the walk's three gated reads (`get_article_rules`, `list_captures`,
// `get_rule_history`, flows A5); this handler asks no identity (A5 :1071–:1072). It refuses nothing.
//
// WHAT AN ENTRY CARRIES: the page as every other read names it (its exact URL), when it was surveyed, and
// its work-list rows COUNTED PER OUTCOME — every one of the walk's seven outcomes present, at zero where none
// (a scope says how many it examined, never nothing). `total` is the rows the survey admitted; ACQUIRED is
// what the corpus HOLDS, the survey's `held`. Ordered by the query: oldest surveyed first, then URL.
// ---------------------------------------------------------------------------

export const listPagesSchema = {};

interface PageEntry {
  url: string;
  title: string | null;
  surveyedAt: Date;
  total: number;
  outcomes: Record<Outcome, number>;
}

/** THE ONE FUNCTION behind the tool and `GET /api/research/pages` (UI-3). */
export async function pagesOf(): Promise<PageEntry[]> {
  const pages = await prisma.trackedUrl.findMany({
    select: { id: true, url: true, title: true, createdAt: true },
    orderBy: [{ createdAt: 'asc' }, { url: 'asc' }],
  });

  const entries: PageEntry[] = [];
  for (const page of pages) {
    const rows = await prisma.cdxIndexEntry.findMany({ where: { trackedUrlId: page.id }, select: { status: true } });
    const outcomes = Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as Record<Outcome, number>;
    for (const row of rows) outcomes[row.status] += 1;
    entries.push({ url: page.url, title: page.title ?? null, surveyedAt: page.createdAt, total: rows.length, outcomes });
  }
  return entries;
}

export async function listPagesHandler(): Promise<string> {
  return answer(() => pagesOf());
}
