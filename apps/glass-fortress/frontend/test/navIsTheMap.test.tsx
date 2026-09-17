import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Sidebar } from '@/components/shell/Sidebar';
import { renderWithIntl, setAuthState, setPathname, textNodes, type AuthState, type Locale } from './render';
import he from '../messages/he.json';
import en from '../messages/en.json';
import { FRONTEND, SRC, importClosureOf, importsOf, sourceFiles } from './scan';

// ---------------------------------------------------------------------------
// nav-is-the-map — docs/gf-ui-flows.md §32 :802–:823 AS AMENDED 2026-09-16 (the sidebar IS the nav), §38
// :906–:907, A5 :1085; docs/gf-ui-refactor-plan.md §9 :1062–:1067, :1096–:1097 and §5 :905.
//
// THE CHROME IS THE LAYOUT'S, and its nav is ONE list keyed by identity. At UI-4b that nav is the SIDEBAR.
// The rendered anchors are compared with the canvas's entry set, IN ITS ORDER, under each of the five states
// the identity reads. Every expected set is LITERAL: the labels are the approved copy of
// `handoffs/R57-approved-copy.md`, frozen, and the handle is the fixture's.
//
// THREE THINGS CHANGED FROM UI-4, each on the researcher's ruling of 2026-09-16:
//   - „הבית” IS RETIRED AS A CONCEPT, verbatim: „אין כבר סרגל בראש הדף ובכלל אין משמעות ל״בית״ בקונספט החדש”.
//     The SITE NAME at the sidebar's head is the link to `/`; `common.nav.home` is gone from both catalogs.
//   - The archive's SEARCH control is a new entry, to `/corpus/search` (§9 :1062–:1063). Its page lands at
//     UI-7, so it is the third nav entry that answers 404 in the meantime — by design, as `/corpus` and
//     `/research` already are (plan §8 :1020–:1023), and recorded in the step's dated doc.
//   - מחקר · the handle · ניהול sit ABOVE אודות · לחוקרים, which is the board's foot order. ניהול's own place
//     is INFERRED from where מחקר and the handle sit: no board on any of the seven pages draws an admin.
//
// The locale control and the open-source link are rendered OUTSIDE the `<nav>`, as the locale control already
// was: neither is a destination in this site's map, and an external source-code link is not navigation. That
// is what keeps the arrays below the whole answer to "where can a reader go from here".
//
// The render reads `document.body`, never the container, so a portaled copy of the list is seen.
// The auth and path boundaries are test/render.tsx's doubles; AuthContext.tsx is not edited.
// ---------------------------------------------------------------------------

// The string a jest.mock names is resolved by jest, not by next/jest's SWC transform, which rewrites `@/` only inside import
// statements — so the path is written relative here; jest keys the mock by the resolved file, which the chrome's `@/` import reaches.
jest.mock('../src/context/AuthContext', () => jest.requireActual<typeof import('./render')>('./render').authContextDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());
// The DOOR FLAG, read at render (UI-5's `lib/doors.ts`): a getter, so one case can hold "absent while false" and the
// next "present when true" without re-importing the chrome into a second module registry.
let doorsOpen = false;
jest.mock('../src/lib/doors', () => ({
  get DOORS_OPEN() {
    return doorsOpen;
  },
}));

const STATES: readonly AuthState[] = ['anonymous', 'loading', 'signed-in-unapproved', 'approved-researcher', 'admin'];

/** The sidebar's head and its two categories — the name is the way to `/`, and the archive carries the search. */
const HEAD = [
  ['צדק לעם - תיק הקורונה', '/he'],
  ['הארכיון', '/he/corpus'],
  ['חיפוש בארכיון', '/he/corpus/search'],
] as const;
/** The foot's public entries, in the board's order. */
const FOOT = [
  ['אודות', '/he/about'],
  ['לחוקרים', '/he/researchers'],
] as const;
/** §32 :809–:810: a signed-in researcher gains מחקר and their handle → /profile; an admin gains /admin. */
const RESEARCH = ['מחקר', '/he/research'] as const;
const PROFILE = ['handle-fixture', '/he/profile'] as const;
const ADMIN = ['ניהול', '/he/admin'] as const;
/** §32 :808's fourth public entry, drawn only when `lib/doors.ts` says the door is live (UI-5). */
const SAFETY = ['הגנה', '/he/safety'] as const;

