import { createElement, type ComponentType, type ReactElement, type ReactNode } from 'react';
import { act, fireEvent, render, type RenderResult } from '@testing-library/react';
import { NextIntlClientProvider, createTranslator, type AbstractIntlMessages } from 'next-intl';
import type { ResearcherProfile } from '@/context/AuthContext';
import type { CorpusEntry } from '@/types/corpus';
import { routing } from '@/i18n/routing';
import { DeclareTabs, RightPane, TabsProvider } from '@/components/shell/RightPane';
import { useRecordTab } from '@/components/corpus/RecordSheet';
import { messageCatalogs, requireSubjects } from './scan';
import { claimsAnswer } from './fixtures/corpus/claims';
import { articleRules, captures, evidenceReviews, framings, pages as pagesFixture, ruleHistory, thesesList, thesisReviewsOwed } from './fixtures/research/reads';
import { claimsAtAll, corpusAtAll, corpusAtAllAtPageOne } from './fixtures/research/corpusAll';
import { thesisContextOwed } from './fixtures/research/thesisContext';
import type { ThesisContext } from '@/types/research';

// ---------------------------------------------------------------------------
// RENDER-SCAN HELPERS FOR THE FRONTEND'S INSTRUMENTS (docs/gf-ui-refactor-plan.md
// UI-1; design docs/gf-ui-flows.md A5).
//
// A component or a page is rendered under NextIntlClientProvider with the REAL
// messages/<locale>.json, then read as a DOM tree — text nodes, ancestors,
// document order — by the instruments that hold what a reader sees.
//
// SERVER COMPONENTS render through ONE stand-in. Under jest, `next-intl/server`
// resolves to its client build, whose every function throws; `test/setup.ts`
// replaces it with `nextIntlServer` below, built on `createTranslator` over the
// same real messages. The component itself is real: it is awaited, and its
// element is rendered. Jest cannot render an async component as one (the Next.js
// jest guide says so); awaiting it first is what makes it an ordinary element.
//
// ONE HELPER PER KIND: every later render scan reads this module (plan §4).
// ---------------------------------------------------------------------------

export type Locale = (typeof routing.locales)[number];

/**
 * A locale's catalog, whole, from `messageCatalogs()` — the one reader of the message files.
 * Callers: `renderWithIntl`, `nextIntlServer`; the harness' H-3, H-4 read labels through it.
 */
export function messagesFor(locale: Locale): AbstractIntlMessages {
  const catalog = messageCatalogs().find((candidate) => candidate.locale === locale);
  if (catalog === undefined) throw new Error(`messagesFor: no messages/${locale}.json`);
  return catalog.messages as AbstractIntlMessages;
}

/**
 * A missing or malformed message THROWS in every render here. next-intl's default logs and renders the key as text —
 * a page under test would pass while a reader saw `namespace.key`. Both paths below take this, one spelling.
 */
function rethrow(error: Error): never {
  throw error;
}

export interface RenderOptions {
  locale?: Locale;
  /** Rendered INSIDE the provider, around the subject — `nav-is-the-map` (UI-4) passes the `AuthContext` double here. */
  wrapper?: ComponentType<{ children: ReactNode }>;
  /** A page's query, for the pages whose STATE is the query — `/corpus` and every lens of it (UI-7). */
  searchParams?: Record<string, string | string[] | undefined>;
}

/**
 * A client component or page rendered under `NextIntlClientProvider` with the real catalog.
 * Callers: the harness' H-3, H-4, H-8 (UI-1); `nav-is-the-map` (UI-4); every render instrument of UI-5 to UI-9.
 */
export function renderWithIntl(ui: ReactElement, { locale = routing.defaultLocale, wrapper: Wrapper }: RenderOptions = {}): RenderResult {
  return render(
    <NextIntlClientProvider locale={locale} messages={messagesFor(locale)} onError={rethrow}>
      {Wrapper === undefined ? ui : <Wrapper>{ui}</Wrapper>}
    </NextIntlClientProvider>,
  );
}

let requestLocale: Locale | undefined;

function notDoubled(name: string): () => never {
  return () => {
    throw new Error(`next-intl/server.${name} is not doubled in test/render.tsx — add it there`);
  };
}

function currentLocale(): Locale {
  if (requestLocale === undefined) {
    throw new Error('next-intl/server stand-in: no request locale — render server components through renderServer');
  }
  return requestLocale;
}

type TranslationsArgument = string | { locale?: Locale; namespace?: string } | undefined;

const realServer = jest.requireActual<Record<string, unknown>>('next-intl/server');

export interface IntlServerDouble {
  [name: string]: unknown;
  setRequestLocale(locale: Locale): void;
  getLocale(): Promise<Locale>;
  getMessages(): Promise<AbstractIntlMessages>;
  getTranslations(argument?: TranslationsArgument): Promise<ReturnType<typeof createTranslator>>;
}

/**
 * The module `test/setup.ts` hands jest for `next-intl/server`: every export of the real module refuses,
 * except the four a server component here calls. Callers: `test/setup.ts`; the harness' H-7.
 */
