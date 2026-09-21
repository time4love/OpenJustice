// THE READ VIEW NAVIGATES BY THE ROUTER, AND ONLY FOR THE 401. `render.tsx`' navigation double refuses every
// router method, because the CHROME navigates by anchors (UI-4). §13 :474 makes the 401 an ACT — the reader is
// sent to `/login?returnTo=` and brought back — so this file doubles `@/i18n/navigation`'s `useRouter` to
// RECORD instead, and leaves the chrome's double alone. `Link` and everything else stay the real module.
const mockPushed: string[] = [];
jest.mock('../src/i18n/navigation', () => {
  const real = jest.requireActual<typeof import('../src/i18n/navigation')>('../src/i18n/navigation');
  return { ...real, useRouter: () => ({ push: (href: string) => mockPushed.push(href) }) };
});

import { act, fireEvent, screen } from '@testing-library/react';
import { ResearchDashboard } from '@/components/research/ResearchDashboard';
import { SCOPE_KEY } from '@/components/research/ScopeSwitch';
import { globalFetchDouble, renderWithIntl, textNodes, type Locale } from './render';
import { requireSubjects } from './scan';
import { articleRules, evidenceReviews, framings, pages, thesesList, thesisReviewsOwed } from './fixtures/research/reads';

// ---------------------------------------------------------------------------
// `/research` — THE FOUR REGIONS. docs/gf-ui-flows.md §29 :887–:909, §13 :469–:480; UI plan UI-8 :716–:727.
//
// THE REAL COMPONENTS OVER THE REAL READER, with `global.fetch` answering by path — the `publicRead` shape
// (UI-5) rather than a double of `researchFetch`, which would hold the double.
//
// EVERY APPROVED STRING IS PINNED AS A LITERAL, never read from the catalogue: a case that reads the catalogue
// and compares the render to it drifts WITH the catalogue and holds only that they agree (R63's ruling).
// ---------------------------------------------------------------------------

const LOCALE: Locale = 'he';

const PATHS = {
  reviews: '/api/research/reviews',
  evidence: '/api/research/evidence-reviews',
  theses: '/api/research/theses',
  framings: '/api/research/framings',
  pages: '/api/research/pages',
} as const;

const WHOLE = {
  [PATHS.reviews]: { status: 200, body: thesisReviewsOwed },
  [PATHS.evidence]: { status: 200, body: evidenceReviews },
  [PATHS.theses]: { status: 200, body: thesesList },
  [PATHS.framings]: { status: 200, body: framings },
  [PATHS.pages]: { status: 200, body: pages },
};

const refusing = (status: number, body: unknown) => Object.fromEntries(Object.values(PATHS).map((path) => [path, { status, body }]));

function signIn(): void {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify({ accessToken: 'token-one', refreshToken: null, expiresAt: null }));
}

const SESSION_KEY = 'gf_access_token';

/** Render the four regions and let every read settle — the page is client-rendered, so its reads are effects. */
async function dashboard(answers: Record<string, { status: number; body?: unknown }>) {
  const fetching = globalFetchDouble(answers);
  const rendered = renderWithIntl(<ResearchDashboard locale={LOCALE} />, { locale: LOCALE });
  await act(async () => {
    await Promise.resolve();
  });
  return { ...rendered, fetching };
}

beforeEach(() => {
  mockPushed.length = 0;
  window.localStorage.clear();
  signIn();
});

