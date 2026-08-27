import { JSDOM } from 'jsdom';
import { htmlToText, normaliseText } from './htmlText';
import { Readability } from '@mozilla/readability';

// ---------------------------------------------------------------------------
// Turning archived HTML into text — the two readings, side by side.
//
// The scanner stores ONE of them: Readability's article, which is what
// UrlSnapshot.fullText holds and therefore what every diff, trajectory and
// on-chain contentHash is derived from. That is a deliberate choice for
// diffing (boilerplate churn would swamp the signal) and a blind spot for
// verification: on capture 20220905111109 of corona.health.gov.il it kept
// 4,330 of the page's 6,266 characters — measured against the live archive on
// 2026-08-23 — and among the 31% it dropped was the sentence a real thesis went
// on to claim had been ADDED the following day.
//
// So both readings live here, exported, with the same tag-to-text conversion
// applied to each. A verification tool asks for `rawText` and compares it
// against `extractedText`; the scanner asks only for the extraction. Neither
// re-implements the other, which is the point of moving them out of
// WaybackScraper: a divergence check built on a second copy of the extractor
// would eventually stop measuring the extractor that actually runs.
// ---------------------------------------------------------------------------




export interface ExtractedArticle {
  /** Readability's title, or '' when it found none. */
  title: string;
  /** The article as text — the same value `extractArticleText` returns. */
  text: string;
}

/**
 * The platform's ONE reading of a page: Readability's article, converted to text.
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
 * The article as text. This is the exact path that produces UrlSnapshot.fullText.
 */
export function extractArticleText(html: string, sourceUrl: string): string {
  return extractArticle(html, sourceUrl).text;
}

/**
 * Everything the archived page said — the whole document, with no article
 * selection applied. Readability is never consulted, so nothing is discarded
 * for looking like navigation, a sidebar, or an accordion panel.
 */
export function extractRawText(html: string): string {
  return normaliseText(htmlToText(html));
}

// Re-exported so existing imports keep working: these moved to ./htmlText to
// keep the DOM dependency out of everything that only needs text.
export { timestampToDate, htmlToText, normaliseText, normaliseForPresence } from './htmlText';