export const nextIntlServer: IntlServerDouble = {
  ...Object.fromEntries(Object.keys(realServer).map((name) => [name, notDoubled(name)])),
  setRequestLocale(locale: Locale): void {
    requestLocale = locale;
  },
  async getLocale(): Promise<Locale> {
    return currentLocale();
  },
  async getMessages(): Promise<AbstractIntlMessages> {
    return messagesFor(currentLocale());
  },
  async getTranslations(argument?: TranslationsArgument) {
    const options = typeof argument === 'string' ? { namespace: argument } : (argument ?? {});
    const locale = options.locale ?? currentLocale();
    return createTranslator({ locale, messages: messagesFor(locale), namespace: options.namespace, onError: rethrow });
  },
};

/**
 * A server component's ELEMENT, never rendered: the request locale set on the stand-in for the await and cleared after it.
 * For a component whose element cannot go into jsdom's container — a root layout's `<html>`. The one spelling of the
 * request-locale discipline: `renderServer` calls it. Callers: `renderServer`; the locale document's cases (UI-4).
 */
export async function serverElement(component: () => Promise<ReactElement | null>, { locale = routing.defaultLocale }: Pick<RenderOptions, 'locale'> = {}): Promise<ReactElement | null> {
  nextIntlServer.setRequestLocale(locale);
  try {
    return await component();
  } finally {
    // The locale belongs to ONE server render; a translation asked for outside one is a refusal, not the last case's locale.
    requestLocale = undefined;
  }
}

/**
 * A server component rendered: `serverElement`'s element rendered under the provider (an empty fragment for `null` — the
 * tree's reader refuses it, not this). Callers: the harness' H-3, H-4, H-5 (UI-1); UI-5's server pages, if its step renders
 * them on the server; UI-9.
 */
export async function renderServer(component: () => Promise<ReactElement | null>, options: RenderOptions = {}): Promise<RenderResult> {
  const locale = options.locale ?? routing.defaultLocale;
  const element = await serverElement(component, { locale });
  return renderWithIntl(element ?? <></>, { ...options, locale });
}

/**
 * THE SHELL'S TAB REGISTRY, AROUND EVERY PAGE RENDER — because a page is never rendered without it.
 *
 * `app/[locale]/layout.tsx` mounts `<Shell>` once (UI-4b §9 :1058) and `TabsProvider` is inside it, so
 * in the running application every page already sits in the registry. From UI-5 a page DECLARES its
 * right-pane tabs (§10 :1124), and `usePaneTabs` throws outside the provider ON PURPOSE — "the right
 * pane is only reachable inside the shell" — so that a page cannot declare tabs into nothing.
 *
 * A harness that rendered a page bare would be rendering something Next never renders. The provider is
 * added HERE, once, rather than making the shell's context optional: tolerating its absence would turn
 * a deliberate throw into a silent no-op, which is the "green over an unexercised property" shape this
 * suite exists to catch.
 */
function withTabsProvider(wrapper: ComponentType<{ children: ReactNode }> | undefined): ComponentType<{ children: ReactNode }> {
  return function PageEnvelope({ children }: { children: ReactNode }) {
    return createElement(TabsProvider, null, wrapper === undefined ? children : createElement(wrapper, null, children));
  };
}

/**
 * Every non-blank text node under `root`, in document order — through the vacuity guard, so an empty
 * tree is a failure and never a pass. Callers: the harness' H-3, H-4, H-5 (UI-1); `no-id-as-text`,
 * `bidi-isolated`, `notice-only` (UI-5) and `no-id-as-text` on every page after.
 */
export function textNodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const found: Text[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node instanceof Text && node.data.trim() !== '') found.push(node);
  }
  return [...requireSubjects('text nodes of the rendered tree', found)];
}

/**
 * A node's ancestor elements, nearest first, up to `document.body`. Callers: the harness' H-3 (UI-1);
 * `bidi-isolated` (UI-5); `opinion-labelled-on-corpus` (UI-7); `opinion-under-label` (UI-8).
 */
export function ancestorsOf(node: Node): Element[] {
  const found: Element[] = [];
  for (let at = node.parentElement; at !== null && at !== document.body; at = at.parentElement) found.push(at);
  return found;
}

// ---------------------------------------------------------------------------
// THE CLIENT DOUBLES (UI-4). Two modules the chrome reads that a render outside Next cannot supply: AuthContext's
// `useAuth` (the identity the nav is keyed by) and `next/navigation` (the path, which Next answers `null` for outside
// an app router). Each is handed to a `jest.mock` factory in the test file that needs it, the way `test/setup.ts`
// hands `nextIntlServer` over: the REAL module spread, one function replaced, and a case that forgets to set the
// value REFUSES rather than inheriting the last case's. `src/context/AuthContext.tsx` is never edited (KEEP).
// ---------------------------------------------------------------------------

/** A callable that refuses: a double's act the subject must never perform. */
function refuse(message: string): () => never {
  return () => {
    throw new Error(message);
  };
}

type AuthModule = typeof import('@/context/AuthContext');
type AuthValue = ReturnType<AuthModule['useAuth']>;

/** The five states the nav is keyed by: A3's three identities, the signed-in unapproved account, and the provider's loading. */
export type AuthState = 'anonymous' | 'loading' | 'signed-in-unapproved' | 'approved-researcher' | 'admin';

function profile(approved: boolean, role: ResearcherProfile['role']): ResearcherProfile {
  return { id: 'researcher-fixture', handle: 'handle-fixture', role, approved, createdAt: '2026-09-15T00:00:00.000Z' };
}

