import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { readPublic } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { parseThesisList } from '@/lib/thesisBody';
import { ProvisionName } from '@/components/thesis/ProvisionName';
import type { ThesisListRow } from '@/types/thesis';

// ---------------------------------------------------------------------------
// `/theses` — THE PUBLIC THESIS LIST. docs/gf-ui-flows.md §3 :145 (UN-RETIRED 2026-09-18, the researcher),
// §32 :934 (`תזות` leads here), §33 :959–:969 (why the list left the door), A1 :1119; UI plan UI-7 :600–:610.
//
// IT WAS RETIRED ON A GROUND THAT STOPPED HOLDING. The ground was "`/` carries the published list" — and the
// researcher has since ruled that `/` is the HOME, shows the LATEST and not all, and is redesigned LAST. A home
// that shows a selection is not a list: the built door has always drawn `theses.slice(1, 5)`, so the design and
// the build disagreed while the sidebar's `תזות` led nowhere at all. §33 :969: "One page cannot be both the
// welcome and the catalogue."
//
// NO SEARCH, NO FILTER, NO COUNT — §33 :964–:966's own reasoning, which MOVED HERE WITH THE LIST: the published
// theses are few by design and each is a commitment. What was retired was the door doubling as the index, not
// the fewness.
//
// AND NO DISCLAIMER (the researcher, 2026-09-19). COMPLIANCE.md :92 names every THESIS page and every
// `/call/[thesisId]` page; a list of theses is neither, and its rows carry no claim's argument — only the claim,
// which is the heading of the page that does carry it.
//
// THE ROWS ARE 558-CHARACTER CLAIMS, and that is issue #510, not this page's to solve. No truncation, no clamp
// and no invented short title: "there is no short title for the thesis. It shows in the left sidebar and it
// shows on the thesis page. We are not solving that now" (the researcher, 2026-09-18). This is its fourth place.
//
// A SERVER COMPONENT reading ONE public route (§8), like `/corpus`; `page-column` is the shell's own reading
// measure and is CALLED rather than re-spelled — a hand-rolled `max-w-prose` is 65ch, which resolves to 422.5px
// and is wider than a 375px phone. That was measured on the corpus page and is not repeated here.
// ---------------------------------------------------------------------------

interface PageParams {
  params: Promise<{ locale: string }>;
}

/**
 * NEWEST FIRST, over a field that can be NULL — and the order must still be TOTAL.
 *
 * `publishedEntries()` filters on `publishedVersionId: { not: null }` and selects `publishedAt` separately, so
 * the route CAN answer a published thesis with no date. "Newest first" has no defined answer over a null, and
 * the researcher ruled it on 2026-09-19: such a row is **never dropped** — that would hide a published thesis —
 * and **never sorted to the head**, which would put an anomaly at the top of a public catalogue. It sorts LAST.
 *
 * `thesisId` is the tie-break so two theses published in the same instant cannot swap places between renders;
 * an order that is merely mostly-stable reads as a page that shuffles itself.
 *
 * The dates are ISO instants, so they compare as strings exactly as they compare as instants — and `<` is used
 * rather than `localeCompare`, whose collation is locale-sensitive and has no business ordering a timestamp.
 */
function newestFirst(rows: readonly ThesisListRow[]): ThesisListRow[] {
  const byId = (a: ThesisListRow, b: ThesisListRow): number => (a.thesisId < b.thesisId ? -1 : a.thesisId > b.thesisId ? 1 : 0);
  return [...rows].sort((a, b) => {
    if (a.publishedAt === null || b.publishedAt === null) {
      if (a.publishedAt === b.publishedAt) return byId(a, b);
      return a.publishedAt === null ? 1 : -1;
    }
    if (a.publishedAt === b.publishedAt) return byId(a, b);
    return a.publishedAt < b.publishedAt ? 1 : -1;
  });
}

/** THE ONE READ (§8): `GET /api/thesis`, `list_theses`' anonymous answer (A4 :1427), narrowed at the boundary. */
async function publishedTheses(): Promise<ThesisListRow[]> {
  const answer = await readPublic('/api/thesis', parseThesisList);
  // A list route has no 404 to answer — the one 404 belongs to a NAMED thesis (§6's table). If it ever answers
  // one, an empty catalogue is the honest reading: the page then says so in a sentence, which is a state, and
  // never an error a reader cannot act on.
  return answer.status === 404 ? [] : newestFirst(answer.body);
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'theses.list' });
  return { title: t('title') };
}

export default async function ThesesPage({ params }: PageParams) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'theses.list' });
  const theses = await publishedTheses();
  return (
    <main className="page-column flex flex-col gap-3 py-4">
      <h1 className="text-lg text-ink">{t('title')}</h1>
      {theses.length === 0 ? (
        <p data-theses-empty className="text-sm text-ink-muted">
          {t('empty')}
        </p>
      ) : (
        <ul data-theses-list className="flex flex-col gap-2">
          {theses.map((thesis) => (
            <li key={thesis.thesisId} data-thesis-row className="rounded border border-line bg-surface p-3">
              <Link href={`/theses/${thesis.thesisId}`} className="flex flex-col gap-1">
                {/* THE CLAIM IS THE ROW (§3 :145; A2 :1268 "the claim is the heading"), whole and `dir="auto"`. */}
                <span data-claim dir="auto" className="text-sm text-ink underline">
                  {thesis.claim}
                </span>
                {/* The provision through the ONE mechanism — `provision-is-a-lookup`, landed 2026-09-19: the
                    CODE goes in and the catalogue's word for it comes out, in the reader's own language. */}
                <ProvisionName provision={thesis.provision} />
                <span className="text-xs text-ink-muted">
                  {/* The handle is DATA and is isolated; the date is LTR inside a Hebrew line. A row with no
                      date draws its handle and NO date line — `Byline.tsx` :22's pattern, which the thesis
                      page has used since UI-5, rather than a second answer to the same question. */}
                  <bdi>{thesis.author}</bdi>
                  {thesis.publishedAt === null ? null : (
                    <>
                      {' · '}
                      <bdi dir="ltr">{t('date', { date: formatDate(thesis.publishedAt, locale) })}</bdi>
                    </>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