/** Retired, dialog and sign-in URLs, unprefixed — plan :836–:837 (retired), ui-flows §2.2 :109 (the dialog), the researcher's Q7 (no sign-in). */
const NOT_IN_THE_CHROME: readonly RegExp[] = [
  /^\/theses$/,
  /^\/call$/,
  /^\/theses\/[^/]+\/(edit|history)$/,
  /^\/(evidence|figures|forensics|guide|submit)(\/|$)/,
  /^\/article-rules\//,
  /^\/login(\/|$)/,
];

/**
 * C1's subject, RE-POINTED at the shell this step lands. Before UI-4b it was
 * ['src/components/SiteHeader.tsx', 'src/components/SiteNav.tsx', 'src/components/SiteFooter.tsx'];
 * those three are RETIRED here and their one list MOVED, not copied (§9 :1091).
 */
const CHROME = [
  'src/components/shell/Shell.tsx',
  'src/components/shell/Sidebar.tsx',
  'src/components/shell/RightPane.tsx',
  'src/components/shell/Splitter.tsx',
];
const LOCALE_LAYOUT = 'src/app/[locale]/layout.tsx';
const REPOSITORY = 'https://github.com/time4love/OpenJustice';

beforeEach(() => {
  // The arrays are read with the recents store EMPTY, so they are the same on every route; the item kinds are
  // `recents-are-local`'s subject, over its own fixture.
  window.localStorage.clear();
});

afterEach(() => {
  setAuthState(undefined);
  setPathname(undefined);
  window.localStorage.clear();
});

function renderSidebar(state: AuthState, { locale = 'he', path = '/he/about' }: { locale?: Locale; path?: string } = {}) {
  setAuthState(state);
  setPathname(path);
  return renderWithIntl(<Sidebar />, { locale });
}

/**
 * An anchor's ACCESSIBLE NAME and its href. The name is the `aria-label` where there is one — the search
 * control is an icon whose glyph is `aria-hidden`, so its text node is empty and its label is the copy.
 */
function pairsOf(anchors: readonly Element[]): [string, string][] {
  return anchors.map((anchor) => [
    (anchor.getAttribute('aria-label') ?? anchor.textContent ?? '').trim(),
    anchor.getAttribute('href') ?? '',
  ]);
}

/** Every anchor inside a `<nav>` anywhere in the document, in document order. */
function navAnchors(): [string, string][] {
  return pairsOf([...document.body.querySelectorAll('nav a')]);
}

/** Every anchor the render put anywhere in the document. */
function chromeAnchors(): Element[] {
  return [...document.body.querySelectorAll('a')];
}

