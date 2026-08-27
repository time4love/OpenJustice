/**
 * Turning HTML into text — pure string work, and NOTHING that needs a DOM.
 *
 * Split out of archiveText so that consuming the text derivation does not drag
 * in jsdom and @mozilla/readability. Those are ESM-only, the unit test project
 * does not transform node_modules, and every module that touched them had to
 * mock them away — including modules that never used them. A dependency nothing
 * in the file needs is a dependency that shapes every test around it.
 *
 * `htmlToText` strips ALL markup, keeping only visible text: hrefs are
 * discarded while anchor text survives. That is exactly why the payload is
 * stored beside this derivation rather than replaced by it — see captureDocument.
 */

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
