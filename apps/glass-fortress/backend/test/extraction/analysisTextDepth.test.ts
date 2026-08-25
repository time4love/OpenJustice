import { extractArticleText, extractRawText } from '../../src/lib/archiveText';
import { evidenceHashFromCapture } from '../../src/lib/evidenceCapture';

/**
 * Hashing and classification want opposite things from a page, and serving both
 * from one extraction produced a wrong `evidenceDate` on the first production
 * evidence record.
 *
 * Readability keeps the article body and discards the rest as chrome. A byline
 * `<time datetime="…">` sits outside the body, so the publication date was not
 * in the text the model was shown — and rather than reporting the absence, the
 * model took a date out of the article prose. The field silently changed meaning
 * from "when this was published" to "when the events described happened".
 *
 * Real Readability, so this lives under test/extraction/.
 */

const URL_ = 'https://news.example.org/investigation';

/** An article page shaped like a real one: byline outside the article body. */
function page(): string {
  const para = [
    'The ministry withheld the study findings from the advisory committee that approved the',
    'vaccination of infants, and published a report asserting that no new safety signals had',
    'been identified. The research team had warned, in a recorded internal discussion, that the',
    'reported effects were neither mild nor transient, and that continuing to describe them that',
    'way carried medico-legal exposure. The published report omitted the re-challenge cases.',
  ].join(' ');

  return `<!DOCTYPE html><html lang="en"><head><title>Investigation</title></head><body>
    <nav><a href="/">Home</a></nav>
    <div class="byline"><time datetime="2022-08-21T20:02:14+03:00">21 August 2022</time></div>
    <article><h1>Ministry withheld findings</h1><p>${para}</p><p>${para}</p></article>
    <footer><span>1234 views</span></footer>
  </body></html>`;
}

describe('the text that is hashed and the text that is analysed are different, on purpose', () => {
  const html = page();
  const hashed = extractArticleText(html, URL_);
  const analysed = extractRawText(html);

  it('the HASHED text excludes the byline — which is why it is stable', () => {
    expect(hashed).not.toContain('21 August 2022');
    expect(hashed).not.toContain('1234 views');
    expect(hashed).toContain('withheld the study findings');
  });

  it('the ANALYSED text includes the publication date the classifier needs', () => {
    // The regression. When these were one string, this date reached no model,
    // and `evidenceDate` was produced from the article prose instead.
    expect(analysed).toContain('21 August 2022');
    expect(analysed).toContain('withheld the study findings');
  });

  it('the analysed text is strictly richer than the hashed text', () => {
    expect(analysed.length).toBeGreaterThan(hashed.length);
  });

  it('using the analysed text for the identity would reintroduce the instability', () => {
    // Guards the reason for the split, not just the split. The view counter is
    // in the analysed text, so hashing that text would move the identity again.
    const later = html.replace('1234 views', '1235 views');
    expect(evidenceHashFromCapture(URL_, extractRawText(later)))
      .not.toEqual(evidenceHashFromCapture(URL_, extractRawText(html)));
    // ...while the identity we actually use does not move.
    expect(evidenceHashFromCapture(URL_, extractArticleText(later, URL_)))
      .toEqual(evidenceHashFromCapture(URL_, extractArticleText(html, URL_)));
  });
});
