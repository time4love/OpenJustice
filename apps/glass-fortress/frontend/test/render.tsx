import { createElement, type ComponentType, type ReactElement, type ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { NextIntlClientProvider, createTranslator, type AbstractIntlMessages } from 'next-intl';
import type { ResearcherProfile } from '@/context/AuthContext';
import { routing } from '@/i18n/routing';
import { TabsProvider } from '@/components/shell/RightPane';
import { messageCatalogs, requireSubjects } from './scan';

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
