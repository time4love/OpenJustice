jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { screen } from '@testing-library/react';
import { ancestorsOf, gatedFetchUrls, renderResearchThesis, textNodes, type Locale } from './render';
import { requireSubjects } from './scan';
import { fullTranscript, thesisContextColleague, thesisContextFull, thesisContextOwed } from './fixtures/research/thesisContext';
import { thesisReviewsOwed } from './fixtures/research/reads';

// ---------------------------------------------------------------------------
// `/research/theses/[thesisId]` — THE WORKING VIEW, chunk 7a: the READ and the CENTRE.
// docs/gf-ui-flows.md §11 :395–:408, §14 :486; docs/gf-thesis-flows.md A4 :1476 (the thesis read), A4 :1523
// (the owed list), A2 :1268 (the claim is the heading); UI plan UI-8 :728–:743.
//
// THE REAL PAGE OVER THE REAL READER, with `global.fetch` answering by path — `renderResearchThesis` stages the
// shell AND the client body, so `page.tsx`'s own `<main>` and reading measure are inside every case here. A case
// that rendered the body alone would leave the shell outside the scan, which is the blind probe R67 measured.
//
// EVERY APPROVED STRING IS PINNED AS A LITERAL, never read from the catalogue: a case that reads the catalogue
// and compares the render to it drifts WITH the catalogue and holds only that they agree (R63's ruling).
// ---------------------------------------------------------------------------

const LOCALE: Locale = 'he';

/**
 * THE PAGE IS RENDERED OVER THE THESIS THE OWED LIST NAMES, by default — three of that list's four entries are
 * its own, so every case below is over a page with work on it rather than over an empty region.
 *
 * A thesis owing NOTHING is `thesisContextFull` itself (`thesis-one`, in no owed entry), which is what WV-8 and
 * WV-9 render: the two fixtures are the two halves of the same question.
 */
const OWED_THESIS = thesisContextOwed.thesis.thesisId;

describe('the working view — the read', () => {
  it('WV-1 ONE READ, GET: the thesis by its id — and NO second read of the owed list (A4 :1476; ui §10 :370)', async () => {
    // RE-AIMED 2026-09-22, NOT WEAKENED. This case held TWO reads because the page took one; the researcher's
    // ruling of that day moved `owed` and `reviews` onto `get_thesis_context` and DELETED the second read, so
    // the world the old assertion described no longer exists. It asserts MORE now, not less: ui §10 :369–:371's
    // list of what this page fetches is CLOSED, and a page that reads anything else fails by naming it.
    //
    // THE SECOND READ IS STILL OFFERED BY THE DOUBLE (`render.tsx` :799) — that is the trap. A page that kept
    // fetching it would be answered a perfectly good body and draw a page that looks right.
    await renderResearchThesis(LOCALE);
    // THE THESIS READ NAMES THE ID IN ITS PATH and carries no `scope` and no filter: `since` is the same
    // read's own parameter (§12 :464), and the routes fix the scope (`researchRoutes.ts` :26–:27).
    expect([...gatedFetchUrls()]).toEqual([`/api/research/theses/${OWED_THESIS}`]);
  });

  it('WV-2 A REFUSED THESIS IS THE NAMED STATE, never the public one-404', async () => {
    await renderResearchThesis(LOCALE, {
      answers: { [`/api/research/theses/${OWED_THESIS}`]: { status: 404, body: { error: 'no such thesis', code: 'NO_THESIS' } } },
    });
    // §7 :310–:313: a 404 inside the prefix says WHICH refusal it was, because the caller is a researcher and
    // working state is theirs to read. The sentence is the frozen `research.state.noThesis`.
    expect(screen.getByText('אין תזה כזו.')).toBeInTheDocument();
  });
});

