import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadEnvConfig } from '@next/env';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { StagingBanner } from '@/components/StagingBanner';
import { ancestorsOf, messagesFor, nextIntlServer, renderServer, renderWithIntl, textNodes } from './render';
import { FRONTEND, SRC, importsOf, packageNameOf, requireSubjects, sourceFiles } from './scan';

// ---------------------------------------------------------------------------
// THE HARNESS'S OWN CASES — docs/gf-ui-refactor-plan.md UI-1.
//
// The helpers hold nothing themselves; these are what makes each one trustworthy
// before the first page step inherits it: the vacuity guard observed to fail, the
// suite's environment proven to read no `.env`, the render helper exercised once
// against a KEEP component (StagingBanner, a Server Component), and the resolved-
// import helper exercised against the side-effect import a regex once missed.
// ---------------------------------------------------------------------------

/** Sets APP_ENV for one body and puts back what was there — never read from a file. */
async function withAppEnv(value: string | undefined, body: () => Promise<void>): Promise<void> {
  const before = { APP_ENV: process.env.APP_ENV, DEMO_MODE: process.env.DEMO_MODE };
  const assign = (name: 'APP_ENV' | 'DEMO_MODE', next: string | undefined) => {
    if (next === undefined) delete process.env[name];
    else process.env[name] = next;
  };
  assign('APP_ENV', value);
  assign('DEMO_MODE', undefined);
  try {
    await body();
  } finally {
    assign('APP_ENV', before.APP_ENV);
    assign('DEMO_MODE', before.DEMO_MODE);
  }
}

function label(locale: 'he' | 'en'): string {
  const banner = messagesFor(locale).stagingBanner;
  if (typeof banner !== 'object' || typeof banner.label !== 'string') throw new Error(`messages/${locale}.json has no stagingBanner.label`);
  return banner.label;
}