const AUTH_STATES: Record<AuthState, Pick<AuthValue, 'accessToken' | 'researcher' | 'loading'>> = {
  anonymous: { accessToken: null, researcher: null, loading: false },
  // The real provider's loading shape: no override yet and the restore pending, so no researcher (AuthContext.tsx :109–:111).
  loading: { accessToken: null, researcher: null, loading: true },
  'signed-in-unapproved': { accessToken: 'token-fixture', researcher: profile(false, 'RESEARCHER'), loading: false },
  'approved-researcher': { accessToken: 'token-fixture', researcher: profile(true, 'RESEARCHER'), loading: false },
  admin: { accessToken: 'token-fixture', researcher: profile(true, 'ADMIN'), loading: false },
};

let authState: AuthState | undefined;

/** The identity `useAuth` answers until the next call; `undefined` makes it refuse. Callers: `nav-is-the-map` (UI-4); UI-8's gated pages. */
export function setAuthState(state: AuthState | undefined): void {
  authState = state;
}

/**
 * The module `jest.mock('@/context/AuthContext', …)` returns: the real module, its `useAuth` answering the state a case set, and
 * refusing when none was. `login` and `logout` refuse — the chrome performs no auth act. Callers: `nav-is-the-map` (UI-4); UI-8.
 */
export function authContextDouble(): AuthModule {
  // Relative, not `@/`: a string jest resolves at run time is not rewritten by next/jest's transform (imports only).
  const real = jest.requireActual<AuthModule>('../src/context/AuthContext');
  return {
    ...real,
    useAuth: (): AuthValue => {
      if (authState === undefined) throw new Error('useAuth double: no auth state — call setAuthState in the case');
      return {
        ...AUTH_STATES[authState],
        login: refuse('useAuth double: login was called — the chrome performs no auth act'),
        logout: refuse('useAuth double: logout was called — the chrome performs no auth act'),
      };
    },
  };
}

type NavigationModule = typeof import('next/navigation');

let pathname: string | undefined;

/** The browser path `usePathname` answers, locale prefix included (`/he/about`); `undefined` makes it refuse. Callers: `nav-is-the-map` (UI-4). */
export function setPathname(path: string | undefined): void {
  pathname = path;
}

/**
 * The module `jest.mock('next/navigation', …)` returns: the real module, `usePathname` answering the path a case set (refusing when
 * none was), and `useRouter` a router whose every method refuses — the chrome navigates by anchors, never by the router.
 * Callers: `nav-is-the-map` (UI-4).
 */
export function navigationDouble(): NavigationModule {
  const real = jest.requireActual<NavigationModule>('next/navigation');
  const refused = (method: string) => refuse(`navigation double: router.${method} was called — the chrome navigates by anchors only`);
  return {
    ...real,
    usePathname: (): string => {
      if (pathname === undefined) throw new Error('navigation double: no pathname — call setPathname in the case');
      return pathname;
    },
    useRouter: () => ({
      back: refused('back'),
      forward: refused('forward'),
      refresh: refused('refresh'),
      push: refused('push'),
      replace: refused('replace'),
      prefetch: refused('prefetch'),
    }),
  };
}

// ---------------------------------------------------------------------------
// THE PUBLIC READS (UI-5). A public page reads its body through `lib/api.ts`' `readPublic` on the server and, for the
// reader's own act (the history's diff), through `fetchJson` in the browser. Both are doubled HERE, by ONE module the
// test file hands `jest.mock('../src/lib/api', …)`: the real module spread, those two answering a path → body map set by
// the case, each call recorded with its init. A path the case did not map REFUSES — a page that read something nobody
// staged is a defect, not a blank.
//
// The real `readPublic` itself (its headers, its cache) is exercised the other way, against `globalFetchDouble` — the
// module real, the network stubbed. Two doubles, two kinds, each named (plan §4, one helper per kind).
// ---------------------------------------------------------------------------

/**
 * What `readPublic` answers: the body, the one 404, the 400 a malformed filter earns — or the 409 a read
 * that NAMED it earns (UI-7 chunk 2b).
 *
 * A CASE MAY STAGE A 409 FOR ANY PATH; the double decides whether it is a STATE or a THROW exactly as the
 * real module does, from the caller's own `answers`. A harness that handed every caller the state would be
 * more permissive than the door it doubles, and the opt-in — whose whole point is that it is per caller —
 * would be held by nothing.
 */
export type PublicRead = { status: 200; body: unknown } | { status: 404 } | { status: 400 } | { status: 409 };

export interface ApiCall {
  via: 'readPublic' | 'fetchJson';
  path: string;
  init: RequestInit | undefined;
  /** Whether the caller handed `readPublic` a parser — a page that reads a body without one has no guard at its boundary. */
  parsed: boolean;
}

let publicBodies: Record<string, PublicRead> | undefined;
const apiCalls: ApiCall[] = [];

/** The bodies the doubled reads answer, by path. Callers: every UI-5 page instrument. */
export function setPublicBodies(bodies: Record<string, PublicRead> | undefined): void {
  publicBodies = bodies;
  apiCalls.length = 0;
}

/** Every read the render made, in order — the path and the init the caller passed. */
export function apiCallsMade(): readonly ApiCall[] {
  return apiCalls;
}