describe('the working view — the context block', () => {
  it('WV-3 THE CLAIM IS THE PAGE`S ONE HEADING, verbatim — with the provision, the handle and the state beside it', async () => {
    const container = await renderResearchThesis(LOCALE);
    const headings = [...container.querySelectorAll('h1')];
    expect(headings.map((heading) => heading.textContent)).toEqual([thesisContextFull.head?.claim]);
    // A2 :1268 — the claim is the heading, whole. A page that truncated it would show a claim the researcher
    // did not write, and there is no short name to put there instead (§11 :395–:397, R60's ruling).
    expect(headings.at(0)?.getAttribute('dir')).toBe('auto');
    expect(screen.getByText('קוד נירנברג, סעיף 1')).toBeInTheDocument();
    expect(screen.getByText('handle-a')).toBeInTheDocument();
  });

  it('WV-4 THE STATE WORD IS CALLED, not derived — the union the read answers, in its approved words', async () => {
    const container = await renderResearchThesis(LOCALE);
    const state = container.querySelector('[data-thesis-state]');
    // The fixture's state is `PUBLISHED_BEHIND` with one version ahead (A4 :1476's union), and the page draws
    // the row's own component over it — never a word composed from `publishedVersionId` and a count.
    expect(state?.getAttribute('data-thesis-state')).toBe('PUBLISHED_BEHIND');
    expect(state?.textContent).toBe('מפורסם — גרסה אחת מאחור');
  });

  it('WV-5 `mine` IS MARKED ON THE AUTHOR`S OWN THESIS, and a colleague`s carries no mark', async () => {
    const own = await renderResearchThesis(LOCALE);
    expect(own.querySelector('[data-mine]')?.textContent).toBe('שלי');

    const colleague = await renderResearchThesis(LOCALE, { context: thesisContextColleague });
    // THE FLOOR: the colleague's body really says `mine: false` — without it this case is satisfied by a
    // fixture that carries no author at all.
    expect(thesisContextColleague.thesis.by.mine).toBe(false);
    expect(colleague.querySelector('[data-mine]')).toBeNull();
    expect(colleague.textContent).toContain('handle-b');
  });

  it('WV-6 THE THESIS ID HAS TWO HOMES: the URL and the COPY — and is in no text node', async () => {
    const container = await renderResearchThesis(LOCALE);
    const copy = container.querySelector('[data-copy-value]');
    expect(copy?.getAttribute('data-copy-value')).toBe(`thesis ${OWED_THESIS}`);
    // §4 :167–:176 — never an id as text. The id's two homes are a COPY control's value and VERIFY; the owed
    // entries' COMMANDS are read aloud and carry the id inside a COPY, which is one of those homes and not a
    // third. What this holds is that nothing OUTSIDE them says it.
    const outside = textNodes(container)
      .filter((node) => (node.textContent ?? '').includes(OWED_THESIS))
      .filter((node) => !ancestorsOf(node).some((element) => element.hasAttribute('data-copy-value')));
    expect(outside.map((node) => (node.textContent ?? '').trim())).toEqual([]);
  });
});

