import { ethers } from 'ethers';

/**
 * The stored document an evidence record's identity is computed from.
 *
 * FINDING 79: `create_evidence_from_url` hashed a LIVE fetch and stored nothing.
 * The RT Mag article carries a view counter, so three fetches seconds apart
 * produced three different hashes — the record could be recomputed from neither
 * the live page (it had moved) nor a stored copy (there was none), and the
 * documented "duplicate URLs return the existing record" could never fire.
 *
 * Two separate properties are needed, and only the second one actually matters:
 *
 * - **Stability** — an extractor that does not pick up page furniture. Measured:
 *   the crude tag-strip kept the counter and was unstable; `extractArticleText`
 *   dropped it and was stable. Available for free by using the extractor the
 *   scan path already uses.
 * - **Verifiability** — the text is STORED, so "does this hash still hold?" is
 *   answerable years later against an artifact rather than against a live page.
 *   No extractor can provide this. Readability's stability on that article is
 *   incidental: a timestamp inside the article body would defeat it.
 *
 * Everything here is deliberately pure — no DB, no network — so the creating
 * path and the verifying path call the SAME function. Two implementations of
 * "the hash of this capture" is how a verifier comes to disagree with the
 * hasher while both look correct.
 */

/**
 * Which extraction produced a stored capture.
 *
 * Recorded per capture rather than assumed globally: when the extractor changes,
 * old captures must still say how they were made, or every historical hash
 * becomes unexplainable rather than merely superseded.
 */
export const CAPTURE_EXTRACTOR_READABILITY = 'readability-article-v1';

/** Raw bytes, for a document fetched as a file rather than a web page. */
export const CAPTURE_EXTRACTOR_RAW_BYTES = 'raw-bytes-v1';

/**
 * The same extraction, but round-tripped through the browser.
 *
 * The website scrapes at `/intake` and posts the text back at `/confirm`, so the
 * server hashes a string the client had custody of in between. Labelled
 * distinctly rather than as the plain server-side extraction: an auditor
 * comparing two captures must be able to see that one of them left the building.
 */
export const CAPTURE_EXTRACTOR_CLIENT_SUPPLIED = 'client-supplied-readability-v1';

/**
 * How much of the captured text the identity covers.
 *
 * The full text is stored regardless; this bounds only what is hashed, and it
 * is exported so a verifier applies the same bound instead of rediscovering it.
 */
export const HASHED_PREFIX_CHARS = 40_000;

/**
 * The exact bytes an evidence hash is taken over, for a URL-sourced capture.
 *
 * The URL is part of the identity on purpose: the same paragraph published at
 * two addresses is two pieces of evidence, each citable to where it was found.
 */
export function captureHashPayload(sourceUrl: string, text: string): Buffer {
  return Buffer.from(`${sourceUrl}\n\n${text.slice(0, HASHED_PREFIX_CHARS)}`, 'utf8');
}

/** The evidence `fileHash` implied by a stored capture. */
export function evidenceHashFromCapture(sourceUrl: string, text: string): string {
  return ethers.sha256(captureHashPayload(sourceUrl, text));
}

export interface CaptureVerification {
  /** False only when a capture exists AND fails to reproduce the hash. */
  matches: boolean;
  /**
   * True when there is nothing stored to check against.
   *
   * Kept distinct from `matches: false` throughout. "The capture disagrees" is a
   * tampering-shaped finding; "there is no capture" is a record created before
   * captures existed, or by a path that does not produce one. Collapsing the two
   * would either cry wolf over every legacy row or quietly pass a real mismatch.
   */
  notChecked: boolean;
  expectedFileHash: string | null;
  actualFileHash: string;
  reason: string;
}

/**
 * Does the stored capture still produce the identity the record claims?
 *
 * Answerable from the database alone — no network, no archive, no live page.
 * That is the whole point: a record whose identity depends on refetching a page
 * that has since changed is not verifiable at all.
 */
export function verifyEvidenceCapture(
  evidence: { fileHash: string; sourceUrl: string | null },
  capture: { sourceUrl: string; text: string } | null,
): CaptureVerification {
  if (capture === null) {
    return {
      matches: true,
      notChecked: true,
      expectedFileHash: null,
      actualFileHash: evidence.fileHash,
      reason:
        'No stored capture for this record, so its identity cannot be recomputed. This is not a mismatch — it is the absence of anything to compare against.',
    };
  }

  const expected = evidenceHashFromCapture(capture.sourceUrl, capture.text);
  const matches = expected === evidence.fileHash;

  return {
    matches,
    notChecked: false,
    expectedFileHash: expected,
    actualFileHash: evidence.fileHash,
    reason: matches
      ? 'The stored capture reproduces the recorded fileHash. This record can be verified without refetching anything.'
      : 'The stored capture does NOT reproduce the recorded fileHash. Either the capture or the hash was altered after creation; do not anchor this record until that is explained.',
  };
}
