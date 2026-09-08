import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import en from '../../frontend/messages/en.json';
import he from '../../frontend/messages/he.json';

// ---------------------------------------------------------------------------
// THE MARKING PAGE'S LABELS — every key the page READS exists in BOTH catalogues.
//
// WHY THIS EXISTS. `next-intl` renders a missing key as the key itself, so a
// string added to `he.json` and forgotten in `en.json` — or a key the page reads
// and neither catalogue carries — appears on screen as `gate4TrustTick`. The
// place that happens is the JUDGING moment: a stop panel is the one screen a
// researcher reads under time pressure, and a raw key there is a question they
// cannot answer. The page has no test runner of its own and no compiler crosses
// from a `t('…')` call to a JSON catalogue, so this lives here, exactly as
// survivalLabelParity, provenanceLabelParity and reportLabelParity do for their
// own boundaries — same shape, different edge, and none of them loosened.
//
// IT READS THE PAGE, NOT A LIST. A hand-kept list of keys is the copy that
// drifts: it would be updated by the same commit that forgot the catalogue. So
// the keys are scanned out of `MarkingClient.tsx` itself, and a key that stops
// being read simply stops being checked.
//
// OBSERVED RED BEFORE GREEN, TWICE. 2026-09-07: with `gate4TrustTick` deleted
// from `en.json`, the second case failed naming exactly that key and that
// locale. 2026-09-08: with `stopHeading` — retired when the stop panel went —
// left in the last case's list, that case failed naming it. A scan nobody has
// seen fail is a scan that may be looking at nothing.
//
// WHAT IT CANNOT SEE, stated so nobody reads it as more than it is: the scan
// matches `t('literal')` only. `t(moment)` — the page's one dynamic lookup,
// whose value is `momentDefining` or `momentCorrecting` — is invisible to it,
// so those two keys are checked by nothing here. Found 2026-09-07 while
// retiring keys: they came back as "unread" from this same regex and were kept
// only because the page was read. A scan over computed keys would need the
// page's control flow, which is a type-checker's job and not a regex's.
//
// THE VACUITY GUARD IS NOT OPTIONAL. An empty scan reporting success is this
// repository's recurring defect, so the last case asserts the scan found a
// plausible number of keys and that the gate blocks' keys are among them — if
// the page is refactored so the regex matches nothing, this fails rather than
// passing quietly.
// ---------------------------------------------------------------------------

type Catalog = Record<string, Record<string, string>>;

const CATALOGS: [locale: string, messages: Catalog][] = [
  ['en', en as unknown as Catalog],
  ['he', he as unknown as Catalog],
];

const PAGE = join(
  __dirname,
  '..',
  '..',
  'frontend',
  'src',
  'app',
  '[locale]',
  'article-rules',
  '[trackedUrlId]',
  '[capture]',
  'MarkingClient.tsx',
);

/** Every `t('key')` the page reads — the namespace is `marking`, fixed by its `useTranslations`. */
function keysReadByThePage(): string[] {
  const source = readFileSync(PAGE, 'utf8');
  const read = [...source.matchAll(/\bt\(\s*'([A-Za-z0-9_]+)'/g)].map((m) => m[1] ?? '');
  return [...new Set(read)].sort();
}

describe('the marking page’s labels exist in both catalogues', () => {
  const keys = keysReadByThePage();

  it('both catalogues carry the same key set under "marking"', () => {
    const [enKeys, heKeys] = CATALOGS.map(([, messages]) => Object.keys(messages['marking'] ?? {}).sort());
    expect({ onlyInEn: enKeys?.filter((k) => !(heKeys ?? []).includes(k)) }).toEqual({ onlyInEn: [] });
    expect({ onlyInHe: heKeys?.filter((k) => !(enKeys ?? []).includes(k)) }).toEqual({ onlyInHe: [] });
  });

  for (const [locale, messages] of CATALOGS) {
    it(`${locale}.json carries every key MarkingClient.tsx reads`, () => {
      const namespace = messages['marking'] ?? {};
      const missing = keys.filter((key) => !(key in namespace));
      expect({ locale, missing }).toEqual({ locale, missing: [] });
    });
  }

  it('the scan examined the page and found the judging moment’s keys', () => {
    expect(keys.length).toBeGreaterThan(55);
    for (const key of ['approveMeaning', 'draftSwitchStartHere', 'save', 'markedHeading', 'otherDraft']) {
      expect(keys).toContain(key);
    }
  });
});
