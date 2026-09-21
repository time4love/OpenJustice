jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { screen } from '@testing-library/react';
import { ancestorsOf, gatedFetchUrls, renderResearchThesis, textNodes, type Locale } from './render';
import { requireSubjects } from './scan';
import { fullTranscript, thesisContextColleague, thesisContextFull, thesisContextOwed } from './fixtures/research/thesisContext';
import { thesisReviewsEmpty, thesisReviewsOwed } from './fixtures/research/reads';

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
  it('WV-1 TWO READS, BOTH GET: the thesis by its id, and the owed list — and no third', async () => {
    await renderResearchThesis(LOCALE);
    // THE THESIS READ NAMES THE ID IN ITS PATH and carries no `scope` and no filter: `since` is the same
    // read's own parameter (§12 :464), and the routes fix the scope (`researchRoutes.ts` :26–:27).
    expect([...gatedFetchUrls()].sort()).toEqual(['/api/research/reviews', `/api/research/theses/${OWED_THESIS}`]);
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
  it('WV-7 WHAT IS OWED KEEPS THIS THESIS`S ENTRIES, and no other thesis`s', async () => {
    // THE FLOOR, FIRST: the owed list really carries four entries naming TWO theses — so "three rendered" is a
    // measurement of the keeping and not of an empty list. A case asserting a number does not grow is
    // satisfied by zero.
    const named = new Set(requireSubjects('the owed fixture`s theses', thesisReviewsOwed.reviews).map((review) => review.thesisId));
    expect(thesisReviewsOwed.reviews.length).toBe(4);
    expect(named.size).toBe(2);
    // AND THE PAGE IS RENDERED OVER ONE OF THEM: two fixture files written for two pages, pinned together
    // here, so a renamed id fails by name rather than by drawing an empty region that still looks right.
    expect(named.has(OWED_THESIS)).toBe(true);

    const container = await renderResearchThesis(LOCALE);
    const entries = [...container.querySelectorAll('[data-owed-entry]')];
    expect(entries.map((entry) => entry.getAttribute('data-owed-entry'))).toEqual(['FLAGGED', 'STALE_TRAJECTORY', 'STALE_TRAJECTORY']);
    // The heading is this page's own — „מה חייבים על התזה הזו", not the door's „מה אני חייב/ת".
    expect(screen.getByText('מה חייבים על התזה הזו')).toBeInTheDocument();
  });

  it('WV-8 NOTHING OWED IS A LINE SAYING SO, never a blank region', async () => {
    const container = await renderResearchThesis(LOCALE, {
      context: thesisContextFull,
      answers: { '/api/research/reviews': { status: 200, body: thesisReviewsEmpty } },
    });
    // A4 :1525 — an empty list is an answer. The strip decides emptiness from the ROWS IT DRAWS (round 2; it
    // read a count until then, and the count was the whole corpus's), so a corpus with work owed elsewhere
    // still draws the line on a thesis that owes nothing. WV-9 is the other half: the same page over the FULL
    // owed list, where the keeping — not an empty body — is what leaves the region with no rows.
    expect(container.querySelector('[data-owed-empty]')?.textContent).toBe('אין כרגע מה שחייבים.');
    expect(container.querySelectorAll('[data-owed-entry]').length).toBe(0);
  });

  it('WV-9 THE OWED LIST IS FILTERED, NOT THE READ — a corpus owing work elsewhere draws no entry here', async () => {
    const container = await renderResearchThesis(LOCALE, { context: thesisContextFull });
    // `thesis-one` appears in no owed entry, and the whole list was read: the page keeps, it does not re-read.
    expect([...gatedFetchUrls()]).toContain('/api/research/reviews');
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
