import { JSDOM } from 'jsdom';
import { htmlToText, normaliseText } from './htmlText';
import { Readability } from '@mozilla/readability';

// ---------------------------------------------------------------------------
// Readability's reading of an archived page — the LEGACY register.
//
// Readability's article is what `UrlSnapshot.fullText` held until R45-B dropped the
// column, and what the old registries' extraction anchors hashed as `contentHash` —
// the formula the committed registry ledgers state, which is why this construction
// stays in the tree. It is NOT what any finding is derived from: every diff, every
// trajectory and `verify_claim_text`'s stored answer read the capture's current
// `text` (docs/gf-interaction-flows.md A2) since R45. Its blind
// spot is measured, not assumed: on capture 20220905111109 of
// corona.health.gov.il it kept 4,330 of the page's 6,266 characters, and among
// the 31% it dropped was the sentence a real thesis went on to claim had been
// ADDED the following day.
//
// Who still loads it, and so jsdom, statically — named so nobody fixes the jsdom
// boundary twice: `services/WaybackScraper.ts` and `utils/webScraper.ts`. The raw reading needs no DOM and lives in `./htmlText`; it is
// re-exported below so existing imports keep working.
// ---------------------------------------------------------------------------

export interface ExtractedArticle {
  /** Readability's title, or '' when it found none. */
  title: string;
  /** The article as text — the same value `extractArticleText` returns. */
  text: string;
}

/**
 * Readability's article, converted to text — the one construction of it.
 *
 * Sole implementation on purpose. `utils/webScraper.ts` used to carry a second
 * JSDOM+Readability block returning `article.textContent`, which is a different
 * string from this one — so the same URL ingested through the website and
 * through MCP produced different text and therefore different evidence
 * identities. Two extractions of "the article" is one of them being wrong
 * without anything saying which.
 */
export function extractArticle(html: string, sourceUrl: string): ExtractedArticle {
  const dom = new JSDOM(html, { url: sourceUrl });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  // Prefer article.content (clean HTML from Readability) so htmlToText can
  // insert proper line breaks. article.textContent smashes words together.
  const text = article?.content?.trim()
    ? normaliseText(htmlToText(article.content))
    : // Fallback: convert full body HTML if Readability found nothing
      normaliseText(htmlToText(dom.window.document.body.innerHTML));

  return { title: article?.title ?? '', text };
}

/**
 * The article as text — the LEGACY register: the exact path that composed
 * UrlSnapshot.fullText, and that the old registries' extraction anchors hashed.
 */
export function extractArticleText(html: string, sourceUrl: string): string {
  return extractArticle(html, sourceUrl).text;
}

// Re-exported so existing imports keep working: these moved to ./htmlText to
// keep the DOM dependency out of everything that only needs text.
export { timestampToDate, htmlToText, normaliseText, normaliseForPresence, extractRawText } from './htmlText';