function unprefixed(href: string): string {
  const path = href.split(/[?#]/)[0] ?? href;
  const bare = path.replace(/^\/(he|en)(?=\/|$)/, '');
  return bare === '' ? '/' : bare;
}

/** One problem per state, from a reader run over a fresh render of the sidebar under that state. */
function acrossStates(read: (state: AuthState) => string[]): string[] {
  return STATES.flatMap((state) => {
    const { unmount } = renderSidebar(state);
    try {
      return read(state);
    } finally {
      unmount();
    }
  });
}

function chromeScanSubjects(): string[] {
  return sourceFiles(join(SRC, 'app'), ['.ts', '.tsx']);
}

describe('nav-is-the-map', () => {
  it('anonymous — the name → /, הארכיון /corpus, its search → /corpus/search, אודות, לחוקרים, in the canvas\'s order', () => {
    renderSidebar('anonymous');
    expect(navAnchors()).toEqual([...HEAD, ...FOOT]);
  });

  it('loading — the anonymous set', () => {
    renderSidebar('loading');
    expect(navAnchors()).toEqual([...HEAD, ...FOOT]);
  });

  it('signed in, not approved — the head, then the handle → /profile, then the foot', () => {
    renderSidebar('signed-in-unapproved');
    expect(navAnchors()).toEqual([...HEAD, PROFILE, ...FOOT]);
  });

  it('approved researcher — the head, then מחקר /research, the handle, then the foot', () => {
    renderSidebar('approved-researcher');
    expect(navAnchors()).toEqual([...HEAD, RESEARCH, PROFILE, ...FOOT]);
  });

  it('admin — the head, מחקר, the handle, ניהול /admin, then the foot', () => {
    renderSidebar('admin');
    expect(navAnchors()).toEqual([...HEAD, RESEARCH, PROFILE, ADMIN, ...FOOT]);
  });

  it('„הבית” is RETIRED: no entry carries that label, and `common.nav.home` is in neither catalog', () => {
    const labelled = acrossStates((state) =>
      navAnchors()
        .filter(([label]) => label === 'הבית' || label === 'Home')
        .map(([label]) => `${state}: ${label}`),
    );
    const catalogs = [
      { locale: 'he', hasHome: 'home' in he.common.nav },
      { locale: 'en', hasHome: 'home' in en.common.nav },
    ];
    expect({ labelled, catalogs }).toEqual({
      labelled: [],
      catalogs: [
        { locale: 'he', hasHome: false },
        { locale: 'en', hasHome: false },
      ],
    });
  });

  // §32 :808 lists הגנה `/safety` "when live", and UI-5's `lib/doors.ts` is the one place that says whether it is
  // (UI plan :416–:417; the researcher's ruling Q1 (a), 2026-09-16). So the nav's entry is held BOTH WAYS: absent
  // while the flag is false — which is the state the tree is in — and present, in §32's order, when it is true.
  it('every identity — while the door flag is false, /safety is not in the nav (§32 :808 "when live"; lib/doors.ts)', () => {
    // The REAL constant, past the double: the tree's flag is false until the document plan's step 32 sets it.
    expect(jest.requireActual<{ DOORS_OPEN: boolean }>('../src/lib/doors').DOORS_OPEN).toBe(false);
    doorsOpen = false;
    const problems = acrossStates((state) =>
      navAnchors()
        .filter(([, href]) => unprefixed(href) === '/safety')
        .map(([, href]) => `${state}: ${href} is in the nav`),
    );
    expect(problems).toEqual([]);
  });

  it('every identity — when the door flag is true, הגנה /safety is in the foot, between אודות and לחוקרים', () => {
    doorsOpen = true;
    try {
      for (const state of STATES) {
        const { unmount } = renderSidebar(state);
        try {
          expect([state, navAnchors().slice(-3)]).toEqual([state, [FOOT[0], SAFETY, FOOT[1]]]);
        } finally {
          unmount();
        }
      }
    } finally {
      doorsOpen = false;
    }
  });

  it('every identity — exactly ONE anchor the sidebar renders leaves the site, and it is the open-source link', () => {
    const problems = acrossStates((state) => {
      const external = chromeAnchors()
        .map((anchor) => anchor.getAttribute('href') ?? '')
        .filter((href) => !href.startsWith('/') || href.startsWith('//'));
      return external.length === 1 && external[0] === REPOSITORY ? [] : [`${state}: ${JSON.stringify(external)}`];
    });
    expect(problems).toEqual([]);
  });

  it('every identity — no retired page, no dialog and no sign-in URL is an anchor of the chrome', () => {
    const problems = acrossStates((state) =>
      chromeAnchors()
        .map((anchor) => anchor.getAttribute('href') ?? '')
        .filter((href) => NOT_IN_THE_CHROME.some((pattern) => pattern.test(unprefixed(href))))
        .map((href) => `${state}: ${href}`),
    );
    expect(problems).toEqual([]);
  });

  it('every identity — the chrome renders ONE <nav>, and it holds every entry', () => {
    const problems = acrossStates((state) => {
      const count = document.body.querySelectorAll('nav').length;
      return count === 1 ? [] : [`${state}: ${String(count)} <nav> elements`];
    });
    expect(problems).toEqual([]);
  });

  it('no file under src/app imports the shell, the sidebar, the right pane or the splitter, except app/[locale]/layout.tsx', () => {
    const missing = CHROME.filter((module) => !existsSync(join(FRONTEND, module))).map((module) => `${module} does not exist`);
    const importers = chromeScanSubjects()
      .filter((file) => relative(FRONTEND, file) !== LOCALE_LAYOUT)
      .flatMap((file) =>
        importsOf(file)
          .filter((found) => found.module !== null && CHROME.includes(found.module))
          .map((found) => `${relative(FRONTEND, file)} imports ${String(found.module)}`),
      );
    expect([...missing, ...importers]).toEqual([]);
  });

  it("the chrome-import scan's subjects include the locale layout and the pages under src/app/[locale]", () => {
    const subjects = chromeScanSubjects().map((file) => relative(FRONTEND, file));
    expect(subjects).toContain(LOCALE_LAYOUT);
    expect(subjects.filter((file) => file.startsWith('src/app/[locale]/') && file.endsWith('/page.tsx')).length).toBeGreaterThan(0);
  });

  it('the three UI-4 chrome files are RETIRED: the header, the nav and the footer are gone from the tree', () => {
    const survivors = ['src/components/SiteHeader.tsx', 'src/components/SiteNav.tsx', 'src/components/SiteFooter.tsx'].filter((module) =>
      existsSync(join(FRONTEND, module)),
    );
    expect(survivors).toEqual([]);
  });

  it('app/[locale]/layout.tsx mounts neither FloatingChatWidget nor StagingDebugConsole — not directly, not through anything it imports', () => {
    const reached = importClosureOf(join(FRONTEND, LOCALE_LAYOUT));
    const retired = ['src/components/FloatingChatWidget.tsx', 'src/components/StagingDebugConsole.tsx'].filter((module) =>
      reached.includes(module),
    );
    expect(retired).toEqual([]);
  });

  it('the locale control on /about under he is one anchor to /en/about, and under en one anchor to /he/about', () => {
    const controls = (locale: Locale, path: string, other: Locale): string[] => {
      const { unmount } = renderSidebar('anonymous', { locale, path });
      try {
        return chromeAnchors()
          .filter((anchor) => anchor.getAttribute('lang') === other)
          .map((anchor) => anchor.getAttribute('href') ?? '');
      } finally {
        unmount();
      }
    };
    expect({ he: controls('he', '/he/about', 'en'), en: controls('en', '/en/about', 'he') }).toEqual({
      he: ['/en/about'],
      en: ['/he/about'],
    });
  });

  it("the sidebar's foot renders no disclaimer, short or full, in either locale", () => {
    // COMPLIANCE.md :95–:96 and :99 — the disclaimer's own phrases. The chrome carries none (the researcher's ruling, 2026-09-15):
    // the short form is each thesis, call and door page's own LAST element.
    const phrases = ['קביעה שיפוטית', 'ניתוח משפטי בתום לב', 'judicial finding', 'good-faith legal analysis'];
    const found = (['he', 'en'] as const).flatMap((locale) => {
      const { container, unmount } = renderSidebar('anonymous', { locale, path: `/${locale}/about` });
      try {
        return textNodes(container)
          .map((text) => text.data)
          .filter((data) => phrases.some((phrase) => data.includes(phrase)))
          .map((data) => `${locale}: ${data}`);
      } finally {
        unmount();
      }
    });
    expect(found).toEqual([]);
  });

  it('the open-source link is the foot\'s, outside the <nav>, and it is the repository', () => {
    const { container } = renderSidebar('anonymous');
    const outside = [...container.querySelectorAll('a')].filter((anchor) => anchor.closest('nav') === null);
    expect(outside.map((anchor) => anchor.getAttribute('href'))).toEqual(['/en/about', REPOSITORY]);
    expect((outside.at(1)?.textContent ?? '').trim()).toEqual('קוד המקור של האתר פתוח לציבור');
  });
});
