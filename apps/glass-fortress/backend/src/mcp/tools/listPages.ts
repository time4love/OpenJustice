import { prisma } from '../../lib/prisma';
import { publicPage } from '../../services/evidencePredicates';
import { OUTCOMES, type Outcome } from '../../walk/derivations';
import { loadWorkListRows } from '../../walk/rows';
import { pendingStopOf } from '../../walk/stop';
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
//
// THREE FIELDS FOR THE READ VIEW — interaction A5 :1071, the envelope RULED 2026-09-20 (the researcher, R66
// „Q2 add fields”). Each is a field the gated pages need and NOT ONE IS A RULE THIS READ INVENTS:
//
//   `trackedUrlId`  the id every gated route takes (`/api/research/pages/:trackedUrlId/…`, ui §7 :296–:302).
//                   The #488 precedent: the thesis body gained it for exactly this reason. The URL stays —
//                   it is what a READER is shown (§4 :167); the id is what a LINK is built from.
//   `public`        PUBLIC_PAGE, `publicPage` CALLED (ui §28; evidence A3). The read view draws the NOT
//                   PUBLIC mark from it (§27 :866), and this read is the one place the predicate is asked
//                   for this set — a page computing it from `list_corpus`' facet would be a second rule.
//   `stopPending`   `pendingStopOf` CALLED (`walk/stop.ts`), so the read view shows the stop AS A FACT
//                   (§29 :905, §27 :872–:876) and never as the marking link. Before this, §27 :874 had the
//                   facet derive it "from `get_article_rules`" — one call PER PAGE, an N+1 this field
//                   removes. A PENDING row carrying NO stop is awaiting evaluation and is NOT a pending
//                   stop; that distinction is `walk/stop.ts`'s and is not re-spelled here.
//
// THE ROWS NOW COME THROUGH `loadWorkListRows`, the walk's ONE boundary between a stored status and an
// outcome (`walk/rows.ts`). This read used to select `status` raw and count it, which made it a second
// reader of that column; `pendingStopOf` needs a `LoadedRow` anyway, so the boundary serves both and a
// status the enum gains is still decided in exactly one place.
// ---------------------------------------------------------------------------

export const listPagesSchema = {};

interface PageEntry {
  trackedUrlId: string;
  url: string;
  public: boolean;
  title: string | null;
  surveyedAt: Date;
  total: number;
  outcomes: Record<Outcome, number>;
  stopPending: boolean;
}

/** THE ONE FUNCTION behind the tool and `GET /api/research/pages` (UI-3). */
export async function pagesOf(): Promise<PageEntry[]> {
  const pages = await prisma.trackedUrl.findMany({
    select: { id: true, url: true, title: true, createdAt: true },
    orderBy: [{ createdAt: 'asc' }, { url: 'asc' }],
  });

  const entries: PageEntry[] = [];
  for (const page of pages) {
    const rows = await loadWorkListRows(prisma, page.id);
    const outcomes = Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as Record<Outcome, number>;
    for (const row of rows) outcomes[row.outcome] += 1;
    entries.push({
      trackedUrlId: page.id,
      url: page.url,
      public: await publicPage(page.id),
      title: page.title ?? null,
      surveyedAt: page.createdAt,
      total: rows.length,
      outcomes,
      // `some`, not a count: the read view asks WHETHER a stop waits, and a page has at most one pending
      // row in practice. `pendingStopOf` THROWS on a malformed stop rather than reading it as none, and
      // that throw is deliberately not caught here — a stop only the walk writes, written wrong, is a
      // defect this read must not hide behind a `false`.
      stopPending: rows.some((row) => pendingStopOf(row) !== null),
    });
  }
  return entries;
}

export async function listPagesHandler(): Promise<string> {
  return answer(() => pagesOf());
}
