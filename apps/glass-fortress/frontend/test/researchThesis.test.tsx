jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { fireEvent, screen } from '@testing-library/react';
import { ancestorsOf, gatedFetchUrls, renderResearchThesis, textNodes, type Locale } from './render';
import { requireSubjects } from './scan';
import { fullTranscript, thesisContextColleague, thesisContextFull, thesisContextOwed, thesisContextWithdrawn } from './fixtures/research/thesisContext';
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

  // AMENDED 2026-09-25 (declared; RULED by the researcher, R82 Entry 20): the mark reads „<handle> · התזה שלך”, its own
  // key — the scope switch's „שלי” beside a handle read as "my <handle>".
  it('WV-5 `mine` IS MARKED ON THE AUTHOR`S OWN THESIS, and a colleague`s carries no mark', async () => {
    const own = await renderResearchThesis(LOCALE);
    const byline = own.querySelector('[data-byline]');
    expect(byline?.textContent).toBe(`${thesisContextOwed.thesis.by.handle} · התזה שלך`);
    expect(byline?.querySelector('bdi')?.textContent).toBe(thesisContextOwed.thesis.by.handle);
    expect(byline?.textContent).not.toContain('שלי');

    const colleague = await renderResearchThesis(LOCALE, { context: thesisContextColleague });
    // THE FLOOR: the colleague's body really says `mine: false` — without it this case is satisfied by a
    // fixture that carries no author at all.
    expect(thesisContextColleague.thesis.by.mine).toBe(false);
    expect(colleague.querySelector('[data-mine]')).toBeNull();
    // The handle ALONE — no separator, no mark.
    expect(colleague.querySelector('[data-byline]')?.textContent).toBe('handle-b');
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

  it('WV-10 THE TRANSCRIPT`S DOOR CARRIES THE TURN COUNT, and IS a control now that the tab exists', async () => {
    const container = await renderResearchThesis(LOCALE);
    const door = container.querySelector('[data-open-transcript]');
    // THE FLOOR: the body really carries the seventeen kinds across twenty-seven turns, so the count is over
    // something. A door reading „תמליל · 0 תורות" would pass a case that only checked the line exists.
    expect(fullTranscript.length).toBe(27);
    expect(door?.getAttribute('data-open-transcript')).toBe('27');
    expect(door?.textContent).toBe('תמליל · 27 תורות');
    // THE INVERSION OF THIS CASE IS THE CHUNK. It asserted „no button, no anchor" while the pane had no tab;
    // the tab is declared now, so the moment §12 :456–:459 requires exists and the line is the door §11 :408
    // rules it to be. It is a BUTTON and not an anchor: the pane is not a URL.
    expect(door?.tagName).toBe('BUTTON');
  });

  it('WV-11 THE PAGE DECLARES THE TRANSCRIPT TAB, and the pane draws it as the default', async () => {
    const container = await renderResearchThesis(LOCALE, { withPane: true });
    const tab = container.querySelector('#pane-tab-transcript');
    // Not a silent zero: a page that declared no tab has not been read by this case at all.
    if (tab === null) throw new Error('the working view declared no transcript tab');
    expect(tab.textContent).toBe('תמליל');
    // THE DEFAULT FOR FREE — `RightPane.tsx` :116 falls back to `tabs.at(0)` with no stored selection.
    expect(tab.getAttribute('aria-selected')).toBe('true');

    // RE-AIMED 2026-09-22 (R73 chunk 2), AND STRENGTHENED. This line read `toEqual(['pane-tab-transcript'])`
    // — "ONE TAB THIS CHUNK" — which was true of chunk 7a and is false by design now: the centre's chips open
    // RECORDS, and a record opens as a pane tab (§18 as amended 2026-09-16), so the citations' tabs are
    // declared beside the transcript from ONE `DeclareTabs`. What the case held that still matters is that
    // the TRANSCRIPT IS FIRST, because `RightPane.tsx` :116's fallback to `tabs.at(0)` is what makes it the
    // default (§14 :486); that is asserted here explicitly rather than as a side effect of a length of one.
    //
    // AND IT ASSERTS MORE THAN THE OLD LINE: every tab after the first is a RECORD tab of a citation HEAD
    // actually carries, so a page that declared a tab for a record it does not cite — or five dead tabs whose
    // content does not exist — fails by naming them. The five remaining tabs of §14 :486 arrive with their
    // content, and this case is what holds that.
    const ids = [...container.querySelectorAll('[role="tab"]')].map((one) => one.id);
    expect(ids.at(0)).toBe('pane-tab-transcript');
    const cited = new Set((thesisContextOwed.head?.mentions ?? []).map((mention) => `pane-tab-record:${mention.kind}:${mention.name}`));
    expect(ids.slice(1)).toEqual([...cited]);
  });

  it('WV-12 THE TRANSCRIPT RENDERS EVERY TURN OF THE BODY, oldest first, under one heading per thread', async () => {
    const container = await renderResearchThesis(LOCALE, { withPane: true });
    const rows = [...container.querySelectorAll('[data-turn]')];
    expect(rows.length).toBe(fullTranscript.length);
    // ORDER IS THE BODY'S OWN (§11 :432, OLDEST FIRST) — asserted against the fixture's own sequence, never
    // against the answer, so a component that sorted would be caught rather than agreed with.
    expect(rows.map((row) => row.getAttribute('data-turn'))).toEqual(fullTranscript.map((turn) => turn.kind));
    // A HEADING OPENS WHERE THE THREAD CHANGES — the count is derived from the fixture, not from the render.
    const expectedHeadings = fullTranscript.filter((turn, index) => index === 0 || fullTranscript[index - 1]?.thread.id !== turn.thread.id);
    expect(container.querySelectorAll('[data-thread]').length).toBe(expectedHeadings.length);
    expect(expectedHeadings.length).toBeGreaterThan(1);
  });

  it('WV-13 THE CONTROL IS „לקפוץ להתחלה", because the pane opens at now (§11 :432)', async () => {
    const container = await renderResearchThesis(LOCALE, { withPane: true });
    const jump = container.querySelector('[data-jump-to-start]');
    expect(jump?.textContent).toBe('לקפוץ להתחלה');
    // THE SUPERSEDED WORD IS GONE FROM THE RENDER AND FROM THE CATALOGUE ALIKE — „לקפוץ לסוף" would be the
    // R68 ruling read backwards, and a reader already at now being offered a jump to it.
    expect(container.textContent).not.toContain('לקפוץ לסוף');
  });
  it('WV-14 THE END MARKER IS THE LAST ELEMENT, so opening at the end does not hide the jump control', async () => {
    const container = await renderResearchThesis(LOCALE, { withPane: true });
    const end = container.querySelector('[data-transcript-end]');
    const jump = container.querySelector('[data-jump-to-start]');
    if (end === null || jump === null) throw new Error('the transcript drew no end marker or no jump control');

    // WHAT THIS HOLDS, AND WHAT IT CANNOT. jsdom computes NO LAYOUT and defines no `scrollIntoView`, so no
    // case here can assert a scroll POSITION — the 55 px local / 56 px staging shortfall was measured in a
    // browser and the measurement is the evidence for it. What a case CAN hold is the mechanism: with
    // `block: 'end'` the marker's bottom is aligned to the container's, so everything BEFORE it in the flow
    // is on screen and anything after it is not. The control must therefore precede the marker.
    expect(end.compareDocumentPosition(jump) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();

    // And the marker really is last, not merely ahead of this one control — a third element appended after
    // it later would be hidden by exactly the same defect.
    expect(end.nextElementSibling).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// THE CENTRE — R73 chunk 2. docs/gf-ui-refactor-plan.md :739 (i)–(ii) and :1205–:1206, read off APPROVED
// BOARD ד2; docs/gf-thesis-flows.md A4 :1476 (the ONE citation shape, public and gated).
//
// WHAT THESE CASES CAN AND CANNOT HOLD. jsdom computes no layout and no pseudo-element, so nothing here
// asserts the tick's COLOUR or the tick line's hairline rail — both are CSS and both are browser
// measurements. What a case CAN hold is the DOM: which regions exist, which tone each tick carries as an
// attribute, and which tab a press selects. The seam is stated in the chunk's report, not implied here.
// ---------------------------------------------------------------------------
describe('the working view — the centre', () => {
  it('WV-C1 THE CENTRE DRAWS THE TICK LINE AND THE TEXT, in that order (plan :739 (i)–(ii); :1205–:1206)', async () => {
    const container = await renderResearchThesis(LOCALE, { context: thesisContextFull });
    const centre = container.querySelector('[data-region="centre"]');
    if (centre === null) throw new Error('the centre drew nothing');

    const line = centre.querySelector('[data-tick-line]');
    const text = centre.querySelector('[data-thesis-text]');
    if (line === null || text === null) throw new Error('the centre drew no tick line or no text');
    // THE ORDER IS THE BOARD'S: the line heads the text, never follows it.
    expect(line.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // THE DOMAIN ONCE, heading the line — HEAD cites two records of ONE page, so there is ONE line.
    expect([...centre.querySelectorAll('[data-tick-line]')]).toHaveLength(1);
    expect(line.textContent).toContain('example.gov.il');
  });

  it('WV-C2 EVERY CITATION IN THE TEXT IS A CHIP — a capture, a diff and a trajectory, each by its own face', async () => {
    const container = await renderResearchThesis(LOCALE, { context: thesisContextFull });
    const text = container.querySelector('[data-thesis-text]');
    if (text === null) throw new Error('the centre drew no text');
    const kinds = [...text.querySelectorAll('[data-chip]')].map((chip) => chip.getAttribute('data-chip-kind'));
    // Three tokens stand in HEAD's text and three chips render, each knowing which kind it is. A renderer
    // that drew one shape for all three would pass a count and fail here.
    expect(kinds).toEqual(['capture', 'diff', 'trajectory']);

    // THE STATUS DOT'S TONE, AND DELIBERATELY NOT ITS COLOUR (plan :1206, "one status dot"). `Tick.tsx` :82
    // renders a real `<span>` under `[data-tick-tone]`, so WHICH tone a tick wears is a DOM fact a case may
    // hold; that it is olive is CSS, which jsdom does not compute and no case here claims. The three differ
    // by construction — the capture is VERIFIED, the diff's verdict is `notEvaluable` and so carries no
    // colour rather than a fifth one (:14–:16), and the trajectory is current — so an instrument asserting
    // that a dot was DRAWN without asserting WHICH would pass over a renderer that painted them all alike.
    const tones = [...text.querySelectorAll('[data-tick]')].map((tick) => tick.getAttribute('data-tick-tone'));
    expect(tones).toEqual(['verified', 'neutral', 'verified']);
  });

  it('WV-C3 A CHIP PRESS OPENS THAT RECORD, never the transcript (RightPane.tsx :114–:116)', async () => {
    const container = await renderResearchThesis(LOCALE, { withPane: true, context: thesisContextFull });
    const text = container.querySelector('[data-thesis-text]');
    if (text === null) throw new Error('the centre drew no text');
    const chip = text.querySelector('[data-chip-kind="capture"] button');
    if (chip === null) throw new Error('the capture chip drew no control');

    fireEvent.click(chip);

    // THE ACCEPTANCE CRITERION OF THIS CHUNK. `useOpenRecord` selects `record:<kind>:<name>`; a page that
    // declares only the transcript sends that selection to a tab it does not have, and RightPane falls back
    // to `tabs.at(0)` — so the press would raise the layer and show the TRANSCRIPT. The reader would see a
    // date that "works" and opens the wrong thing, which is the R59 · F3 defect the dated tick was unified
    // to remove. Observed RED on the one-tab declaration before the lift landed.
    const selected = [...container.querySelectorAll('[role="tab"][aria-selected="true"]')].map((tab) => tab.textContent ?? '');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toContain('example.gov.il');
    expect(selected[0]).not.toContain('תמליל');
  });

  it('WV-C4 A THESIS THAT CITES NOTHING DRAWS NO TICK LINE, and still draws its text (TickLine.tsx :37)', async () => {
    const container = await renderResearchThesis(LOCALE, { context: thesisContextWithdrawn });
    // An empty rail would be a region asserting "no citations" in a shape that looks like a broken one.
    expect(container.querySelector('[data-tick-line]')).toBeNull();
    expect(container.querySelector('[data-thesis-text]')).not.toBeNull();
  });

  it('WV-C5 THE CENTRE DRAWS NO PUBLIC-ONLY REGION — the disclaimer, the appeals, the case, the history, the pages, VERIFY', async () => {
    const container = await renderResearchThesis(LOCALE, { context: thesisContextFull });
    // plan :739 names each and its reason; COMPLIANCE.md :92 names the PUBLIC pages, and a gated working
    // view is not one. A case that checked only the disclaimer would miss the other five.
    expect(container.querySelector('[data-region="centre"] [data-preface]')).toBeNull();
    expect(container.querySelector('[data-appeals]')).toBeNull();
    expect(container.querySelector('[data-the-case]')).toBeNull();
    expect(container.querySelector('[data-history]')).toBeNull();
    expect(container.querySelector('[data-the-pages]')).toBeNull();
    expect(container.querySelector('[data-verify]')).toBeNull();
    expect(container.textContent).not.toContain('אינו מהווה ייעוץ משפטי');
  });

  it('WV-C6 THE PUBLISHED TOGGLE AND THE DIFF ARE ABSENT — below the freeze line (plan :739 (iii))', async () => {
    const container = await renderResearchThesis(LOCALE, { context: thesisContextFull });
    // NOT BUILT, NOT STUBBED, AND NO DEAD CONTROL WHERE THEY WILL GO. The fixture's PUBLISHED version
    // differs from HEAD, so a renderer that drew the toggle would draw it here.
    expect(container.textContent).not.toContain('הגרסה שפורסמה');
    expect(container.textContent).not.toContain('מה שונה ביניהן');
    // And the centre draws HEAD's text, not PUBLISHED's.
    const text = container.querySelector('[data-thesis-text]');
    expect(text?.textContent).toContain('הגרסה השנייה');
    expect(text?.textContent).not.toContain('הגרסה הראשונה');
  });

  it('WV-C7 THE PARSER KEEPS THE RESOLVED FIELDS — the record, the verdict and the flag reach the pane', async () => {
    const container = await renderResearchThesis(LOCALE, { withPane: true, context: thesisContextFull });
    // The five fields the narrow reader used to drop are what a record tab is MADE of: without `record` a
    // tab cannot be labelled by page and date at all. The labels are therefore the evidence that the parse
    // is wide, read off the render rather than off the fixture literal.
    const labels = [...container.querySelectorAll('[role="tab"]')].map((tab) => (tab.textContent ?? '').trim());
    expect(labels.at(0)).toContain('תמליל');
    expect(labels.some((label) => label.includes('example.gov.il'))).toBe(true);
    // A DIFF's tab names the INTERVAL it spans, which only `record.before`/`record.after` can supply.
    expect(labels.some((label) => label.includes('–'))).toBe(true);
  });
});