function answerFor(via: ApiCall['via'], path: string, init: RequestInit | undefined, parsed = false): PublicRead {
  if (publicBodies === undefined) throw new Error('api double: no bodies — call setPublicBodies in the case');
  apiCalls.push({ via, path, init, parsed });
  const answer = publicBodies[path];
  if (answer === undefined) throw new Error(`api double: no body for ${path} — the page read a path the case did not stage`);
  return answer;
}

/** The module `jest.mock('../src/lib/api', …)` returns. Callers: UI-5's page instruments. */
export function apiDouble(): Record<string, unknown> {
  const real = jest.requireActual<Record<string, unknown>>('../src/lib/api');
  return {
    ...real,
    // The double APPLIES the parser the page passed — so a body that drifted from the appendix fails inside the
    // page's own guard, exactly as it would on staging, and a page that passed none is visible in `apiCallsMade`.
    readPublic: (path: string, parse?: (body: unknown) => unknown, options?: { answers: readonly number[] }): PublicRead => {
      const answer = answerFor('readPublic', path, undefined, typeof parse === 'function');
      // THE OPT-IN IS THE CALLER'S, here as in the real module: a status the caller did not name is a
      // failure, and a double that softened that would green a page reading a state it cannot receive.
      if (answer.status === 409 && options?.answers.some((named) => named === 409) !== true) {
        throw new Error(`readPublic: ${path} answered 409`);
      }
      if (answer.status !== 200 || typeof parse !== 'function') return answer;
      return { status: 200, body: parse(answer.body) };
    },
    // The real `readUnfiltered` delegates to `readPublic` and throws on the 400 a filterless page cannot
    // provoke. The double says the same thing, so a case that stages a 400 for such a page sees the defect it
    // is rather than a rendered state — and the pages that DO have filters are doubled by the line above.
    readUnfiltered: (path: string, parse?: (body: unknown) => unknown): PublicRead => {
      const answer = answerFor('readPublic', path, undefined, typeof parse === 'function');
      // `readUnfiltered` names no status, so a 409 is a failure through it exactly as any other is.
      if (answer.status === 409) throw new Error(`readPublic: ${path} answered 409`);
      if (answer.status === 400) throw new Error(`readUnfiltered double: ${path} answered 400 — this read sends no filters`);
      if (answer.status !== 200 || typeof parse !== 'function') return answer;
      return { status: 200, body: parse(answer.body) };
    },
    fetchJson: (path: string, init?: RequestInit): unknown => {
      const answer = answerFor('fetchJson', path, init);
      // The real `fetchJson` throws on every status, and its message is what the reader sees; the double says
      // the same for both refusals rather than only the one it happened to be written for.
      if (answer.status !== 200) throw new Error(`fetchJson double: ${path} answered ${String(answer.status)}`);
      return answer.body;
    },
  };
}

export interface FetchDouble {
  calls: { url: string; init: RequestInit | undefined }[];
  restore(): void;
}

/**
 * `global.fetch` answering by URL, recording every call — for the cases that exercise the REAL `readPublic`
 * (its headers, its cache). A URL the case did not map refuses. Callers: `publicRead` (UI-5).
 */
export function globalFetchDouble(answers: Record<string, { status: number; body?: unknown }>): FetchDouble {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const before = global.fetch;
  global.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    const answer = answers[url];
    if (answer === undefined) return Promise.reject(new Error(`fetch double: no answer for ${url}`));
    return Promise.resolve({
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      json: () => Promise.resolve(answer.body),
    } as Response);
  }) as typeof fetch;
  return {
    calls,
    restore(): void {
      global.fetch = before;
    },
  };
}

/**
 * THE ONE RECORD TAB, DECLARED — a HARNESS affordance, for the two instruments that render a sheet ALONE.
 *
 * From UI-8 chunk 5 a PAGE makes exactly one declaration: `DeclareTabs` REPLACES the registry
 * (`RightPane.tsx` :44–:46, :66–:72), and `/research/corpus` has the record sheet and §27's three nested
 * sheets open at the same moment, so the stream composes them all and `useRecordTab` returns a VALUE.
 * `record-content-is-one` and `sheet-reads-on-open` render one sheet with no stream around it, which is the
 * right subject for both — what they need is a declarer, and it belongs here rather than as a component
 * under `src/` that nothing in the app would call.
 */
export function DeclareRecordTab({ entries, openId }: { entries: readonly CorpusEntry[]; openId: string | null }) {
  const tab = useRecordTab(entries, openId);
  return <DeclareTabs tabs={tab === null ? [] : [tab]} />;
}

/** What a page render answers: the one 404, or the rendered tree. */
export type PageRender = { notFound: true } | ({ notFound: false } & RenderResult);

/** `notFound()` throws this digest and terminates the segment (next/navigation). */
const NOT_FOUND_DIGEST = 'NEXT_HTTP_ERROR_FALLBACK;404';

function isNotFound(error: unknown): boolean {
  return typeof (error as { digest?: unknown }).digest === 'string' && ((error as { digest: string }).digest).startsWith(NOT_FOUND_DIGEST);
}

/**
 * A page rendered as Next renders it: awaited with its `params` promise, its element put into jsdom — and its
 * `notFound()` answered as the ONE 404 rather than as a failure. Any other error is rethrown untouched.
 * Callers: UI-5's eight page instruments.
 */