describe('/research — the four regions', () => {
  it('RD-1 THE FOUR REGIONS RENDER, IN §29`S ORDER, from five reads and no more', async () => {
    const { container, fetching } = await dashboard(WHOLE);
    try {
      const regions = [...container.querySelectorAll('[data-region]')].map((node) => node.getAttribute('data-region'));
      expect(regions).toEqual(['owed', 'theses', 'framings', 'corpus']);
      // FIVE READS, ONE PER REGION'S SOURCE — and no sixth: §12 :464 forbids a second read for a filter, and
      // §29 :903 makes region 4 `list_pages`' own answer rather than a per-page `get_article_rules`.
      expect([...fetching.calls].map((call) => call.url).sort()).toEqual([...Object.values(PATHS)].sort());
      expect(fetching.calls.every((call) => call.init?.method === 'GET')).toBe(true);
    } finally {
      fetching.restore();
    }
  });

  it('RD-2 THE APPROVED WORDS ARE THE PAGE`S — pinned as LITERALS, never read from the catalogue', async () => {
    const { container, fetching } = await dashboard(WHOLE);
    try {
      const text = container.textContent ?? '';
      for (const approved of requireSubjects('the approved strings this page draws', [
        'מה אני חייב/ת',
        'ציטוט מסומן',
        'מסלול שהמעבר החדש אינו מסכים איתו',
        'תוכן שצוטט וזז',
        'תזות',
        'מסגורים',
        // BOARD ב, 2026-09-21: „הארכיון במספרים" named a list of numbers region 4 no longer draws, and the
        // key left both catalogues in the same change. The door's own title stands in its place here.
        'הארכיון של החוקרים',
        'היקף',
        'שלי',
        'של כולם',
        'מפורסם — גרסה אחת מאחור',
        'הפרסום בוטל ב־9.3.2026',
        'מסגור מחובר',
        'בלי מסגור',
        'הפקודה להדבקה בשיחה',
        'לא ניתן להעריך כרגע',
        'הרשומה ממתינה לגזירה — אין עדיין גרסת תוכן לשפוט לפיה',
      ])) {
        expect(text).toContain(approved);
      }

      // AT `mine` THE COLLEAGUE'S ROWS ARE NOT DRAWN, so their words are not on the page — which is the
      // switch's whole meaning, and the reason these two are pinned HERE rather than above: a case that
      // expected them at `mine` would be asserting that the filter does nothing.
      expect(text).not.toContain('ציטוט שלא נטען בדיון');
      expect(text).not.toContain('טיוטה בלבד');

      const all = container.querySelector('[data-scope-option="all"]');
      if (all === null) throw new Error('the page drew no scope switch');
      await act(async () => {
        fireEvent.click(all);
        await Promise.resolve();
      });
      const widened = container.textContent ?? '';
      expect(widened).toContain('ציטוט שלא נטען בדיון');
      expect(widened).toContain('טיוטה בלבד');
    } finally {
      fetching.restore();
    }
  });

  it('RD-3 A THESIS ROW`S TEXT-NODE SET IS PINNED — the whole row, in order, and nothing else', async () => {
    const { container, fetching } = await dashboard(WHOLE);
    try {
      const row = container.querySelector('[data-thesis-row="cmu0aaaa00011112222333344"]');
      if (row === null) throw new Error('the page drew no row for thesis-one');
      // THE SET, NOT A NAME. R65's E12: a word under another attribute name passed a NAME-based absence, so
      // what is held is every text node the row puts in front of a reader, in document order.
      expect(requireSubjects('the row`s text nodes', textNodes(row)).map((node) => node.textContent)).toEqual([
        'המשרד החזיק במידע ולא מסר אותו במועד',
        'קוד נירנברג, סעיף 1',
        'handle-a',
        'מפורסם — גרסה אחת מאחור',
        'ציטוט אחד שלא נטען',
        'פער פתוח אחד',
        'מסגור מחובר',
        'העמוד הציבורי',
      ]);
    } finally {
      fetching.restore();
    }
  });

  it('RD-3b EVERY OWED KIND DRAWS ITS MATERIAL — one pinned TEXT-NODE SET per kind, over all four entries', async () => {
    const { container, fetching } = await dashboard(WHOLE);
    try {
      const all = container.querySelector('[data-scope-option="all"]');
      if (all === null) throw new Error('the page drew no scope switch');
      await act(async () => {
        fireEvent.click(all);
        await Promise.resolve();
      });

      const setOf = (kind: string): (string | null)[] => {
        const entry = container.querySelector(`[data-owed-entry="${kind}"]`);
        if (entry === null) throw new Error(`the owed strip drew no ${kind} entry`);
        return requireSubjects(`${kind}'s text nodes`, textNodes(entry)).map((node) => node.textContent);
      };

      // THE SET, NOT A PRESENCE. Each of these is the whole of what a reader meets in that entry, in
      // document order: the kind, the thesis's CLAIM (the Q-G join, from the theses read this page already
      // made), the instant, the material that kind carries, and the command. A field dropped, a field added
      // or two fields swapped all fail here, which a `toContain` per field cannot see.
      expect(setOf('FLAGGED')).toEqual([
        'ציטוט מסומן',
        'המשרד החזיק במידע ולא מסר אותו במועד',
        'פתוח מ־10.2.2026',
        'צילום של העמוד מ־23.12.2021',
        'התוכן המצוטט השתנה ולא אושר מחדש',
        // THE THIRD REASON, frozen 2026-09-20 (Q-I) — the wire has carried it all along and the page drew
        // nothing for it until the word existed.
        'הרשומה ממתינה לגזירה',
        'הקטעים שאושרו',
        'המשפט כפי שאושר',
        'הקטעים כעת',
        'המשפט כפי שהוא כעת',
        'הפקודה להדבקה בשיחה',
        'add_thesis_version thesisId=cmu0aaaa00011112222333344',
        'הפקודה להדבקה בשיחה',
      ]);

      expect(setOf('STALE_TRAJECTORY')).toEqual([
        'מסלול שהמעבר החדש אינו מסכים איתו',
        'המשרד החזיק במידע ולא מסר אותו במועד',
        'פתוח מ־11.2.2026',
        // THE CITED CLAIM'S OWN WORDS, and the newest pass's standing as the mark the thesis page draws.
        'החיסון בטוח לחלוטין',
        'המעבר החדש ביותר אינו מסכים',
        'הפקודה להדבקה בשיחה',
        'get_claim_trajectories url=https://example.gov/one/',
        'הפקודה להדבקה בשיחה',
      ]);

      // THE FOURTH CURRENCY WORD READS STALE TOO — A3 :1386–:1388 puts RECOMPUTED_DISAGREES and
      // NOT_FOLLOWED_BY_LATEST in ONE class, and the appendix decides what the mark says, not the state's
      // name. `setOf` takes the FIRST entry of a kind, so this one is read by its own marker.
      const second = container.querySelector('[data-currency="NOT_FOLLOWED_BY_LATEST"]')?.closest('[data-owed-entry]');
      if (second === null || second === undefined) throw new Error('the owed strip drew no NOT_FOLLOWED_BY_LATEST entry');
      expect(requireSubjects('the second stale entry`s text nodes', textNodes(second)).map((node) => node.textContent)).toEqual([
        'מסלול שהמעבר החדש אינו מסכים איתו',
        'המשרד החזיק במידע ולא מסר אותו במועד',
        'פתוח מ־14.2.2026',
        'הנוהל עודכן בלי הודעה',
        'המעבר החדש ביותר אינו מסכים',
        'הפקודה להדבקה בשיחה',
        'get_claim_trajectories url=https://example.gov/two/',
        'הפקודה להדבקה בשיחה',
      ]);

      expect(setOf('UNARGUED')).toEqual([
        'ציטוט שלא נטען בדיון',
        'התוכנית הורחבה לאחר האות',
        'פתוח מ־12.2.2026',
        'הפקודה היא של handle-b, מחבר/ת התזה',
        'שינוי בעמוד בין 1.3.2022 ל־2.5.2022',
        'הפקודה להדבקה בשיחה',
        'open_debate thesisId=cmu0bbbb00011112222333344',
        'הפקודה להדבקה בשיחה',
      ]);

      // THE CORPUS-WIDE ENTRY: no claim — it is owed on a RECORD and not on one thesis — the record named,
      // all four chunk lists, and TWO commands. The citing theses are deliberately absent until chunk 6
      // lands the anchors that make them reachable.
      expect(setOf('CONTENT_MOVED')).toEqual([
        'תוכן שצוטט וזז',
        'פתוח מ־13.2.2026',
        'שינוי בעמוד בין 1.3.2022 ל־2.5.2022',
        'הקטעים שאושרו',
        'הקטע שאושר',
        'הקטעים כעת',
        'הקטע כעת',
        'נכנסו',
        'הקטע כעת',
        'יצאו',
        'הקטע שאושר',
        'הפקודה להדבקה בשיחה',
        'review_evidence fileHash=1111aaaa',
        'הפקודה להדבקה בשיחה',
        'resolve_record name=record-one',
        'הפקודה להדבקה בשיחה',
      ]);
    } finally {
      fetching.restore();
    }
  });

  it('RD-3c THE FLAG REASON TABLE COVERS ALL THREE OF THE WIRE`S REASONS — no reason renders as nothing', async () => {
    // IT WAS A TRIPWIRE OVER TWO AND IT IS NOW A CLOSURE OVER THREE. The third reason had no approved word
    // until 2026-09-20 (Q-I) and the page drew nothing for it; with the word frozen the table is exhaustive,
    // and this case is what keeps it so — a reason added to the wire without a word fails here by name.
    const { FLAG_REASONS } = await import('@/types/research');
    const { FLAG_REASON_KEYS } = await import('@/components/research/OwedStrip');
    expect([...FLAG_REASONS]).toEqual(['WITHDRAWN', 'NOT_CITATION_CURRENT', 'AWAITING_DERIVATION']);
    expect(Object.keys(FLAG_REASON_KEYS)).toEqual(['WITHDRAWN', 'NOT_CITATION_CURRENT', 'AWAITING_DERIVATION']);
  });

  it('RD-4 THE SWITCH IS A VIEW OVER `mine`, NOT A SECOND READ', async () => {
    const { container, fetching } = await dashboard(WHOLE);
    try {
      // It opens on `mine` (§7.1 :328): the two rows whose `mine` is true.
      expect([...container.querySelectorAll('[data-thesis-row]')].map((row) => row.getAttribute('data-thesis-row'))).toEqual([
        'cmu0aaaa00011112222333344',
        'cmu0cccc00011112222333344',
      ]);
      const readsBefore = fetching.calls.length;

      const all = container.querySelector('[data-scope-option="all"]');
      if (all === null) throw new Error('the page drew no scope switch');
      await act(async () => {
        fireEvent.click(all);
        await Promise.resolve();
      });

      expect([...container.querySelectorAll('[data-thesis-row]')].map((row) => row.getAttribute('data-thesis-row'))).toEqual([
        'cmu0aaaa00011112222333344',
        'cmu0bbbb00011112222333344',
        'cmu0cccc00011112222333344',
        'cmu0dddd00011112222333344',
      ]);
      // NOT A DERIVATION AND NOT A FETCH: the count does not move, because `mine` is a field the body carries.
      expect(fetching.calls.length).toBe(readsBefore);
      expect(window.localStorage.getItem(SCOPE_KEY)).toBe('"all"');
    } finally {
      fetching.restore();
    }
  });

  it('RD-5 AN OWED ENTRY ON A COLLEAGUE`S THESIS IS LABELLED AS THE AUTHOR`S, and each command has ONE copy control', async () => {
    const { container, fetching } = await dashboard(WHOLE);
    try {
      const all = container.querySelector('[data-scope-option="all"]');
      if (all === null) throw new Error('the page drew no scope switch');
      await act(async () => {
        fireEvent.click(all);
        await Promise.resolve();
      });

      const unargued = container.querySelector('[data-owed-entry="UNARGUED"]');
      if (unargued === null) throw new Error('the owed strip drew no UNARGUED entry');
      expect(unargued.querySelector('[data-owed-by-author]')?.textContent).toBe('הפקודה היא של handle-b, מחבר/ת התזה');

      // §29 :892–:894: ONE command on a thesis review, "the commands" on the corpus-wide entry — so the
      // evidence review draws as many controls as `commands` holds, and the thesis review draws one.
      const moved = container.querySelector('[data-owed-entry="CONTENT_MOVED"]');
      if (moved === null) throw new Error('the owed strip drew no CONTENT_MOVED entry');
      expect(moved.querySelectorAll('[data-copy-value]').length).toBe(evidenceReviews.reviews[0].commands.length);
      expect(unargued.querySelectorAll('[data-copy-value]').length).toBe(1);
    } finally {
      fetching.restore();
    }
  });

  it('RD-6 REGION 4 IS ONE DOOR CARD — its title is the link, and its summary line is the four approved plurals', async () => {
    const { container, fetching } = await dashboard(WHOLE);
    try {
      const card = container.querySelector('[data-corpus-card]');
      if (card === null) throw new Error('region 4 drew no door card');
      // THE TEXT-NODE SET, BY VALUE (R65's M4): a number changed, a word added or a separator lost reddens
      // here, where a case reading one attribute at a time would not see any of them.
      const nodes = textNodes(card)
        .map((node) => (node.textContent ?? '').replace(/\s+/gu, ' ').trim())
        .filter((text) => text !== '');
      expect(nodes).toEqual([
        'הארכיון של החוקרים',
        '3 דפים נסקרו',
        '·',
        '26 צילומים נרכשו',
        '·',
        '4 לא נשלפו',
        '·',
        'עצירה אחת ממתינה',
      ]);
      // THE TITLE IS THE DOOR (Q-H) and the card holds exactly one anchor — the page that landed beside it.
      expect([...card.querySelectorAll('a')].map((anchor) => anchor.getAttribute('href'))).toEqual(['/he/research/corpus']);
      // THE PER-OUTCOME LIST LEFT `/research` for the page it describes; a breakdown on the door was seven
      // lines of arithmetic in front of one link.
      expect(container.querySelectorAll('[data-outcome]').length).toBe(0);
      // A PENDING STOP IS A NUMBER HERE AND NEVER THE MARKING LINK (MARKING :576–:578; §31 :925) — and the
      // URL is in the fixture, so the absence is over something.
      expect(articleRules.pendingStop?.markingUrl).toContain('article-rules');
      expect([...container.querySelectorAll('a')].map((anchor) => anchor.getAttribute('href') ?? '')).not.toContain(
        articleRules.pendingStop?.markingUrl,
      );
    } finally {
      fetching.restore();
    }
  });

  it('RD-11 A FRAMING WITH NO ROUND IS NOT A FRAMING THAT PRODUCED NO THESIS — board ב`s two arms, both pinned', async () => {
    const { container, fetching } = await dashboard(WHOLE);
    try {
      const rowFor = (id: string): Element => {
        const row = container.querySelector(`[data-framing-row="${id}"]`);
        if (row === null) throw new Error(`no framing row for ${id}`);
        return row;
      };
      expect({
        // `framing-4`: rounds 0, no thesis — it has not been WORKED ON, which „עדיין לא הוליד תזה" misstates.
        noRound: (rowFor('framing-4').querySelector('[data-framing-no-round]')?.textContent ?? '').trim(),
        noRoundAlsoSaysNoThesis: rowFor('framing-4').querySelectorAll('[data-framing-no-thesis]').length,
        // `framing-3`: one round, no thesis — the fact §12 :1163 asks be shown, and it is unchanged.
        withRounds: (rowFor('framing-3').querySelector('[data-framing-no-thesis]')?.textContent ?? '').trim(),
        withRoundsAlsoSaysNoRound: rowFor('framing-3').querySelectorAll('[data-framing-no-round]').length,
        // `framing-1`: rounds AND a thesis — neither word belongs on it.
        attached: rowFor('framing-1').querySelectorAll('[data-framing-no-round], [data-framing-no-thesis]').length,
      }).toEqual({
        noRound: 'נפתח בלי סבב',
        noRoundAlsoSaysNoThesis: 0,
        withRounds: 'עדיין לא הוליד תזה',
        withRoundsAlsoSaysNoRound: 0,
        attached: 0,
      });
    } finally {
      fetching.restore();
    }
  });

  // RD-7 IS RETIRED, AND ITS PROPERTY IS NOT. `no-id-as-text` now renders `/research` through the one
  // dashboard helper and holds the same rule over it, in BOTH locales and beside the eight other pages —
  // which is strictly more than this file could, and it keeps ONE reader for one rule (R67 round 2, M2).
  // What remains here is the other half, which is this page's own: the id IS on the page, in the URL of the
  // public-page link and in the COPY value of a command, and nowhere else.
  it('RD-7b THE THESIS ID IS IN THE URL AND IN A COPY VALUE — the two homes §4 allows, and it is really there', async () => {
    const { container, fetching } = await dashboard(WHOLE);
    try {
      expect([...container.querySelectorAll('a')].map((anchor) => anchor.getAttribute('href') ?? '')).toContain(
        '/he/theses/cmu0aaaa00011112222333344',
      );
      const copied = [...container.querySelectorAll('[data-copy-value]')].map((node) => node.getAttribute('data-copy-value') ?? '');
      expect(copied.some((value) => value.includes('cmu0aaaa00011112222333344'))).toBe(true);
    } finally {
      fetching.restore();
    }
  });
});

