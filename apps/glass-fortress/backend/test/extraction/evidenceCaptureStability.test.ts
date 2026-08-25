import { extractArticleText } from '../../src/lib/archiveText';
import { evidenceHashFromCapture } from '../../src/lib/evidenceCapture';

/**
 * FINDING 79, as a regression.
 *
 * `create_evidence_from_url` hashed a crude tag-strip of the whole page. The RT
 * Mag article carries a live view counter, so three fetches seconds apart
 * produced three different evidence identities — and the tool's documented
 * "duplicate URLs return the existing record" could never fire.
 *
 * Real Readability, not the stub: the `unit` project mocks jsdom away, so this
 * has to live under test/extraction/.
 */

const URL_ = 'https://news.example.org/investigation';

/** Exactly the strip that `createEvidenceFromUrl` used before the fix. */
function crudeStrip(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** A page whose only difference between fetches is furniture outside the article. */
function pageWithViewCount(views: number): string {
  const body = [
    'The ministry withheld the study findings from the advisory committee that approved',
    'the vaccination of infants, and published a report asserting that no new safety',
    'signals had been identified. The research team had warned, in a recorded internal',
    'discussion, that the reported effects were neither mild nor transient, and that',
    'continuing to describe them that way carried medico-legal exposure. The report as',
    'published omitted the re-challenge cases entirely, and recomputed the rates on a',
    'denominator that included recipients who had never been followed up.',
  ].join(' ');

  return `<!DOCTYPE html><html lang="en"><head><title>Investigation</title></head><body>
    <nav><a href="/">Home</a><a href="/health">Health</a></nav>
    <div class="meta"><span class="views">${views} views</span></div>
    <article><h1>Ministry withheld findings</h1>
      <p>${body}</p>
      <p>${body}</p>
    </article>
    <footer><span class="views-footer">${views} views</span></footer>
  </body></html>`;
}

describe('evidence identity is stable across fetches that differ only in page furniture', () => {
  const a = pageWithViewCount(49_552);
  const b = pageWithViewCount(49_553);

  it('reproduces the defect: the old crude strip was NOT stable', () => {
    // Guards the premise. If this ever passes, the fixture stopped exercising
    // the bug and the test below proves nothing.
    expect(crudeStrip(a)).not.toEqual(crudeStrip(b));
    expect(crudeStrip(a)).toContain('49552 views');
  });

  it('extractArticleText drops the furniture, so the text is identical', () => {
    const textA = extractArticleText(a, URL_);
    const textB = extractArticleText(b, URL_);
    expect(textA).toEqual(textB);
    expect(textA).not.toContain('49552');
    expect(textA).not.toContain('views');
    // ...and it still kept the thing the evidence is actually about.
    expect(textA).toContain('withheld the study findings');
  });

  it('therefore the evidence hash is identical, which is what dedup depends on', () => {
    expect(evidenceHashFromCapture(URL_, extractArticleText(a, URL_))).toEqual(
      evidenceHashFromCapture(URL_, extractArticleText(b, URL_)),
    );
  });

  it('a change to the ARTICLE still changes the identity', () => {
    // The fix must not have bought stability by ignoring content.
    const changed = pageWithViewCount(49_552).replace('withheld the study findings', 'published the study findings');
    expect(evidenceHashFromCapture(URL_, extractArticleText(a, URL_))).not.toEqual(
      evidenceHashFromCapture(URL_, extractArticleText(changed, URL_)),
    );
  });
});