export async function renderPage<P extends Record<string, string>>(
  // A page's own `params` type is its segment's (`{ locale, id }`), so the parameter is GENERIC in it: a helper
  // typed to `Record<string, string>` would reject every real page, the parameter position being contravariant.
  //
  // `searchParams` IS ALWAYS PASSED, and a page that does not declare it simply ignores it. From UI-7 a page's
  // state can live in the QUERY rather than the path (`/corpus` is the pages list or the stream by its
  // parameters alone, ui flows §24 :681), so a harness that could only supply `params` could not render those
  // pages at all — and a page made to tolerate a missing `searchParams` would be shaped around the harness
  // rather than around Next, which always supplies it.
  page: (props: { params: Promise<P>; searchParams: Promise<Record<string, string | string[] | undefined>> }) =>
    | Promise<ReactElement | null>
    | ReactElement
    | null,
  params: P,
  options: RenderOptions = {},
): Promise<PageRender> {
  try {
    const rendered = await renderServer(async () => page({ params: Promise.resolve(params), searchParams: Promise.resolve(options.searchParams ?? {}) }), {
      ...options,
      wrapper: withTabsProvider(options.wrapper),
    });
    return { notFound: false, ...rendered };
  } catch (error) {
    if (isNotFound(error)) return { notFound: true };
    throw error;
  }
}


/**
 * THE CLAIMS VIEW AS A READER MEETS IT — the rows, and the first claim's sheet open beside them.
 *
 * ONE SPELLING, IN THE HARNESS, because three instruments need the same thing and two of them had written
 * it themselves. The third had NOT — `no-door-before-it-exists` rendered the LIST alone — and a decoy proved
 * what that cost: an `/intake` anchor planted inside the sheet reddened NOTHING, because the half of the
 * view that mints the most hrefs was never in the tree the scan read.
 *
 * THE SHEET IS HALF OF THE VIEW AND NOT A SEPARATE PAGE. It is declared into the shell's registry and drawn
 * by `RightPane`, so the wrapper is part of the helper rather than each caller's business; and the tap goes
 * through `fireEvent`, whose `act` is what lets the pane re-render before anything is asserted.
 *
 * IT FAILS LOUDLY AT EVERY STEP — no row, no sheet, a 404 — because a helper that returned a half-rendered
 * tree would hand every caller a scan over less than it thinks it is scanning, which is this file's own
 * recurring defect.
 */
export async function renderClaimsWithSheet(locale: Locale = routing.defaultLocale, page = 'page-one'): Promise<HTMLElement> {
  setPublicBodies({ [`/api/corpus/claims?page=${page}`]: { status: 200, body: claimsAnswer } });
  const claimsPage = (await import('@/app/[locale]/corpus/claims/page')).default;
  const rendered = await renderPage(claimsPage, { locale }, {
    locale,
    searchParams: { page },
    wrapper: ({ children }) => (
      <TabsProvider>
        {children}
        <RightPane />
      </TabsProvider>
    ),
  });
  if (rendered.notFound) throw new Error('renderClaimsWithSheet: the claims view answered the one 404, not a body');
  const tap = rendered.container.querySelector('[data-open-claim]');
  if (tap === null) throw new Error('renderClaimsWithSheet: the claims view rendered no row to open');
  fireEvent.click(tap);
  if (rendered.container.querySelector('[data-claim-sheet]') === null) {
    throw new Error('renderClaimsWithSheet: the tap opened no sheet — the pane drew nothing to scan');
  }
  return rendered.container;
}

/**
 * `/research`, RENDERED WHOLE, FOR EVERY SCAN THAT NEEDS IT — one helper, five callers (UI-8 chunk 4).
 *
 * The read view is CLIENT-rendered below a thin server shell: the bearer is in `window.localStorage` and a
 * Server Component cannot read it. So `renderPage` cannot stage it the way it stages a public page — the
 * reads are effects, and what a scan must examine is the tree AFTER they settle. This does the staging
 * (`global.fetch` answering the five paths from the fixture set), the session, the render and the flush, and
 * hands back the container.
 *
 * ONE HELPER RATHER THAN FIVE COPIES: `bidi-isolated`, `no-id-as-text`, `no-door-before-it-exists`,
 * `no-disclaimer-off-the-thesis` and `no-context-line` all need the same tree, and five stagings of one page
 * is one rule with five implementations — the shape `renderClaimsWithSheet` exists to prevent for the claims
 * view, applied here.
 *
 * IT FAILS LOUDLY when the page draws no region, because a scan over a half-rendered tree examines less than
 * it thinks it does.
 */
