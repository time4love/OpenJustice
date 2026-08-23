import * as fs from 'fs';
import * as path from 'path';
import {
  extractArticleText,
  extractRawText,
  normaliseForPresence,
} from '../../src/lib/archiveText';

// ---------------------------------------------------------------------------
// The real instance of EXTRACTION_DIVERGENCE.
//
// Fixture: the raw HTML of
//   https://web.archive.org/web/20220905111109id_/https://corona.health.gov.il/vaccine-for-covid/
// frozen to disk so this never touches the network. To refresh it, re-fetch
// that exact URL — do not hand-edit it, because its value is that it is a
// verbatim capture rather than a constructed example.
//
// The phrase below is on that page. This platform's extraction does not
// contain it, which is why a real thesis went on to claim the sentence had
// been ADDED the following day. A verification tool built on UrlSnapshot
// .fullText would have confirmed that false claim; this test is what stops the
// divergence check from quietly becoming such a tool.
//
// This is also why the `extraction` jest project exists: every other test in
// this suite mocks jsdom and Readability away, and against a stubbed
// Readability this file would assert the stub.
// ---------------------------------------------------------------------------

const CAPTURE_URL =
  'http://web.archive.org/web/20220905111109id_/https://corona.health.gov.il/vaccine-for-covid/';

/** On the page at capture 20220905111109. Absent from Readability's article. */
const DIVERGENT_PHRASE = 'נמצאו יעילים ובטוחים לשימוש';

function fixture(name: string): string {
  return fs.readFileSync(path.join(__dirname, '..', 'fixtures', name), 'utf-8');
}

describe('archived-page extraction — raw vs. the platform’s reading', () => {
  const html = fixture('wayback-vaccine-20220905111109-raw.html');
  const raw = normaliseForPresence(extractRawText(html));
  const extracted = normaliseForPresence(extractArticleText(html, CAPTURE_URL));

  it('finds the phrase in the raw archived document', () => {
    expect(raw).toContain(DIVERGENT_PHRASE);
  });

  it('does NOT find it in the platform’s Readability extraction — the divergence', () => {
    expect(extracted).not.toContain(DIVERGENT_PHRASE);
  });

  it('agrees with the frozen extraction the scanner actually stored for this capture', () => {
    // wayback-vaccine-2022-09-05.txt was produced by WaybackScraper.scrapeSnapshot()
    // against this same capture. If the extractor is refactored and starts
    // keeping this phrase, that fixture and this expectation must move together
    // — the point is that the two readings of one page are measured, not assumed.
    const stored = normaliseForPresence(fixture('wayback-vaccine-2022-09-05.txt'));
    expect(stored).not.toContain(DIVERGENT_PHRASE);
    expect(extracted).not.toContain(DIVERGENT_PHRASE);
  });

  it('drops a substantial fraction of the page, which is the reason to check raw', () => {
    expect(extracted.length).toBeLessThan(raw.length);
    // Not an exact ratio — Readability's output is not a stable contract. The
    // assertion is that the gap is large enough to hide whole sentences, which
    // is the property the verification tools depend on.
    expect(extracted.length / raw.length).toBeLessThan(0.9);
  });

  it('strips script bodies from the raw reading, so markup is never mistaken for page text', () => {
    expect(html).toContain('<script');
    expect(raw).not.toContain('function(');
  });
});
