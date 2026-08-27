import { createHash } from 'crypto';
import { gunzipSync, inflateSync, brotliDecompressSync } from 'zlib';
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
export const TEXT_EXTRACTION_VERSION = 'v2-inflate-decode-htmltotext-normalised';

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
 * Undo the transfer encoding the source applied, if any.
 *
 * THE STEP THAT USED TO BE INVISIBLE. axios did this transparently and the
 * inflated bytes were stored as though they were the payload — so this is not a
 * new capability, it is the same transformation moved from inside a library's
 * defaults to a named, versioned step in a chain that can be recited:
 *
 *     bytes as served -> inflate -> decode (charset) -> htmlToText -> normalise
 *
 * Deterministic and cheap, so unlike `text` it needs no caching. Unknown or
 * absent encodings pass through untouched: the bytes are stored either way, so a
 * label we cannot act on costs nothing and inventing a guess would cost the
 * fidelity this whole level is about.
 */
export function inflateDocument(bytes: Buffer, contentEncoding: string | null | undefined): Buffer {
  const encoding = (contentEncoding ?? '').trim().toLowerCase();
  try {
    if (encoding === 'gzip' || encoding === 'x-gzip') return gunzipSync(bytes);
    if (encoding === 'deflate') return inflateSync(bytes);
    if (encoding === 'br') return brotliDecompressSync(bytes);
  } catch {
    // A payload that will not inflate is a finding, not a reason to lose the
    // capture: the bytes as served are already stored and can be re-examined
    // forever. Returning them unchanged keeps the derivation honest — the text
    // that follows will look wrong, which is the correct outcome for bytes that
    // do not match their declared encoding.
    return bytes;
  }
  return bytes;
}

/**
 * Derive the normalised text view of a payload.
 *
 * A CACHED DERIVATION, stored rather than recomputed per read because diffs and
 * trajectories read it constantly — §3's rule that an expensive function of held
 * data is a cached verdict invalidated by version. It is never a source of
 * truth: the payload is, and this can be rebuilt from it at any time.
 */
export function deriveText(
  bytes: Buffer,
  contentType: string | null | undefined,
  contentEncoding: string | null | undefined = null,
): DerivedText {
  const text = normaliseText(
    htmlToText(decodeDocument(inflateDocument(bytes, contentEncoding), contentType)),
  );
  return {
    text,
    textHash: sha256Text(text),
    textExtractionVersion: TEXT_EXTRACTION_VERSION,
  };
}