export async function renderResearchDashboard(locale: Locale = routing.defaultLocale): Promise<HTMLElement> {
  const researchPage = (await import('@/app/[locale]/research/page')).default;
  const answers: Record<string, { status: number; body?: unknown }> = {
    '/api/research/reviews': { status: 200, body: thesisReviewsOwed },
    '/api/research/evidence-reviews': { status: 200, body: evidenceReviews },
    '/api/research/theses': { status: 200, body: thesesList },
    '/api/research/framings': { status: 200, body: framings },
    // A CROSS-PAGE STREAM at `all`, reached by a date: the body holding BOTH pages' rows belongs to a read that
  // names no page, and its facet therefore carries no shape.
  '/api/research/corpus?since=2021-01-01': { status: 200, body: corpusAtAll },
  '/api/research/pages': { status: 200, body: pagesFixture },
  };
  window.localStorage.setItem('gf_access_token', JSON.stringify({ accessToken: 'scan-token', refreshToken: null, expiresAt: null }));
  // THE PATHNAME IS THE HELPER'S, because the page's DOOR calls `useRouter` (§13 :474's 401 is an act) and
  // next-intl's router reads `usePathname` — which the navigation double refuses until a case sets it. A
  // caller that had to remember this would be a caller that forgets it; the callers' own `afterEach` clears it.
  setPathname(`/${locale}/research`);
  const fetching = globalFetchDouble(answers);
  try {
    // THE PAGE, NOT THE BODY — the server shell AND the client body, which is what a reader meets. Rendering
    // the dashboard alone left `page.tsx`'s own markup (the `<main>`, the heading, anything a later hand adds
    // there) outside every scan that calls this: a planted disclaimer on the shell reddened NOTHING until
    // this changed, which is what a blind probe is for.
    const rendered = await renderPage(researchPage, { locale }, { locale });
    if (rendered.notFound) throw new Error('renderResearchDashboard: /research answered the one 404, not a body');
    await act(async () => {
      await Promise.resolve();
    });
    // THE SCOPE IS WIDENED so the scan meets EVERY row the fixture set carries — a colleague's thesis, the
    // UNARGUED entry, the withdrawn and the draft states. At `mine` the page correctly hides four of them,
    // and a scan over the narrower tree would examine less than the page can show.
    const all = rendered.container.querySelector('[data-scope-option="all"]');
    if (all === null) throw new Error('renderResearchDashboard: the page drew no scope switch');
    await act(async () => {
      fireEvent.click(all);
      await Promise.resolve();
    });
    if (rendered.container.querySelectorAll('[data-region]').length !== 4) {
      throw new Error('renderResearchDashboard: the page drew fewer than four regions — there is less here than a scan expects');
    }
    return rendered.container;
  } finally {
    gatedUrls.push(...fetching.calls.map(({ url }) => url));
    fetching.restore();
  }
}

/**
 * THE GATED READS `/research/corpus` AND `/research/corpus/claims` MEET — one answer table, both helpers.
 *
 * The extraction sheet's three reads are here even though nothing fetches them on arrival: they are IDLE
 * until a reader opens a sheet (`ExtractionSheet.tsx`), and a case that opens one needs the answer staged
 * BEFORE the press rather than a second staging mid-case.
 */
const GATED_CORPUS_ANSWERS: Record<string, { status: number; body?: unknown }> = {
  '/api/research/corpus': { status: 200, body: corpusAtAll },
  // A READ THAT NAMES A PAGE GETS THE PAGE-NAMED BODY: one facet row, carrying §28's `shape`. Staging
  // `corpusAtAll` here would stage a body the backend never answers — every row's `shape` null on a read that
  // named one — and region 3 would draw no strip on the very view it exists for.
  '/api/research/corpus?page=page-one': { status: 200, body: corpusAtAllAtPageOne },
  // A CROSS-PAGE STREAM at `all`, reached by a date: the body holding BOTH pages' rows belongs to a read that
  // names no page, and its facet therefore carries no shape.
  '/api/research/corpus?since=2021-01-01': { status: 200, body: corpusAtAll },
  '/api/research/pages': { status: 200, body: pagesFixture },
  '/api/research/pages/page-one/captures': { status: 200, body: captures },
  '/api/research/pages/page-one/rules': { status: 200, body: articleRules },
  '/api/research/pages/page-one/rules/rule-1/history': { status: 200, body: ruleHistory },
  '/api/research/pages/page-two/captures': { status: 200, body: captures },
  '/api/research/pages/page-two/rules': { status: 200, body: articleRules },
  '/api/research/pages/page-two/rules/rule-1/history': { status: 200, body: ruleHistory },
  '/api/research/corpus/claims?page=page-one': { status: 200, body: claimsAtAll },
};

/** The bearer and the pathname every gated page needs before its client body will read anything. */
function stageGatedSession(locale: Locale, path: string): void {
  // A FRESH VISIT, and the clear is load-bearing. The pane's open layer and its ACTIVE TAB are browser-local
  // (`shell/localState.ts`), so a case that renders the page twice would start the second render on the tab
  // the first one left open — mounting a sheet nobody pressed and issuing its read. Measured on 2026-09-21,
  // while counting §27's on-demand reads.
  window.localStorage.clear();
  window.localStorage.setItem('gf_access_token', JSON.stringify({ accessToken: 'scan-token', refreshToken: null, expiresAt: null }));
  // The DOOR calls `useRouter` (§13 :474's 401 is an act) and next-intl's router reads `usePathname`, which
  // the navigation double refuses until a case sets it. A caller that had to remember this would forget it.
  setPathname(`/${locale}${path}`);
}

const gatedUrls: string[] = [];

/**
 * EVERY URL THE LAST GATED RENDER ASKED FOR, in order — the `apiCallsMade()` precedent, for the door that
 * does not go through `lib/api`'s reader.
 *
 * It is what makes "opened only on demand" (§27 :871) a MEASUREMENT rather than a promise: the three
 * extraction reads are absent from this list until the sheet that needs each one is pressed open.
 */
export function gatedFetchUrls(): readonly string[] {
  return [...gatedUrls];
}

