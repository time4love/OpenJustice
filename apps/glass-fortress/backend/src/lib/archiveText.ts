import { JSDOM } from 'jsdom';
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

/** Convert a raw Wayback timestamp (YYYYMMDDHHMMSS) to YYYY-MM-DD. */
export function timestampToDate(ts: string): string {
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
}

/**
 * Convert an HTML string to plain text with structural line breaks preserved.
 *
 * Readability's .content is clean article HTML. Using .textContent instead
 * smashes adjacent words together when they are separated only by tags
 * (e.g. <p>word.</p><p>Word</p> → "word.Word"). This function inserts
 * newlines at block boundaries so diffLines produces surgical, line-level
 * diffs rather than one massive changed block per page.
 */
export function htmlToText(html: string): string {
  return html
    // Script and style bodies are markup, not page text. Harmless in
    // Readability's output (it strips them) but not in a raw-body read, where
    // an inline <script> would otherwise contribute its source to the text and
    // could make a phrase look present in a page that never displayed it.
    .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    // Block-level endings → paragraph break
    .replace(/<\/(?:p|h[1-6]|blockquote|pre|table|tr|ul|ol|dl)>/gi, '\n\n')
    // Inline block endings / single-line elements → line break
    .replace(/<\/(?:div|li|td|th|dt|dd|section|article|header|footer|nav|main|figure|figcaption)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    // List items get a bullet prefix
    .replace(/<li[^>]*>/gi, '• ')
    // Strip all remaining tags
    .replace(/<[^>]*>/g, '')
    // Decode common HTML entities
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:x27|39);/gi, "'")
    .replace(/&#x2019;/gi, '’')
    .replace(/&#x201[89];/gi, '“');
}

/**
 * Normalise extracted text so trivial whitespace differences don't pollute the
 * diff with meaningless changes.
 */
export function normaliseText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n /g, '\n')   // strip leading spaces after newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The platform's reading of an archived page: Readability's article, converted
 * to text. This is the exact path that produces UrlSnapshot.fullText.
 */
export function extractArticleText(html: string, sourceUrl: string): string {
  const dom = new JSDOM(html, { url: sourceUrl });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  // Prefer article.content (clean HTML from Readability) so htmlToText can
  // insert proper line breaks. article.textContent smashes words together.
  if (article?.content?.trim()) {
    return normaliseText(htmlToText(article.content));
  }

  // Fallback: convert full body HTML if Readability found nothing
  return normaliseText(htmlToText(dom.window.document.body.innerHTML));
}

/**
 * Everything the archived page said — the whole document, with no article
 * selection applied. Readability is never consulted, so nothing is discarded
 * for looking like navigation, a sidebar, or an accordion panel.
 */
export function extractRawText(html: string): string {
  return normaliseText(htmlToText(html));
}

/**
 * Collapse every run of whitespace so a phrase matches across re-wrapping,
 * re-indentation and block boundaries.
 *
 * The same normalisation claim-trajectory detection uses (`normaliseClaim`),
 * and deliberately so: a phrase this platform reports as present in a capture
 * must mean the same thing whichever tool reported it.
 */
export function normaliseForPresence(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
