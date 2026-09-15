import type { ComponentType, ReactElement, ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { NextIntlClientProvider, createTranslator, type AbstractIntlMessages } from 'next-intl';
import { routing } from '@/i18n/routing';
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
 * A server component rendered: the request locale set on the stand-in for the await and cleared after it, the
 * component awaited, its element rendered under the provider (an empty fragment for `null` — the tree's reader refuses it, not this).
 * Callers: the harness' H-3, H-4, H-5 (UI-1); UI-5's server pages, if its step renders them on the server; UI-9.
 */
export async function renderServer(component: () => Promise<ReactElement | null>, options: RenderOptions = {}): Promise<RenderResult> {
  const locale = options.locale ?? routing.defaultLocale;
  nextIntlServer.setRequestLocale(locale);
  let element: ReactElement | null;
  try {
    element = await component();
  } finally {
    // The locale belongs to ONE server render; a translation asked for outside one is a refusal, not the last case's locale.
    requestLocale = undefined;
  }
  return renderWithIntl(element ?? <></>, { ...options, locale });
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