/** How deep into §27's three nested sheets a render should press before it hands the tree back. */
export type ExtractionDepth = 0 | 1 | 2 | 3;

/**
 * A MACROTASK, NOT A MICROTASK. Opening one of §27's sheets starts a read: a `useMemo` produces the fetcher,
 * an EFFECT starts it, and `researchFetch` awaits `fetch` and then `response.json()`. A single
 * `await Promise.resolve()` lands between two of those and the tree is still on `loading` — which reads as
 * "the control was never drawn". Draining the timer queue inside `act` settles all of them.
 */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function pressOpen(container: HTMLElement, selector: string, drew: string, what: string): Promise<void> {
  const control = container.querySelector(selector);
  if (control === null) throw new Error(`renderResearchCorpus: nothing drew ${what} to press`);
  await act(async () => {
    fireEvent.click(control);
  });
  await settle();
  if (container.querySelector(drew) === null) throw new Error(`renderResearchCorpus: pressing ${what} opened no ${drew} — the pane drew nothing to scan`);
}

/**
 * `/research/corpus`, RENDERED WHOLE — the PAGE, shell and body, at whichever view the query names.
 *
 * ONE HELPER RATHER THAN ONE PER SCAN, for the reason `renderResearchDashboard` records: several instruments
 * need the same tree, and several stagings of one page is one rule with several implementations. It renders
 * through `renderPage`, so `page.tsx`'s own `<main>`, heading and reading measure are INSIDE every scan that
 * calls it — the blind-probe lesson of R67, where a disclaimer planted on a shell reddened nothing.
 *
 * `depth` presses §27's sheets open in order, because the sheets are half of this view and a scan over the
 * list alone reads the half that mints no hrefs and holds no archive text. `answers` widens the table for a
 * case that needs a different body (a 400, a refusal, a facet that disagrees).
 */
export async function renderResearchCorpus(
  locale: Locale = routing.defaultLocale,
  {
    searchParams = {},
    answers = {},
    depth = 0,
  }: { searchParams?: Record<string, string>; answers?: Record<string, { status: number; body?: unknown }>; depth?: ExtractionDepth } = {},
): Promise<HTMLElement> {
  const corpusPage = (await import('@/app/[locale]/research/corpus/page')).default;
  stageGatedSession(locale, '/research/corpus');
  const fetching = globalFetchDouble({ ...GATED_CORPUS_ANSWERS, ...answers });
  gatedUrls.length = 0;
  try {
    const rendered = await renderPage(corpusPage, { locale }, {
      locale,
      searchParams,
      wrapper: ({ children }) => (
        <TabsProvider>
          {children}
          <RightPane />
        </TabsProvider>
      ),
    });
    if (rendered.notFound) throw new Error('renderResearchCorpus: /research/corpus answered the one 404, not a body');
    await settle();
    if (depth >= 1) await pressOpen(rendered.container, '[data-open-extraction]', '[data-extraction-sheet]', 'the extraction control');
    if (depth >= 2) await pressOpen(rendered.container, '[data-open-rules]', '[data-rules-sheet]', 'the rules control');
    if (depth >= 3) await pressOpen(rendered.container, '[data-open-rule-history]', '[data-rule-history]', "the rule's history control");
    return rendered.container;
  } finally {
    gatedUrls.push(...fetching.calls.map(({ url }) => url));
    fetching.restore();
  }
}

/**
 * `/research/corpus/claims` at `all`, rendered whole, with the first claim's sheet open beside the rows.
 *
 * `open: false` RENDERS WITHOUT PRESSING, because a refused read has no row to press and a case about the
 * page's own chrome — the way back, the filter row — must be able to reach a view that returned nothing.
 * `searchParams` widens the question beyond the page, which is how a case reaches the view WITH a date on it.
 */
export async function renderResearchClaims(
  locale: Locale = routing.defaultLocale,
  { page = 'page-one', searchParams = {}, answers = {}, open = true }: { page?: string; searchParams?: Record<string, string>; answers?: Record<string, { status: number; body?: unknown }>; open?: boolean } = {},
): Promise<HTMLElement> {
  const claimsPage = (await import('@/app/[locale]/research/corpus/claims/page')).default;
  stageGatedSession(locale, '/research/corpus/claims');
  const fetching = globalFetchDouble({ ...GATED_CORPUS_ANSWERS, ...answers });
  gatedUrls.length = 0;
  try {
    const rendered = await renderPage(claimsPage, { locale }, {
      locale,
      searchParams: { page, ...searchParams },
      wrapper: ({ children }) => (
        <TabsProvider>
          {children}
          <RightPane />
        </TabsProvider>
      ),
    });
    if (rendered.notFound) throw new Error('renderResearchClaims: the gated claims view answered the one 404, not a body');
    await settle();
    if (!open) return rendered.container;
    const tap = rendered.container.querySelector('[data-open-claim]');
    if (tap === null) throw new Error('renderResearchClaims: the claims view rendered no row to open');
    await act(async () => {
      fireEvent.click(tap);
    });
    await settle();
    if (rendered.container.querySelector('[data-claim-sheet]') === null) {
      throw new Error('renderResearchClaims: the tap opened no sheet — the pane drew nothing to scan');
    }
    return rendered.container;
  } finally {
    gatedUrls.push(...fetching.calls.map(({ url }) => url));
    fetching.restore();
  }
}

