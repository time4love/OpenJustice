import { Prisma } from '@prisma/client';
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

// ---------------------------------------------------------------------------
// THE ONE WAY TO READ A STORED PAYLOAD AS HTML.
//
// `inflate -> decode` is two steps and the first one is easy to forget, because
// a payload that was never compressed reads perfectly without it. It was
// forgotten: `measureHrefChanges` called `decodeDocument` alone, so every
// capture whose origin served `Content-Encoding: gzip` was read as compressed
// bytes and yielded ZERO hrefs.
//
// What that produced was not a crash. It was a MEASUREMENT — 7 of the MOH page's
// 103 captures appeared to lose ~50 links each and get them back, which read as
// 12 "changes invisible to the derived text", including the adverse-event
// reporting channel `https://t.me/MOHreport` apparently appearing and vanishing
// 13 times. Every one of those was this missing call. The page never changed and
// the corpus was never wrong; `deriveText` inflates, which is why the text layer
// correctly reported no change at exactly those boundaries.
//
// So the pair becomes one symbol with a select the compiler enforces, in the
// same shape as `ANCHORABLE_CAPTURE_SELECT`: a caller that forgets the encoding
// column cannot build the argument. `test/captureHtml.test.ts` holds that
// nothing outside this module calls `decodeDocument` or `inflateDocument`
// directly.
// ---------------------------------------------------------------------------

/** A capture, reduced to what reading its payload as HTML requires. */
export interface DecodableCapture {
  document: Buffer;
  documentContentType: string | null;
  documentContentEncoding: string | null;
}

/**
 * The columns a query must select for its rows to be readable as HTML.
 *
 * Spread into a Prisma `select` rather than copied. `measureHrefChanges` listed
 * its own columns and omitted `documentContentEncoding` — so the bug was not
 * only a missing call, it was a missing COLUMN, and no type complained.
 */
export const DECODABLE_CAPTURE_SELECT = {
  document: true,
  documentContentType: true,
  documentContentEncoding: true,
} satisfies Prisma.UrlSnapshotSelect;

/** A stored payload, as HTML: the bytes as served, inflated and decoded. */
export function captureHtml(capture: DecodableCapture): string {
  return decodeDocument(
    inflateDocument(capture.document, capture.documentContentEncoding),
    capture.documentContentType,
  );
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
  return deriveTextFromHtml(
    captureHtml({
      document: bytes,
      documentContentType: contentType ?? null,
      documentContentEncoding: contentEncoding ?? null,
    }),
  );
}

/**
 * The text derivation itself, from HTML that is already decoded.
 *
 * Split out so Level 4 can insert its view BETWEEN the decode and this, without
 * this module gaining a dependency on an HTML parser. `captureDocument` is
 * imported by almost everything that touches a capture; `jsdom`'s dependency
 * chain is ESM-only and unloadable in the `unit` jest project, so importing it
 * here would break every suite that transitively reaches a capture — which is
 * how this was found. A shared entry point sets the blast radius.
 *
 * `version` is a parameter for the same reason: the chrome layer must be able to
 * record WHICH view produced the text without a second copy of the derivation.
 */
export function deriveTextFromHtml(
  html: string,
  version: string = TEXT_EXTRACTION_VERSION,
): DerivedText {
  const text = normaliseText(htmlToText(html));
  return { text, textHash: sha256Text(text), textExtractionVersion: version };
}
