export function formatHash(hash: string): string {
  if (hash.length <= 18) return hash;
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

/**
 * Truncate prose to a display-friendly label: trims to the last word boundary
 * at-or-under maxLen and appends an ellipsis, instead of cutting mid-word.
 */
export function truncateLabel(text: string, maxLen = 35): string {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  const trimmed = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
  return `${trimmed}…`;
}

/**
 * A tracked page's URL, cleaned up for display: no protocol, no query string.
 * The full URL is still the underlying value used for links — this is purely
 * cosmetic, for headings where "https://" and tracking params are just noise.
 */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').split('?')[0] ?? url;
}

/**
 * A page's DOMAIN — what a reader recognises a page by (docs/gf-ui-flows.md §4 :169). `www.` is noise, not a name.
 * A URL the browser cannot parse is shown as written rather than dropped.
 */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** A Wayback timestamp (`yyyymmddhhmmss`, UTC) as the date a reader recognises — never the 14 digits (§4 :167–:170). */
export function formatCaptureDate(timestamp: string, locale: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(timestamp);
  if (match === null) return timestamp;
  return formatDate(`${match[1] ?? ''}-${match[2] ?? ''}-${match[3] ?? ''}T00:00:00.000Z`, locale);
}

/** An ISO instant as a date in the reader's locale, UTC — the form §17 :530 shows beside a version. */
export function formatDate(iso: string, locale: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-GB', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' }).format(at);
}
