import {
  applyChromeRuleset,
  chromeRulesetId,
  chromeTextVersion,
  EMPTY_CHROME_RULESET,
  isEmptyRuleset,
  type ChromeRuleset,
} from '../../src/lib/chromeRuleset';
import { deriveTextUnderRuleset } from '../../src/lib/chromeRuleset';
import { deriveText, TEXT_EXTRACTION_VERSION } from '../../src/lib/captureDocument';

// ---------------------------------------------------------------------------
// LEVEL 4 — the view, and the property the existing corpus depends on.
//
// IN test/extraction/ ON PURPOSE. This project transforms node_modules so the
// REAL jsdom runs; the `unit` project mocks it away, and a mocked
// querySelectorAll would make every assertion below a statement about the stub.
// Same reasoning jest.config.ts already records for the extractor: what these
// rules actually remove from real markup is the whole question.
//
// The first describe block is the one that matters most and it asserts a
// NEGATIVE: without a ruleset, nothing about derivation changes — not the text,
// not the hash, not the version string. Every capture ever derived stays
// comparable to every other, nothing recomputes, and no stored verdict goes
// stale. A regression there would be silent and corpus-wide.
//
// The second block is the acceptance test: two captures that differ ONLY in a
// rotating advertisement must hash the SAME under a ruleset and DIFFERENTLY
// without one. That is the whole mechanism — novelty is keyed on textHash, so
// equal hashes mean the second capture never becomes a row.
// ---------------------------------------------------------------------------

/** A page with the three shapes that matter: nav, a rotating slot, and article text. */
function page(advert: string): string {
  return `<!doctype html><html><body>
    <nav class="site-nav"><a href="/">Home</a><a href="/about">About</a></nav>
    <div class="promo" id="ad-slot"><span>${advert}</span></div>
    <main><article>
      <h1>Vaccine safety information</h1>
      <p>The Ministry recommends vaccination for children from six months of age.</p>
      <p>To report side effects, use the reporting channel.</p>
    </article></main>
    <footer class="site-footer">Ministry of Health &copy; 2022</footer>
  </body></html>`;
}

const bytes = (html: string): Buffer => Buffer.from(html, 'utf8');
const CHROME: ChromeRuleset = { selectors: ['nav.site-nav', '#ad-slot', 'footer.site-footer'] };

describe('without a ruleset, derivation is exactly what it was', () => {
  it('produces the same text, hash and version as before this level existed', () => {
    const html = page('Buy now — 50% off');

    const bare = deriveText(bytes(html), 'text/html; charset=utf-8');
    const explicitlyNone = deriveText(bytes(html), 'text/html; charset=utf-8', null);
    const empty = deriveTextUnderRuleset(bytes(html), 'text/html; charset=utf-8', null, EMPTY_CHROME_RULESET);

    expect(bare.textExtractionVersion).toBe(TEXT_EXTRACTION_VERSION);
    expect(explicitlyNone).toEqual(bare);
    expect(empty.text).toBe(bare.text);
    expect(empty.textHash).toBe(bare.textHash);
    // An empty ruleset must not append an identity: the view is unchanged, so a
    // version that moved would report every stored verdict stale for nothing.
    expect(empty.textExtractionVersion).toBe(TEXT_EXTRACTION_VERSION);
  });

  it('attaches no chrome report, so nothing downstream sees a new field', () => {
    const derived = deriveText(bytes(page('advert')), 'text/html');
    expect('chrome' in derived).toBe(false);
  });

  it('still contains the furniture — this level is opt-in, not a default', () => {
    const derived = deriveText(bytes(page('Buy now')), 'text/html');
    expect(derived.text).toContain('Buy now');
    expect(derived.text).toContain('Ministry of Health');
  });
});

describe('the acceptance test: a rotating slot stops creating rows', () => {
  it('two captures differing only in the advert hash the SAME under a ruleset', () => {
    // Novelty is keyed on textHash against the immediately preceding capture, so
    // equal hashes mean the second capture is never stored. This is the entire
    // mechanism, and it is why an FDA-scale page is worth scanning at all.
    const first = deriveTextUnderRuleset(bytes(page('Advert A')), 'text/html', null, CHROME);
    const second = deriveTextUnderRuleset(bytes(page('Advert B')), 'text/html', null, CHROME);

    expect(second.textHash).toBe(first.textHash);
  });

  it('and hash DIFFERENTLY without one — the defect, reproduced', () => {
    const first = deriveText(bytes(page('Advert A')), 'text/html');
    const second = deriveText(bytes(page('Advert B')), 'text/html');

    expect(second.textHash).not.toBe(first.textHash);
  });

  it('while a real edit to the article STILL changes the hash under the same ruleset', () => {
    // The failure that would make this level worthless: rules that collapse the
    // advert AND the article. A four-word safety edit is smaller than a swapped
    // advert, and it must still be seen.
    const before = deriveTextUnderRuleset(bytes(page('Advert A')), 'text/html', null, CHROME);
    const edited = page('Advert A').replace('from six months of age', 'from five years of age');
    const after = deriveTextUnderRuleset(bytes(edited), 'text/html', null, CHROME);

    expect(after.textHash).not.toBe(before.textHash);
    expect(after.text).toContain('five years');
  });
});

