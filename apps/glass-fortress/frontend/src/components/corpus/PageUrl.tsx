import { displayUrl } from '@/lib/format';

// ---------------------------------------------------------------------------
// THE PAGE'S URL — ONE ELEMENT, docs/gf-ui-flows.md §4 :167–:178 ("a page is shown by its domain and path,
// never the `trackedUrlId`"), RULED 2026-09-21.
//
// IT EXISTS BECAUSE IT WAS SPELLED FOUR TIMES. `Stream.tsx`, `Claims.tsx`, `PageCard.tsx` and `PagesList.tsx`
// each held their own `<bdi dir="ltr" className="break-all …">{displayUrl(url)}</bdi>` — one rule with four
// implementations, which is this repository's dominant defect shape — and §24 :763's header would have been a
// fifth. It is built FIRST so the header is its fifth CALLER instead.
//
// WHAT IT OWNS, and each of the four is a property a call site could have got wrong on its own:
//   · `displayUrl` — the scheme and the query are noise, and the `trackedUrlId` is never text (§4 :167);
//   · `dir="ltr"` — a url is LTR inside a Hebrew document;
//   · the `<bdi>` — an UNISOLATED url reorders the punctuation around it at the boundary, which is what
//     `bidi-isolated` exists to catch;
//   · `break-all` — a url is one unbreakable word and overflows a 375px column without it.
//
// `data-page-url` IS EMITTED HERE AND NOWHERE ELSE, and `one-stream-two-doors` holds exactly that: a fifth
// spelling anywhere under `src/` reddens the suite. The three attributes this replaces — `data-page-label`,
// `data-page-card-url` and nothing at all on the pages list — were three names for one thing; WHICH url a
// reader is looking at is said by the ancestor that contains it (`[data-page-card]`, `[data-claim-row]`), not
// by a third name for the element itself.
//
// TWO WEIGHTS, AND NO THIRD, because only two occur. `subject` is the page the thing is ABOUT — the page
// card's heading, a row of the pages list, and §25 :790's claims header; `aside` is the page a row BELONGS
// to, which is the stream's row label and is drawn only where §24 :763 allows it. They are named by the ROLE
// and not by the size, because the size is what the role is worth and a call site choosing „text-sm" would be
// choosing an appearance rather than stating a fact.
// ---------------------------------------------------------------------------

/** What this url IS to the element that draws it — the subject of the view, or the page a row belongs to. */
export type PageUrlWeight = 'subject' | 'aside';

const WEIGHTS: Record<PageUrlWeight, string> = {
  subject: 'text-sm text-ink',
  aside: 'text-xs text-ink-muted',
};

/**
 * THE UNDERLINE IS THE ONE CALL SITE'S, AND IT IS A LINK'S PROPERTY rather than a third weight. The pages
 * list draws each row's url INSIDE a `Link`, so the underline says "this is the tap"; the page card's url at
 * the same weight is a heading and is not tappable. One boolean with one caller states that difference; a
 * third weight would have folded "is a link" into "how much this url is worth".
 */
export function PageUrl({ url, weight, underline }: { url: string; weight: PageUrlWeight; underline?: boolean }) {
  return (
    <bdi dir="ltr" data-page-url className={`break-all ${WEIGHTS[weight]}${underline === true ? ' underline' : ''}`}>
      {displayUrl(url)}
    </bdi>
  );
}
