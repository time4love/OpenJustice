import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { renderWithIntl, setAuthState, setPathname, textNodes, type AuthState, type Locale } from './render';
import { FRONTEND, SRC, importClosureOf, importsOf, sourceFiles } from './scan';

// ---------------------------------------------------------------------------
// nav-is-the-map — docs/gf-ui-flows.md §32 :802–:823, §38 :906–:907, A5 :1085;
// docs/gf-ui-refactor-plan.md UI-4 :299–:370 and §5 :905.
//
// THE CHROME IS THE LAYOUT'S, and its nav is ONE list keyed by identity. The header is rendered under each of
// the five states the identity reads (anonymous · loading · signed in, not approved · approved researcher ·
// admin — A3 :1019–:1024 with the researcher's ruling of 2026-09-15 on the fourth and fifth), and its anchors
// are compared with §32's set, IN §32's ORDER. Every expected set is LITERAL here: the Hebrew labels are §32's
// own words (:808–:809); `ניהול` is the admin label as approved 2026-09-15; the handle is the fixture's.
//
// The render reads `document.body`, never the container, so a portaled copy of the list is seen.
// The auth and path boundaries are test/render.tsx's doubles; AuthContext.tsx is not edited.
// ---------------------------------------------------------------------------

// The string a jest.mock names is resolved by jest, not by next/jest's SWC transform, which rewrites `@/` only inside import
// statements — so the path is written relative here; jest keys the mock by the resolved file, which the chrome's `@/` import reaches.
jest.mock('../src/context/AuthContext', () => jest.requireActual<typeof import('./render')>('./render').authContextDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

const STATES: readonly AuthState[] = ['anonymous', 'loading', 'signed-in-unapproved', 'approved-researcher', 'admin'];

/** The public four, §32 :808 in its order; `/safety` (הגנה) joins WHEN LIVE, which is not this step. */
const PUBLIC = [
  ['הבית', '/he'],
  ['הארכיון', '/he/corpus'],
  ['אודות', '/he/about'],
  ['לחוקרים', '/he/researchers'],
] as const;
/** §32 :809–:810: a signed-in researcher gains מחקר and their handle → /profile; an admin gains /admin. */
const RESEARCH = ['מחקר', '/he/research'] as const;
const PROFILE = ['handle-fixture', '/he/profile'] as const;
const ADMIN = ['ניהול', '/he/admin'] as const;

/** Retired, dialog and sign-in URLs, unprefixed — plan :836–:837 (retired), ui-flows §2.2 :109 (the dialog), the researcher's Q7 (no sign-in). */
const NOT_IN_THE_CHROME: readonly RegExp[] = [
  /^\/theses$/,
  /^\/call$/,
  /^\/theses\/[^/]+\/(edit|history)$/,
  /^\/(evidence|figures|forensics|guide|submit)(\/|$)/,
  /^\/article-rules\//,
  /^\/login(\/|$)/,
];

const CHROME = ['src/components/SiteHeader.tsx', 'src/components/SiteNav.tsx', 'src/components/SiteFooter.tsx'];
const LOCALE_LAYOUT = 'src/app/[locale]/layout.tsx';
const REPOSITORY = 'https://github.com/time4love/OpenJustice';

afterEach(() => {
  setAuthState(undefined);
  setPathname(undefined);
});

function renderHeader(state: AuthState, { locale = 'he', path = '/he/about' }: { locale?: Locale; path?: string } = {}) {
  setAuthState(state);
  setPathname(path);
  return renderWithIntl(<SiteHeader />, { locale });
}

function pairsOf(anchors: readonly Element[]): [string, string][] {
  return anchors.map((anchor) => [(anchor.textContent ?? '').trim(), anchor.getAttribute('href') ?? '']);
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

/** One problem per state, from a reader run over a fresh render of the header under that state. */
function acrossStates(read: (state: AuthState) => string[]): string[] {
  return STATES.flatMap((state) => {
    const { unmount } = renderHeader(state);
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
  it('anonymous — the nav is הבית /, הארכיון /corpus, אודות /about, לחוקרים /researchers, in §32\'s order', () => {
    renderHeader('anonymous');
    expect(navAnchors()).toEqual([...PUBLIC]);
  });

  it('loading — the nav is the anonymous set', () => {
    renderHeader('loading');
    expect(navAnchors()).toEqual([...PUBLIC]);
  });

  it('signed in, not approved — the anonymous set, then the handle → /profile', () => {
    renderHeader('signed-in-unapproved');
    expect(navAnchors()).toEqual([...PUBLIC, PROFILE]);
  });

  it('approved researcher — the anonymous set, then מחקר /research, then the handle → /profile', () => {
    renderHeader('approved-researcher');
    expect(navAnchors()).toEqual([...PUBLIC, RESEARCH, PROFILE]);
  });

  it('admin — the anonymous set, then מחקר /research, the handle → /profile, then ניהול /admin', () => {
    renderHeader('admin');
    expect(navAnchors()).toEqual([...PUBLIC, RESEARCH, PROFILE, ADMIN]);
  });

  it('every identity — /safety is not in the nav (§32 :808 "when live")', () => {
    const problems = acrossStates((state) =>
      navAnchors()
        .filter(([, href]) => unprefixed(href) === '/safety')
        .map(([, href]) => `${state}: ${href} is in the nav`),
    );
    expect(problems).toEqual([]);
  });

  it('every identity — no anchor the chrome renders leaves the site; the open-source link is the footer\'s', () => {
    const problems = acrossStates((state) =>
      chromeAnchors()
        .map((anchor) => anchor.getAttribute('href') ?? '')
        .filter((href) => !href.startsWith('/') || href.startsWith('//'))
        .map((href) => `${state}: ${href}`),
    );
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

  it('no file under src/app imports the header, the nav or the footer, except app/[locale]/layout.tsx', () => {
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

  it("the header-import scan's subjects include the locale layout and the pages under src/app/[locale]", () => {
    const subjects = chromeScanSubjects().map((file) => relative(FRONTEND, file));
    expect(subjects).toContain(LOCALE_LAYOUT);
    expect(subjects.filter((file) => file.startsWith('src/app/[locale]/') && file.endsWith('/page.tsx')).length).toBeGreaterThan(0);
  });

  it('app/[locale]/layout.tsx mounts the header and the footer', () => {
    const mounted = importsOf(join(FRONTEND, LOCALE_LAYOUT)).map((found) => found.module);
    const missing = ['src/components/SiteHeader.tsx', 'src/components/SiteFooter.tsx'].filter((module) => !mounted.includes(module));
    expect(missing).toEqual([]);
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
      const { unmount } = renderHeader('anonymous', { locale, path });
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

  it('the footer renders no disclaimer, short or full, in either locale', () => {
    // COMPLIANCE.md :95–:96 and :99 — the disclaimer's own phrases. The footer carries none (the researcher's ruling, 2026-09-15).
    const phrases = ['קביעה שיפוטית', 'ניתוח משפטי בתום לב', 'judicial finding', 'good-faith legal analysis'];
    const found = (['he', 'en'] as const).flatMap((locale) => {
      const { container, unmount } = renderWithIntl(<SiteFooter />, { locale });
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

  it('the footer is the open-source link and nothing else: one anchor, to the repository, one text', () => {
    const { container } = renderWithIntl(<SiteFooter />);
    expect(chromeAnchors().map((anchor) => anchor.getAttribute('href'))).toEqual([REPOSITORY]);
    expect(textNodes(container)).toHaveLength(1);
  });
});
