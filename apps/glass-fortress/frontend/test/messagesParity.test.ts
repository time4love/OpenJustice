import { routing } from '@/i18n/routing';
import { messageCatalogs, requireSubjects } from './scan';

// ---------------------------------------------------------------------------
// messages-parity — docs/gf-ui-refactor-plan.md UI-1 and §5 (the plan's own
// instrument, pulled forward from UI-10 when §8 named the hazard: six steps edit
// the messages before the cut-over).
//
// Every catalog has the same key set as every other, NESTED, BY PATH — so a label
// added in one locale and not the other fails here before a reader meets a
// missing string. A path is compared as the array of its keys, never as a dotted
// string, so a key containing "." cannot collide with a nested pair. A path that
// is a leaf in one catalog and a branch in another is two different key sets and
// fails on both sides.
//
// THE CATALOG SET IS THE ROUTER'S. The locales are `src/i18n/routing.ts`' list, never spelled here: every locale the
// site serves has a catalog, and no catalog exists for a locale it does not serve.
// ---------------------------------------------------------------------------

const LOCALES: readonly string[] = [...routing.locales];

describe('messages-parity', () => {
  it('messages/he.json and messages/en.json have equal key sets, nested, by path', () => {
    const catalogs = requireSubjects('message catalogs', messageCatalogs());
    const keySets = catalogs.map((catalog) => ({
      file: catalog.file,
      paths: new Map(requireSubjects(`leaves of ${catalog.file}`, catalog.leaves).map((leaf) => [JSON.stringify(leaf.path), leaf.path.join('.')])),
    }));
    const differences = keySets.flatMap((one) =>
      keySets
        .filter((other) => other !== one)
        .flatMap((other) =>
          [...one.paths]
            .filter(([key]) => !other.paths.has(key))
            .map(([, readable]) => `${readable} is in ${one.file} and not in ${other.file}`),
        ),
    );
    expect(differences).toEqual([]);
  });

  it("every locale of src/i18n/routing.ts has its catalog, and every catalog is one of those locales", () => {
    const found = messageCatalogs().map((catalog) => catalog.locale);
    const missing = requireSubjects('routing.locales', LOCALES)
      .filter((locale) => !found.includes(locale))
      .map((locale) => `routing.locales names '${locale}', and messages/${locale}.json does not exist`);
    const extra = found
      .filter((locale) => !LOCALES.includes(locale))
      .map((locale) => `messages/${locale}.json exists for '${locale}', which routing.locales does not name`);
    expect([...missing, ...extra]).toEqual([]);
  });

  it('examined something: both catalogs carry leaves, and at least one path is two keys deep', () => {
    const catalogs = messageCatalogs();
    for (const catalog of catalogs) {
      expect(catalog.leaves.length).toBeGreaterThan(0);
      expect(catalog.leaves.some((leaf) => leaf.path.length >= 2)).toBe(true);
    }
  });
});