describe('the working view — what is owed, and the transcript`s door', () => {
  it('WV-7 WHAT IS OWED DRAWS THIS THESIS`S ENTRIES, each kind and each with its ONE command (§11 :402–:406)', async () => {
    // THE FLOOR, FIRST: the corpus-wide list really carries four entries naming TWO theses, and this page's
    // body carries the three that are ITS OWN — so "three rendered" is a measurement and not an empty list. The
    // narrowing is now the SERVER's (the read is per-thesis, A4 :1476) where it used to be the page's.
    const named = new Set(requireSubjects('the owed fixture`s theses', thesisReviewsOwed.reviews).map((review) => review.thesisId));
    expect(thesisReviewsOwed.reviews.length).toBe(5);
    expect(named.size).toBe(2);
    // AND THE PAGE IS RENDERED OVER ONE OF THEM: two fixture files written for two pages, pinned together
    // here, so a renamed id fails by name rather than by drawing an empty region that still looks right.
    expect(named.has(OWED_THESIS)).toBe(true);
    expect({ owed: thesisContextOwed.owed, entries: thesisContextOwed.reviews.length }).toEqual({ owed: 4, entries: 4 });

    const container = await renderResearchThesis(LOCALE);
    const entries = [...container.querySelectorAll('[data-owed-entry]')];
    // IN A3 :1408–:1410's KIND ORDER, which is what `reviewsOf` builds — never the LIST's oldest-first (A4
    // :1524), and the fixture is ordered that way for the same reason.
    expect(entries.map((entry) => entry.getAttribute('data-owed-entry'))).toEqual(['FLAGGED', 'STALE_TRAJECTORY', 'STALE_TRAJECTORY', 'UNARGUED']);
    // EACH CARRIES ITS ONE COMMAND TO PASTE (T6 :881–:882), in a COPY control — the region's one actionable
    // element, and ALL THREE KINDS are present, so the per-kind case below is over a page that draws each.
    expect(entries.map((entry) => entry.querySelectorAll('[data-copy-value]').length)).toEqual([1, 1, 1, 1]);
    // The heading is this page's own — „מה חייבים על התזה הזו", not the door's „מה אני חייב/ת".
    expect(screen.getByText('מה חייבים על התזה הזו')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // WHAT AN ENTRY ON THIS PAGE SHOWS, PER KIND — RULED 2026-09-22 (the researcher, R71 „approve c, rule the
  // record in”); ui §11 :404 and thesis A4 :1476 as amended the same day.
  //
  //   FLAGGED           the kind, the RECORD, the command — and NO date
  //   UNARGUED          those, and `פתוח מ־<date>`
  //   STALE_TRAJECTORY  the kind, the date, the command — and no record, which it has on no arm of REVIEWS
  //
  // FLAGGED CARRIES NO DATE BECAUSE COMPUTING ONE WOULD COST THE READS THIS STEP BOUGHT BACK: it is
  // `later(published, earliest)` over `decision.at` and `material.movedAt` (`thesisReviews.ts` :228), the
  // evidence-side rows this read never loads — and `publishedAt` alone is a LOWER BOUND, so a card drawn from
  // it would claim a flag had been open longer than it has. A false date on a forensic surface is worse than
  // none, and this pair of cases is what keeps one from appearing.
  // -------------------------------------------------------------------------
  it('WV-7b EACH KIND DRAWS WHAT ITS ARM CARRIES — UNARGUED and STALE their date, FLAGGED and UNARGUED their record', async () => {
    const container = await renderResearchThesis(LOCALE);
    const entryOfKind = (kind: string): Element => {
      const found = container.querySelector(`[data-owed-entry="${kind}"]`);
      if (found === null) throw new Error(`the owed strip drew no ${kind} entry`);
      return found;
    };
    // THE FLOOR, BY VALUE, BEFORE ANYTHING IS READ OFF THE PAGE: the body really pairs the three arms the way
    // the appendix names, so what follows measures the RENDERING and not a fixture that owes nothing.
    expect(
      thesisContextOwed.reviews.map((entry) => [entry.kind, entry.record === null ? 'no record' : 'record', entry.owedSince === null ? 'no date' : 'date']),
    ).toEqual([
      ['FLAGGED', 'record', 'no date'],
      ['STALE_TRAJECTORY', 'no record', 'date'],
      ['STALE_TRAJECTORY', 'no record', 'date'],
      ['UNARGUED', 'record', 'date'],
    ]);

    // THE DATED LINE, in the approved sentence, on the two arms that carry an instant — and NOT on FLAGGED.
    expect([...container.querySelectorAll('[data-owed-since]')].map((line) => line.textContent)).toEqual([
      'פתוח מ־11.2.2026',
      'פתוח מ־14.2.2026',
      'פתוח מ־1.2.2026',
    ]);
    expect(entryOfKind('FLAGGED').querySelector('[data-owed-since]')).toBeNull();
    expect(entryOfKind('UNARGUED').querySelector('[data-owed-since]')?.textContent).toBe('פתוח מ־1.2.2026');
    expect(entryOfKind('STALE_TRAJECTORY').querySelector('[data-owed-since]')?.textContent).toBe('פתוח מ־11.2.2026');

    // THE RECORD, as evidence A1 names it and in the words the record pages already use — on FLAGGED and on
    // UNARGUED, and on neither trajectory.
    expect([...container.querySelectorAll('[data-record-name]')].map((line) => line.textContent)).toEqual([
      'צילום של העמוד מ־23.12.2021',
      'צילום של העמוד מ־23.12.2021',
    ]);
    expect(entryOfKind('FLAGGED').querySelector('[data-record-name]')?.textContent).toBe('צילום של העמוד מ־23.12.2021');
    expect(entryOfKind('STALE_TRAJECTORY').querySelector('[data-record-name]')).toBeNull();

    // AND THE FACTS THAT ARE ON `E` ITSELF: the flag's reasons in their approved sentences, the trajectory's
    // standing as the mark the thesis page draws.
    expect([...container.querySelectorAll('[data-flag-reason]')].map((row) => row.getAttribute('data-flag-reason'))).toEqual([
      'NOT_CITATION_CURRENT',
      'AWAITING_DERIVATION',
    ]);
    expect([...container.querySelectorAll('[data-currency]')].map((mark) => mark.getAttribute('data-currency'))).toEqual([
      'RECOMPUTED_DISAGREES',
      'NOT_FOLLOWED_BY_LATEST',
    ]);
  });

  it('WV-7c THE NEGATIVE HALF — no MATERIAL on any arm, and no author line: this page is ONE thesis and pays no evidence read', async () => {
    const container = await renderResearchThesis(LOCALE);
    // THE FLOOR: the page really drew every kind, so these absences are about rows that exist.
    expect(container.querySelectorAll('[data-owed-entry]').length).toBe(4);
    // `material` IS `/research`'S (A4 :1523) AND STAYS THERE. The chunks „old beside new" and the cited claim's
    // own words are what `list_thesis_reviews` pays `movedFrom`, `recordRowOf` and `latestDecisionOf` for, per
    // entry; ui §11 :404 sends a reader who wants them to the CITATION SHEET. A later chunk that quietly added
    // them here would be adding those reads back, and this is what catches it.
    expect(container.querySelectorAll('[data-owed-chunk]').length).toBe(0);
    expect(container.querySelectorAll('[data-cited-claim]').length).toBe(0);
    // AND NO AUTHOR LINE: `author` and `mine` are :1523's because that envelope spans theses. This one is one
    // thesis, whose handle the context block above already draws.
    expect(container.querySelectorAll('[data-owed-by-author]').length).toBe(0);
  });

  it('WV-8 NOTHING OWED IS A LINE SAYING SO, never a blank region (`{ owed: 0, reviews: [] }` is an answer)', async () => {
    // THE FLOOR: the body really says nothing is owed, so the line below is drawn over that answer and not over
    // a body that failed to parse.
    expect({ owed: thesisContextFull.owed, entries: thesisContextFull.reviews.length }).toEqual({ owed: 0, entries: 0 });
    const container = await renderResearchThesis(LOCALE, { context: thesisContextFull });
    // A4 :1525 — an empty list is an answer. The strip decides emptiness from the ROWS IT DRAWS (round 2; it
    // read a count until then, and the count was the whole corpus's).
    expect(container.querySelector('[data-owed-empty]')?.textContent).toBe('אין כרגע מה שחייבים.');
    expect(container.querySelectorAll('[data-owed-entry]').length).toBe(0);
  });

  it('WV-9 THE ENTRIES ARE THE BODY`S OWN — the corpus-wide list is OFFERED and never read (A4 :1476; ui §10 :370)', async () => {
    // RE-AIMED 2026-09-22, NOT WEAKENED. The property this case held — "the list is filtered, not the read" —
    // was the page KEEPING the entries of a corpus-wide body, and the researcher's ruling deleted that read.
    // What replaces it is stronger: the double still answers `/api/research/reviews` with FOUR entries, THREE of
    // them this very thesis's, and a page that read it would draw a region that looks exactly right. Only the
    // absence of the fetch tells the two apart.
    const owedElsewhere = thesisReviewsOwed.reviews.filter((review) => review.thesisId === OWED_THESIS).length;
    expect({ offered: thesisReviewsOwed.reviews.length, ofThisThesis: owedElsewhere }).toEqual({ offered: 5, ofThisThesis: 4 });

    const container = await renderResearchThesis(LOCALE, { context: thesisContextFull });
    expect([...gatedFetchUrls()]).not.toContain('/api/research/reviews');
    // `thesis-one`'s own body owes nothing, so the region is the line — while the offered list says otherwise.
    expect(container.querySelectorAll('[data-owed-entry]').length).toBe(0);
    expect(container.querySelector('[data-owed-empty]')).not.toBeNull();
  });

  it('WV-10 THE TRANSCRIPT`S DOOR CARRIES THE TURN COUNT, and is not a control until the pane exists', async () => {
    const container = await renderResearchThesis(LOCALE);
    const door = container.querySelector('[data-open-transcript]');
    // THE FLOOR: the body really carries the seventeen kinds across twenty-seven turns, so the count is over
    // something. A door reading „תמליל · 0 תורות" would pass a case that only checked the line exists.
    expect(fullTranscript.length).toBe(27);
    expect(door?.getAttribute('data-open-transcript')).toBe('27');
    expect(door?.textContent).toBe('תמליל · 27 תורות');
    // AN ACTIONABLE ELEMENT NEEDS A DEFINED MOMENT (§12 :456–:459). The pane it opens is declared in the next
    // chunk; until then the line states a fact and presses nothing — no button, no anchor.
    expect(door?.tagName).toBe('P');
    expect(door?.querySelector('button, a')).toBeNull();
  });
});
