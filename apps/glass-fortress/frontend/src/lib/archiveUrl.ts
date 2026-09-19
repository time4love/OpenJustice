// ---------------------------------------------------------------------------
// THE SECOND WITNESS — the archive link, composed and never fetched.
//
// GROUND: docs/gf-evidence-flows.md §5 :428–:430 — "the registry holds `documentHash`, and the archive
// serves the URL at the timestamp to anyone who asks. An outsider fetches, hashes and compares. Nothing the
// evidence layer could write would add a third." docs/gf-ui-flows.md §26 :716–:718: the capture page renders
// "a link to the archive at this URL and timestamp, composed deterministically… with the one line on how to
// verify — fetch, hash, compare".
//
// COMPOSED MEANS COMPOSED. Nothing here reaches the network, on render or ever: the whole point of a second
// witness is that this platform does not stand between the reader and it. The link is a pure function of two
// values the row already carries — the page's `url` and the capture's 14-digit timestamp — so it can be
// checked against the appendix without a fixture of somebody else's response.
//
// ONE FUNCTION, AND A CONTRADICTION IN THE CLAUSE IT SERVES, reported rather than resolved here. The Wayback
// Machine serves two URLs for one capture: the VIEWER form `/web/<ts>/<url>`, which wraps the page in
// archive.org's own chrome, and the RAW form `/web/<ts>id_/<url>`, which serves the bytes as captured. §26
// asks for one link and gives it two jobs — a link a READER OPENS (the viewer's job) and the subject of
// "fetch, hash, compare" (only the raw form's, since hashing the viewer form hashes archive.org's markup as
// much as the ministry's page). This module composes the VIEWER form, because §26's sentence is about what a
// reader opens and because it is the form the corpus itself already stores as `snapshotUrl`. The
// verification line therefore names a different URL from the one the link points at, and THAT is the
// question — it is asked in the report and not answered by this code.
// ---------------------------------------------------------------------------

/** A wayback timestamp: exactly fourteen digits, `YYYYMMDDhhmmss`. */
const WAYBACK_TIMESTAMP = /^\d{14}$/;

/**
 * The archive's viewer URL for one capture — `https://web.archive.org/web/<timestamp>/<url>`.
 *
 * IT THROWS ON A MALFORMED TIMESTAMP RATHER THAN COMPOSING A LINK THAT GOES NOWHERE. A second witness whose
 * address is wrong is worse than none: it reads to a checker as the platform's word rather than the
 * archive's, which is the one thing §5 :428–:430 says this link exists to avoid. The throw is loud for the
 * `requireSnapshotIdentity` reason — a subject quietly dropped from a check is a subject reported as nothing
 * to check — and never a silent `null` a caller could render as an empty anchor.
 */
export function archiveUrl(url: string, timestamp: string): string {
  if (!WAYBACK_TIMESTAMP.test(timestamp)) {
    throw new Error(`archiveUrl: \`${timestamp}\` is not a 14-digit wayback timestamp`);
  }
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    throw new Error(`archiveUrl: \`${url}\` is not an absolute url`);
  }
  return `https://web.archive.org/web/${timestamp}/${url}`;
}
