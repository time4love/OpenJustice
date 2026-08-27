import { extractHrefs } from '../src/services/measureHrefChanges';

describe('extractHrefs', () => {
  it('handles all three quoting forms, because real HTML uses all three', () => {
    const html =
      `<a href="/double">a</a>` + `<a href='/single'>b</a>` + `<a href=/bare >c</a>`;
    expect(extractHrefs(html)).toEqual(['/double', '/single', '/bare']);
  });

  it('reads an unmatched capture group as absent, not as the literal string', () => {
    // The compiler types every group as `string` (noUncheckedIndexedAccess is
    // off) while unmatched groups are `undefined` at RUNTIME. A naive
    // `m[2] || m[3]` reading would silently produce '' for single-quoted hrefs.
    expect(extractHrefs(`<a href='/single-only'>x</a>`)).toEqual(['/single-only']);
  });

  it('keeps the target VERBATIM rather than resolving it', () => {
    // A relative link becoming absolute IS a change worth seeing; resolving
    // would hide exactly the edit this measurement exists to find.
    const html = `<a href="/report">x</a><a href="https://example.gov.il/report">y</a>`;
    expect(extractHrefs(html)).toEqual(['/report', 'https://example.gov.il/report']);
  });

  it('deduplicates within a capture, so a repeated nav link counts once', () => {
    expect(extractHrefs(`<a href="/x">1</a><a href="/x">2</a>`)).toEqual(['/x']);
  });

  it('ignores href on elements that are not anchors', () => {
    // <link rel="stylesheet" href=...> is chrome, not a page link, and counting
    // it would manufacture changes on every asset-hash bump.
    expect(extractHrefs(`<link rel="stylesheet" href="/app.css"><a href="/real">x</a>`)).toEqual([
      '/real',
    ]);
  });

  it('finds nothing in an anchor with no href', () => {
    expect(extractHrefs(`<a name="anchor">x</a>`)).toEqual([]);
  });

  it('distinguishes two links whose visible text is identical', () => {
    // The whole point: this is the pair the derived text cannot tell apart, and
    // this platform's central finding is about a reporting-channel link.
    const before = `<a href="/report-adverse-event">דיווח על תופעת לוואי</a>`;
    const after = `<a href="/removed">דיווח על תופעת לוואי</a>`;
    expect(extractHrefs(before)).not.toEqual(extractHrefs(after));
  });
});
