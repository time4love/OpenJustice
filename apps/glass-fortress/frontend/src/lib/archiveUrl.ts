// ---------------------------------------------------------------------------
// THE SECOND WITNESS — the archive link, composed and never fetched.
//
// GROUND: docs/gf-evidence-flows.md §5 :428–:430 — "the registry holds `documentHash`, and the archive
// serves the URL at the timestamp to anyone who asks. An outsider fetches, hashes and compares. Nothing the
// evidence layer could write would add a third." docs/gf-ui-flows.md §26 :827–:834: the capture page renders
// a link to the archive at this URL and timestamp, composed deterministically, "with one line saying the
// archive holds this page at this date and the link opens it — AND NO INSTRUCTION TO HASH ANYTHING."
//
// COMPOSED MEANS COMPOSED. Nothing here reaches the network, on render or ever: the whole point of a second
// witness is that this platform does not stand between the reader and it. The link is a pure function of two
// values the row already carries — the page's `url` and the capture's 14-digit timestamp — so it can be
// checked against the appendix without a fixture of somebody else's response.
//
// THE CONTRADICTION THIS HEADER USED TO REPORT IS RULED AND GONE — amended 2026-09-18, re-pointed here
// 2026-09-19. The header asked how ONE link could be both "what a reader opens" and the subject of "fetch,
// hash, compare", since hashing the viewer form hashes archive.org's chrome as much as the ministry's page.
// The researcher retired the INSTRUCTION rather than the link: „הקוראים לא יבינו את ההוראה לגבב את הקובץ.
// זה טכני מאוד ולא נדרש."
//
// AND IT WAS WRONG AS WELL AS TECHNICAL, which only a measurement showed. On the 2021-12-23 capture of the
// ministry's vaccine page the VIEWER form returns 54,180 bytes hashing to `1b108bb2…`; the RAW form
// `/web/<ts>id_/<url>` returns 47,731 bytes hashing to `5887afdf…`, which is the `documentHash` the platform
// anchored, exactly. The 6,449-byte difference is the archive's own toolbar. A reader who followed the old
// instruction on the link they were given would have got a MISMATCH and concluded the evidence was fabricated.
//
// SO THIS MODULE COMPOSES THE VIEWER FORM AND ONLY THAT. The RAW form belongs inside the VERIFY disclosure,
// beside the hash it matches (§26 :847; §4 :175–:179), and is named nowhere else — a reader is never sent to
// it and never told to hash anything. THE CAPABILITY DID NOT MOVE, only the instruction: evidence §5's
// "fetches, hashes and compares" remains true and unamended as a statement about what is POSSIBLE.
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

/**
 * The archive's RAW URL for one capture — `https://web.archive.org/web/<timestamp>id_/<url>`.
 *
 * THIS IS THE FORM THE `documentHash` WAS COMPUTED OVER, and it exists so the VERIFY disclosure can name it
 * BESIDE the hash it matches (§26 :847; §4 :175–:179). Measured on the 2021-12-23 capture: the viewer form
 * returns 54,180 bytes hashing to `1b108bb2…` and this form 47,731 bytes hashing to `5887afdf…`, which is the
 * anchored hash exactly — the 6,449-byte difference being the archive's own toolbar.
 *
 * IT IS DISCLOSED, NEVER LINKED, AND CARRIES NO INSTRUCTION. A reader is sent to the VIEWER form above; this
 * address is shown to the reader who came to check, inside the fold, and the page never tells anyone to hash
 * anything („הקוראים לא יבינו את ההוראה לגבב את הקובץ", 2026-09-18).
 *
 * It shares `archiveUrl`'s refusals by CALLING it rather than re-spelling the two guards: one composition, one
 * set of rules about what a capture's address may be built from.
 */
export function rawArchiveUrl(url: string, timestamp: string): string {
  return archiveUrl(url, timestamp).replace(`/web/${timestamp}/`, `/web/${timestamp}id_/`);
}
