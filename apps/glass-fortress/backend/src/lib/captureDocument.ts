import { createHash } from 'crypto';
import { htmlToText, normaliseText } from './htmlText';

/**
 * The payload, and the text derived from it.
 *
 * The distinction this module exists to hold: `document` is the thing, `text` is
 * a VIEW of the thing. Level 1's first attempt lost that distinction — it stored
 * `normaliseText(htmlToText(html))` under the name `rawText` and a NOT NULL
 * constraint then enforced that something was present, not that it was the
 * document. The fix reproduced the bug it was fixing, at a lower loss rate.
 *
 * What that cost, concretely rather than abstractly: `htmlToText` discards hrefs
 * while keeping anchor text, and this platform's central finding is that a
 * REPORTING-CHANNEL LINK was removed from a government page. Two different links
 * with the same visible text are, to a text-only store, the same page.
 */

/**
 * Which derivation produced a stored `text`.
 *
 * Bump this whenever `deriveText` changes what it returns. Every cached `text`
 * whose stored version differs is stale by definition — that is the point of
 * recording it, and it is built now rather than invented after the fact, which
 * this repository has already done four times (`classifierVersion`,
 * `summaryVersion`, `diffInputVersion`, `DETECTION_VERSION`).
 */
export const TEXT_EXTRACTION_VERSION = 'v1-htmltotext-normalised';

/** SHA-256 hex digest of bytes. Bare hex — see toBytes32 before any chain call. */
export function sha256Bytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** SHA-256 hex digest of a string, encoded UTF-8. */
export function sha256Text(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * The charset a payload declares, or null when it declares none.
 *
 * Parsed from the Content-Type header rather than guessed from the bytes. A
 * guess that is usually right is how a mis-decoded Hebrew page would enter the
 * archive looking like a real change on the day the guess went wrong.
 */
export function charsetFromContentType(contentType: string | null | undefined): string | null {
  if (!contentType) return null;
  const match = /charset\s*=\s*"?([\w-]+)"?/i.exec(contentType);
  return match?.[1]?.toLowerCase() ?? null;
}

/**
 * Decode a payload to a string using the charset it declared.
 *
 * Defaults to UTF-8, which is what the Internet Archive serves for these
 * captures — but the default is recorded as a default rather than assumed to be
 * the truth, which is why `documentContentType` is stored beside the bytes.
 * Node's decoder is lenient: an undecodable sequence becomes U+FFFD rather than
 * throwing, so a mangled payload yields mangled text and never a lost capture.
 */
export function decodeDocument(bytes: Buffer, contentType: string | null | undefined): string {
  const charset = charsetFromContentType(contentType) ?? 'utf-8';
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    // An unknown charset label. Falling back is right: the bytes are already
    // stored and can be re-decoded forever once the label is understood, which
    // is the whole reason they are stored.
    return new TextDecoder('utf-8').decode(bytes);
  }
}

export interface DerivedText {
  text: string;
  textHash: string;
  textExtractionVersion: string;
}

/**
 * Derive the normalised text view of a payload.
 *
 * A CACHED DERIVATION, stored rather than recomputed per read because diffs and
 * trajectories read it constantly — §3's rule that an expensive function of held
 * data is a cached verdict invalidated by version. It is never a source of
 * truth: the payload is, and this can be rebuilt from it at any time.
 */
export function deriveText(bytes: Buffer, contentType: string | null | undefined): DerivedText {
  const text = normaliseText(htmlToText(decodeDocument(bytes, contentType)));
  return {
    text,
    textHash: sha256Text(text),
    textExtractionVersion: TEXT_EXTRACTION_VERSION,
  };
}