describe('what the rules removed is reported, because a human must see it', () => {
  it('carries the removed text, not just the text that survived', () => {
    const derived = deriveTextUnderRuleset(bytes(page('Buy now — 50% off')), 'text/html', null, CHROME);

    expect(derived.text).not.toContain('Buy now');
    expect(derived.chrome?.removedText).toContain('Buy now');
    expect(derived.chrome?.removedText).toContain('Ministry of Health');
  });

  it('makes OVER-MATCHING visible — the dangerous direction', () => {
    // A ruleset that swallows the article looks perfect in the kept text: what
    // remains is clean, short and plausible. The only place the mistake shows is
    // the removed half, which is why it is computed here rather than left to a
    // surface that might not ask for it.
    const greedy: ChromeRuleset = { selectors: ['main'] };
    const derived = deriveTextUnderRuleset(bytes(page('advert')), 'text/html', null, greedy);

    expect(derived.text).not.toContain('six months of age');
    expect(derived.chrome?.removedText).toContain('six months of age');
  });
});

describe('matchCounts is the null check, and it is a count rather than a judgement', () => {
  it('reports zero for a selector that no longer matches the page', () => {
    const stale: ChromeRuleset = { selectors: ['#ad-slot', '.redesigned-away'] };
    const applied = applyChromeRuleset(page('advert'), stale);

    expect(applied.matchCounts['#ad-slot']).toBe(1);
    expect(applied.matchCounts['.redesigned-away']).toBe(0);
  });

  it('does not decide anything about a zero — nothing here classifies', () => {
    const applied = applyChromeRuleset(page('advert'), { selectors: ['.nothing'] });
    expect(applied.removedText).toBe('');
    expect(applied.invalidSelectors).toEqual([]);
  });
});

describe('a malformed selector costs a rule, never a capture', () => {
  it('records it and applies the rest', () => {
    const broken: ChromeRuleset = { selectors: ['#ad-slot', ':::not-a-selector'] };
    const applied = applyChromeRuleset(page('Buy now'), broken);

    expect(applied.invalidSelectors).toEqual([':::not-a-selector']);
    // The valid rule still ran — a typo in one selector must not silently
    // disable the ruleset.
    expect(applied.matchCounts['#ad-slot']).toBe(1);
    expect(applied.removedText).toContain('Buy now');
  });

  it('is distinguishable from a selector that matched nothing', () => {
    // Different facts: one is a broken rule, the other is a rule whose page
    // changed. Folding the first into matchCounts as a zero would make a typo
    // look like a redesign.
    const applied = applyChromeRuleset(page('advert'), {
      selectors: [':::broken', '.absent'],
    });
    expect(applied.invalidSelectors).toEqual([':::broken']);
    expect(applied.matchCounts).toEqual({ '.absent': 0 });
  });
});

describe('a ruleset identity commits to the view, not to how it was written', () => {
  it('is insensitive to order and duplicates', () => {
    const a = chromeRulesetId({ selectors: ['nav', '#ad'] });
    const b = chromeRulesetId({ selectors: ['#ad', 'nav', '#ad'] });
    const c = chromeRulesetId({ selectors: [' nav ', '#ad'] });

    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('differs when the view differs', () => {
    expect(chromeRulesetId({ selectors: ['nav'] })).not.toBe(chromeRulesetId({ selectors: ['#ad'] }));
  });

  it('appends the identity to the version only when there are rules', () => {
    expect(chromeTextVersion('v2-base', null)).toBe('v2-base');
    expect(chromeTextVersion('v2-base', EMPTY_CHROME_RULESET)).toBe('v2-base');
    expect(chromeTextVersion('v2-base', CHROME)).toBe(`v2-base+chrome-${chromeRulesetId(CHROME)}`);
  });

  it('recognises an empty ruleset however it is expressed', () => {
    expect(isEmptyRuleset(null)).toBe(true);
    expect(isEmptyRuleset(undefined)).toBe(true);
    expect(isEmptyRuleset(EMPTY_CHROME_RULESET)).toBe(true);
    expect(isEmptyRuleset(CHROME)).toBe(false);
  });
});