describe('the harness — test/scan.ts and test/render.tsx', () => {
  it('requireSubjects fails on an empty subject set, naming what was empty', () => {
    expect(() => requireSubjects('the planted empty set', [])).toThrow(
      'the planted empty set: an empty subject set — a scan that examined nothing is not a pass',
    );
    expect(requireSubjects('one subject', ['x'])).toEqual(['x']);
  });

  it("no env file reaches the suite: @next/env's loadEnvConfig on the frontend loads none", () => {
    const silent = { info: () => undefined, error: () => undefined };
    const { loadedEnvFiles } = loadEnvConfig(FRONTEND, false, silent, true);
    expect(loadedEnvFiles.map((loaded) => loaded.path)).toEqual([]);
  });

  it('StagingBanner on staging renders its Hebrew label from the real messages, inside its role="status" element', async () => {
    await withAppEnv('staging', async () => {
      const { container } = await renderServer(() => StagingBanner(), { locale: 'he' });
      const texts = textNodes(container);
      expect(texts.map((text) => text.data)).toEqual([label('he')]);
      const first = texts.at(0);
      if (first === undefined) throw new Error('textNodes returned no node past its own guard');
      expect(ancestorsOf(first).some((element) => element.getAttribute('role') === 'status')).toBe(true);
    });
  });

  it('StagingBanner on staging renders its English label under locale en', async () => {
    await withAppEnv('staging', async () => {
      const { container } = await renderServer(() => StagingBanner(), { locale: 'en' });
      expect(textNodes(container).map((text) => text.data)).toEqual([label('en')]);
    });
  });

  it('a rendered tree with no text fails the vacuity guard — StagingBanner with APP_ENV unset', async () => {
    await withAppEnv(undefined, async () => {
      const { container } = await renderServer(() => StagingBanner());
      expect(() => textNodes(container)).toThrow('text nodes of the rendered tree: an empty subject set');
    });
  });

  it('importsOf resolves a side-effect import: ClientProviders.tsx → lib/stagingApiAuth.ts, and @/context/AuthContext → context/AuthContext.tsx', () => {
    expect(importsOf(join(SRC, 'components', 'ClientProviders.tsx'))).toEqual([
      { specifier: '@/lib/stagingApiAuth', module: 'src/lib/stagingApiAuth.ts' },
      { specifier: '@/context/AuthContext', module: 'src/context/AuthContext.tsx' },
    ]);
  });

  it('the next-intl/server stand-in refuses what it does not double, and getTranslations outside a server render', async () => {
    const getFormatter = nextIntlServer.getFormatter;
    expect(typeof getFormatter).toBe('function');
    expect(() => (getFormatter as () => unknown)()).toThrow('next-intl/server.getFormatter is not doubled in test/render.tsx');
    await expect(nextIntlServer.getTranslations('stagingBanner')).rejects.toThrow('no request locale');
  });

  it('renderWithIntl renders the wrapper inside NextIntlClientProvider', () => {
    function Labelled({ children }: { children: ReactNode }) {
      const t = useTranslations('stagingBanner');
      return (
        <section>
          {t('label')}
          {children}
        </section>
      );
    }
    const { container } = renderWithIntl(<span />, { locale: 'he', wrapper: Labelled });
    expect(textNodes(container).map((text) => text.data)).toEqual([label('he')]);
  });

  it('a missing message THROWS through renderWithIntl, naming what is missing — never renders the key as text', () => {
    function Missing({ namespace, messageKey }: { namespace: string; messageKey: string }) {
      const t = useTranslations(namespace);
      return <p>{t(messageKey)}</p>;
    }
    expect(() => renderWithIntl(<Missing namespace="r51NoSuchNamespace" messageKey="label" />)).toThrow('MISSING_MESSAGE: r51NoSuchNamespace');
    expect(() => renderWithIntl(<Missing namespace="stagingBanner" messageKey="r51NoSuchKey" />)).toThrow('stagingBanner.r51NoSuchKey');
  });

  it('a missing message THROWS through renderServer, naming what is missing — never renders the key as text', async () => {
    async function MissingServer({ namespace, messageKey }: { namespace: string; messageKey: string }) {
      const t = await getTranslations(namespace);
      return <p>{t(messageKey)}</p>;
    }
    await expect(renderServer(() => MissingServer({ namespace: 'r51NoSuchNamespace', messageKey: 'label' }))).rejects.toThrow(
      'MISSING_MESSAGE: r51NoSuchNamespace',
    );
    await expect(renderServer(() => MissingServer({ namespace: 'stagingBanner', messageKey: 'r51NoSuchKey' }))).rejects.toThrow(
      'stagingBanner.r51NoSuchKey',
    );
  });

  it('every package a file under test/ imports is declared in the frontend package.json', () => {
    const manifest = JSON.parse(readFileSync(join(FRONTEND, 'package.json'), 'utf8')) as Record<string, Record<string, string> | undefined>;
    const declared = new Set(['dependencies', 'devDependencies', 'optionalDependencies'].flatMap((field) => Object.keys(manifest[field] ?? {})));
    const undeclared = sourceFiles(join(FRONTEND, 'test'), ['.ts', '.tsx']).flatMap((file) =>
      importsOf(file)
        .map((found) => packageNameOf(found.specifier))
        .filter((name): name is string => name !== null && !declared.has(name))
        .map(
          (name) =>
            `${relative(FRONTEND, file)} imports '${name}', which apps/glass-fortress/frontend/package.json does not declare — it resolves only by hoisting`,
        ),
    );
    expect(undeclared).toEqual([]);
  });

  it('importsOf reads every file under src without throwing — every local import resolves to a file', () => {
    const files = sourceFiles(SRC, ['.ts', '.tsx']);
    const resolved = files.flatMap((file) => importsOf(file));
    expect(resolved.filter((found) => found.module !== null).length).toBeGreaterThan(0);
  });
});
