import { existsSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import * as localeLayout from '@/app/[locale]/layout';
import { routing } from '@/i18n/routing';
import { serverElement, type Locale } from './render';
import { FRONTEND, SRC, importsOf, jsxTagsIn, sourceFiles } from './scan';

// ---------------------------------------------------------------------------
// THE LOCALE LAYOUT OWNS THE DOCUMENT — the UI-4 follow-up ruled by the researcher, 2026-09-15.
//
// The staging exercise after #490 found `/en/about` keeping `<html lang="he" dir="rtl">` once the locale anchor was
// followed: `<html>` was rendered by `app/layout.tsx`, above the `[locale]` segment, from the request's locale — and a
// soft navigation never re-renders a layout whose segment did not change. So the ROOT layout is `app/[locale]/layout.tsx`
// (next docs, file-conventions/layout.md :140–:146: "The root layout can be under a dynamic segment"), and the document's
// `lang` and `dir` come from its own `params.locale`.
//
// WHAT NO CASE HERE CAN SEE: the soft navigation itself, and React applying the new `<html>` attributes on it. Those are
// read on staging after LAND — the defect's own reproduction. What is held here is the structure that makes it right.
// ---------------------------------------------------------------------------

const LOCALE_LAYOUT = 'src/app/[locale]/layout.tsx';
const LOCALE_FACTS = 'src/lib/localeFacts.ts';
/**
 * The share image's convention file. A metadata image file applies to its route segment (next docs,
 * file-conventions/01-metadata/opengraph-image.md :6, :17, :82): at `src/app/`, with the root layout moved under the locale,
 * no page's <head> carried og:image any more (the staging read after #491) — so it lives in the locale segment.
 */
const LOCALE_SHARE_IMAGE = 'src/app/[locale]/opengraph-image.tsx';
const IMAGE_FILE_TYPES = ['.png', '.jpg', '.jpeg', '.gif'];

/** The expected document per locale — literal. The locale set is asserted too, so a new locale forces these to be read. */
const DOCUMENT = {
  he: { dir: 'rtl', title: 'צדק לעם - תיק הקורונה', ogLocale: 'he_IL' },
  en: { dir: 'ltr', title: 'Justice for the People — The Covid Case', ogLocale: 'en_US' },
} as const;

const LOCALES: readonly Locale[] = routing.locales;

function htmlScanSubjects(): string[] {
  return sourceFiles(join(SRC, 'app'), ['.ts', '.tsx']);
}

async function rootElementOf(locale: Locale): Promise<ReactElement<Record<string, unknown>>> {
  const element = await serverElement(() => localeLayout.default({ children: null, params: Promise.resolve({ locale }) }), { locale });
  if (!isValidElement<Record<string, unknown>>(element)) throw new Error(`app/[locale]/layout.tsx rendered no element under ${locale}`);
  return element;
}

function childElements(children: unknown): ReactElement[] {
  const list: ReactNode[] = Array.isArray(children) ? (children as ReactNode[]) : [children as ReactNode];
  return list.filter((child): child is ReactElement => isValidElement(child));
}

describe('the locale layout owns the document', () => {
  it('exactly one file under src/app renders <html>: app/[locale]/layout.tsx', () => {
    const rendering = htmlScanSubjects()
      .filter((file) => jsxTagsIn(file).some((found) => found.tag === 'html'))
      .map((file) => relative(FRONTEND, file));
    expect(rendering).toEqual([LOCALE_LAYOUT]);
  });

  it('no layout above the locale: src/app/layout.tsx does not exist (next docs layout.md :142–:146)', () => {
    expect(existsSync(join(SRC, 'app', 'layout.tsx'))).toBe(false);
  });

  it("for every locale of routing.locales, the locale layout's root element is <html lang={locale}> holding <body>", async () => {
    expect(LOCALES).toEqual(Object.keys(DOCUMENT));
    const found: Record<string, { type: string; lang: unknown; body: boolean }> = {};
    for (const locale of LOCALES) {
      const root = await rootElementOf(locale);
      found[locale] = {
        type: typeof root.type === 'string' ? root.type : '<component>',
        lang: root.props.lang,
        body: childElements(root.props.children).some((child) => child.type === 'body'),
      };
    }
    expect(found).toEqual({ he: { type: 'html', lang: 'he', body: true }, en: { type: 'html', lang: 'en', body: true } });
  });

  it("the document direction per locale: he → rtl, en → ltr, from the locale layout's <html dir>", async () => {
    const found: Record<string, unknown> = {};
    for (const locale of LOCALES) found[locale] = (await rootElementOf(locale)).props.dir;
    expect(found).toEqual({ he: DOCUMENT.he.dir, en: DOCUMENT.en.dir });
  });

  it("the locale layout's generateMetadata answers its param's locale: the title is common.appName, og:locale he_IL / en_US", async () => {
    if (!('generateMetadata' in localeLayout) || typeof localeLayout.generateMetadata !== 'function') {
      throw new Error('generateMetadata is not exported by app/[locale]/layout.tsx');
    }
    const generate = localeLayout.generateMetadata as (props: { params: Promise<{ locale: string }> }) => Promise<{
      title?: unknown;
      openGraph?: { siteName?: unknown; locale?: unknown } | null;
    }>;
    const found: Record<string, { title: unknown; siteName: unknown; ogLocale: unknown }> = {};
    for (const locale of LOCALES) {
      const metadata = await generate({ params: Promise.resolve({ locale }) });
      found[locale] = { title: metadata.title, siteName: metadata.openGraph?.siteName, ogLocale: metadata.openGraph?.locale };
    }
    expect(found).toEqual({
      he: { title: DOCUMENT.he.title, siteName: DOCUMENT.he.title, ogLocale: DOCUMENT.he.ogLocale },
      en: { title: DOCUMENT.en.title, siteName: DOCUMENT.en.title, ogLocale: DOCUMENT.en.ogLocale },
    });
  });

  it("the <html> dir is spelled once: an element access on DIRECTION, imported from src/lib/localeFacts.ts", () => {
    const layout = join(FRONTEND, LOCALE_LAYOUT);
    const html = jsxTagsIn(layout).find((found) => found.tag === 'html');
    const importsFacts = importsOf(layout).some((found) => found.module === LOCALE_FACTS);
    expect({ dir: html?.attributes.dir ?? null, importsFacts }).toEqual({ dir: 'DIRECTION[locale]', importsFacts: true });
  });

  it("the share image is the locale segment's: opengraph-image lives in src/app/[locale]/ and none remains at src/app/", () => {
    const code = htmlScanSubjects()
      .filter((file) => basename(file).startsWith('opengraph-image.'))
      .map((file) => relative(FRONTEND, file));
    const images = ['src/app', 'src/app/[locale]']
      .flatMap((dir) => IMAGE_FILE_TYPES.map((type) => `${dir}/opengraph-image${type}`))
      .filter((file) => existsSync(join(FRONTEND, file)));
    expect([...code, ...images]).toEqual([LOCALE_SHARE_IMAGE]);
  });
});