/**
 * A DETACHED COPY OF A GATED PAGE, AS IT STOOD WHEN IT WAS RENDERED — for the scans, which read several
 * surfaces and then examine them all.
 *
 * THE HAZARD IT CLOSES IS SHARED, NOT LOCAL. The pane's active tab lives in `shell/localState.ts`, whose
 * writer calls `notify()` over EVERY listener in the document (:29–:31) — so the moment a later render presses
 * a sheet open, every tree still mounted from an earlier render re-reads the store and changes which panel it
 * is showing. A scan that collected four containers and looked at them afterwards was therefore reading the
 * LAST render's pane four times. Measured on 2026-09-21: a marking-URL anchor planted on the rules panel was
 * invisible to the render arm of `no-marking-link-from-research` for exactly this reason, while two other
 * cases in the same file caught it.
 *
 * A DEEP CLONE IS THE RIGHT SHAPE because a scan reads text, classes, `data-` attributes and hrefs, all of
 * which a clone preserves, and because nothing can mutate it afterwards. A case that PRESSES something wants
 * the live tree and calls the renderer directly — the two names say which is which.
 */
export async function snapshotResearchCorpus(...args: Parameters<typeof renderResearchCorpus>): Promise<HTMLElement> {
  return (await renderResearchCorpus(...args)).cloneNode(true) as HTMLElement;
}

/** The same, for the gated claims lens. */
export async function snapshotResearchClaims(...args: Parameters<typeof renderResearchClaims>): Promise<HTMLElement> {
  return (await renderResearchClaims(...args)).cloneNode(true) as HTMLElement;
}

/** And for `/research`, which every scan of chunk 4 reads the same way. */
export async function snapshotResearchDashboard(...args: Parameters<typeof renderResearchDashboard>): Promise<HTMLElement> {
  return (await renderResearchDashboard(...args)).cloneNode(true) as HTMLElement;
}

/**
 * `/research/theses/[thesisId]`, RENDERED WHOLE — the PAGE, shell and body (UI-8 chunk 7a).
 *
 * ONE HELPER RATHER THAN ONE PER SCAN, for the reason `renderResearchDashboard` records: `bidi-isolated`,
 * `no-id-as-text`, `no-context-line`, `no-disclaimer-off-the-thesis`, `no-door-before-it-exists` and
 * `no-marking-link-from-research` all need the same tree, and several stagings of one page is one rule with
 * several implementations.
 *
 * THE DEFAULT BODY IS THE ONE WITH WORK OWED ON IT (`thesisContextOwed`), because a scan reading this page
 * must meet the region that carries the dates, the records and the commands — a thesis owing nothing draws one
 * line there, and a scan over that tree examines less than the page can show.
 *
 * TWO READS ARE STAGED, because the page makes two: the thesis (A4 :1476) and the owed list (A4 :1523), whose
 * entries this page KEEPS by `thesisId`. `answers` widens the table for a case that needs another body — a
 * refusal, a colleague's thesis, a withdrawn one.
 *
 * IT FAILS LOUDLY when the page draws no context block, because a scan over a half-rendered tree examines less
 * than it thinks it does.
 */
export async function renderResearchThesis(
  locale: Locale = routing.defaultLocale,
  {
    context = thesisContextOwed,
    answers = {},
    withPane = false,
  }: { context?: ThesisContext; answers?: Record<string, { status: number; body?: unknown }>; withPane?: boolean } = {},
): Promise<HTMLElement> {
  const thesisPage = (await import('@/app/[locale]/research/theses/[thesisId]/page')).default;
  // THE URL NAMES THE BODY'S OWN THESIS, always. A helper whose path and whose body could disagree would let a
  // case pass over a page reading someone else's thesis.
  const thesisId = context.thesis.thesisId;
  stageGatedSession(locale, `/research/theses/${thesisId}`);
  const fetching = globalFetchDouble({
    [`/api/research/theses/${thesisId}`]: { status: 200, body: context },
    '/api/research/reviews': { status: 200, body: thesisReviewsOwed },
    ...answers,
  });
  gatedUrls.length = 0;
  try {
    // WITH THE PANE MOUNTED, the page's declared tabs are DRAWN — the default wrapper provides `TabsProvider`
    // and never `<RightPane/>`, so a case reading the pane without this would examine an unexercised property
    // and pass. The precedent, and the same reason, is `noDoorBeforeItExists.test.tsx` :188–:194.
    const rendered = await renderPage(
      thesisPage,
      { locale, thesisId },
      withPane
        ? {
            locale,
            wrapper: ({ children }) => (
              <TabsProvider>
                {children}
                <RightPane />
              </TabsProvider>
            ),
          }
        : { locale },
    );
    if (rendered.notFound) throw new Error('renderResearchThesis: the working view answered the one 404, not a body');
    await settle();
    return rendered.container;
  } finally {
    gatedUrls.push(...fetching.calls.map(({ url }) => url));
    fetching.restore();
  }
}

/** The same, detached, for the scans that read several surfaces and examine them afterwards. */
export async function snapshotResearchThesis(...args: Parameters<typeof renderResearchThesis>): Promise<HTMLElement> {
  return (await renderResearchThesis(...args)).cloneNode(true) as HTMLElement;
}