describe('/research — the states of §13', () => {
  it('RD-8 A 401 SENDS THE READER TO `/login?returnTo=`, BARE, and draws no sentence on the way', async () => {
    window.history.pushState({}, '', '/he/research');
    const { container, fetching } = await dashboard(refusing(401, { error: 'Unauthorized', message: 'Missing Authorization: Bearer <token>' }));
    try {
      expect(mockPushed[0]).toBe('/login?returnTo=%2Fresearch');
      expect(mockPushed.every((href) => !href.includes('%2Fhe%2F'))).toBe(true);
      expect(container.textContent).not.toContain('החשבון הזה אינו חוקר מאושר.');
    } finally {
      fetching.restore();
    }
  });

  it('RD-9 A 403 IS ONE SENTENCE WITH `/researchers` LINKED, and no redirect', async () => {
    const { container, fetching } = await dashboard(refusing(403, { error: 'Forbidden', message: 'not approved' }));
    try {
      // ONE SENTENCE, ONCE — §13 :475 gives the 403 ONE sentence, and the page makes FIVE reads through one
      // door. Before the door was lifted out of the per-region boundary this drew five copies of it, and a
      // case that only asked "is it there" was green on all five.
      const forbidden = container.querySelectorAll('[data-research-forbidden]');
      expect(forbidden.length).toBe(1);
      expect(forbidden[0].textContent).toContain('החשבון הזה אינו חוקר מאושר.');
      expect((container.textContent ?? '').split('החשבון הזה אינו חוקר מאושר.').length - 1).toBe(1);
      expect([...container.querySelectorAll('a')].map((anchor) => anchor.getAttribute('href'))).toContain('/he/researchers');
      expect(screen.getByText('בקשת גישת מחקר')).toBeTruthy();
      expect(mockPushed).toEqual([]);
    } finally {
      fetching.restore();
    }
  });

  it('RD-10 A BACKEND THAT CANNOT BE REACHED IS A SENTENCE, not a blank and not a throw', async () => {
    const { container, fetching } = await dashboard({});
    try {
      expect(container.querySelectorAll('[data-research-unreachable]').length).toBeGreaterThanOrEqual(1);
      expect(container.textContent).toContain('לא ניתן להגיע לשרת.');
    } finally {
      fetching.restore();
    }
  });
});
