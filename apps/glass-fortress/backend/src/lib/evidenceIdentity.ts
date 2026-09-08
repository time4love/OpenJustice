import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// A RECORD'S OWN NAME — docs/gf-evidence-flows.md §2 and A1, the byte layout
// stated ONCE, here, and nowhere else.
//
// Evidence is a corpus record a researcher has promoted, so its identity is the
// record's identity: `Evidence.fileHash` = ID(the record it marks). That is what
// makes RECOMPUTABLE a PREDICATE rather than a rate — a row either satisfies it
// or is malformed, and nothing legitimate makes it false. There is no re-hash
// tool, because a row that fails did not drift; it was written wrong.
//
// THREE INPUTS, AND NONE OF THEM IS DERIVED:
//
//   url               the page's name — TrackedUrl.url, the exact stored string
//   waybackTimestamp  the archive's name for the capture, 14 ASCII digits
//   documentHash      SHA-256 of the bytes AS SERVED — the hash the walk anchors
//
// No rule, no extractor, no classifier and no model touches any of the three,
// which is the whole reason the name never moves: a re-walk changes text, a new
// extractor changes text, a correction changes text, and none of them changes a
// URL, a timestamp, or the bytes that were served. What the old formula hashed
// instead — `url · ts · contentHash · ts · contentHash` over Readability's
// extraction — collapsed 104 distinct documents to 15 values on staging, so the
// name could not even tell captures apart.
//
// WHY THE NUL SEPARATORS ARE PART OF THE LAYOUT AND NOT DECORATION. Joining
// with a newline, as the retired formula did, is ambiguous: a URL that ends in
// digits and a timestamp are one string with no boundary a verifier can find.
// A 0x00 byte cannot occur in a URL or in the fourteen digits, so the fields are
// unambiguously separable by anyone recomputing from the archive alone.
//
// THE HASH GOES IN AS 32 RAW BYTES, NEVER AS ITS HEX TEXT. Two spellings of one
// digest is this repository's dominant defect shape — see
// `src/lib/anchoredCaptureHash.ts`, where a column with two spellings made
// `VERIFIED` unreachable for every snapshot that has ever existed. Here the
// conversion happens ONCE, at this module's boundary: bare hex in, raw bytes
// hashed, `0x`-prefixed lowercase hex out, which is the form `fileHash` takes.
// ---------------------------------------------------------------------------

/** A `0x`-prefixed, 64-character lowercase hex digest — the form `fileHash` takes. */
export type RecordId = string;

const NUL = Buffer.from([0x00]);

/** Bare lowercase hex, 64 characters, as `documentHash` and `contentHash` are stored. */
const BARE_HEX_64 = /^[0-9a-f]{64}$/;

/**
 * The 32 raw bytes of a digest given in either spelling.
 *
 * Throws rather than coercing. A malformed hash reaching the identity would
 * produce a well-formed name for nothing — the exact failure mode a hash-shaped
 * column beside another hash-shaped column has already caused here — and the
 * cheapest place to refuse it is before it is hashed.
 */
function bytes32(hex: string): Buffer {
  const bare = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  const lower = bare.toLowerCase();
  if (!BARE_HEX_64.test(lower)) {
    throw new Error(
      `evidenceIdentity: expected a 32-byte SHA-256 digest as hex, got ${JSON.stringify(hex)}. ` +
        'A record id is composed from raw digest bytes, never from a digest\'s text.',
    );
  }
  return Buffer.from(lower, 'hex');
}

/** Fourteen ASCII digits, YYYYMMDDHHMMSS — the archive's name for a capture. */
const WAYBACK_TIMESTAMP = /^[0-9]{14}$/;

function digest(parts: readonly Buffer[]): RecordId {
  return `0x${createHash('sha256').update(Buffer.concat([...parts])).digest('hex')}`;
}

/**
 * CAPTURE_ID(c) = sha256( utf8(url) ‖ 0x00 ‖ ascii(ts) ‖ 0x00 ‖ bytes32(documentHash) )
 *
 * `documentHashHex` is BARE hex, as `UrlSnapshot.documentHash` stores it.
 *
 * IT BINDS THE ARCHIVE'S NAME FOR A CAPTURE TO THE BYTES THE CHAIN ATTESTS, and
 * nothing else. It does NOT say what the article text was under any ruleset, and
 * it does not say the capture is meaningful or to whom — both are derived,
 * versioned or authored, and each is something the retired identity encoded and
 * therefore moved on.
 *
 * DERIVED, NEVER STORED ON THE CORPUS RECORD (ruled 2026-09-03). Its inputs are
 * immutable so a stored copy could not go stale, but nothing queries by it: a
 * promoted record is reached through `Evidence.fileHash`, an unpromoted one has
 * no public name, and (page, timestamp) is already unique. A column would be a
 * second answer beside `documentHash`, with a write path that can mis-write it.
 */
export function captureId(url: string, waybackTimestamp: string, documentHashHex: string): RecordId {
  if (!WAYBACK_TIMESTAMP.test(waybackTimestamp)) {
    throw new Error(
      `evidenceIdentity: expected 14 digits for a wayback timestamp, got ${JSON.stringify(waybackTimestamp)}. ` +
        'A capture without one has no CAPTURE_ID; what a researcher holds of such a page is a DOCUMENT.',
    );
  }
  return digest([
    Buffer.from(url, 'utf8'),
    NUL,
    Buffer.from(waybackTimestamp, 'ascii'),
    NUL,
    bytes32(documentHashHex),
  ]);
}

/**
 * ID(DIFF) = sha256( bytes32(CAPTURE_ID(before)) ‖ bytes32(CAPTURE_ID(after)) )
 *
 * Over the two RAW capture ids, not their `0x` text — the same rule as above,
 * one layer up.
 *
 * COMPOSED FROM THE CAPTURES' OWN NAMES, so a transition can be evidence while
 * neither endpoint is, and promoting one later changes nothing. It says these
 * two named captures in this order, and deliberately does NOT say they are still
 * consecutive: a re-walk can place a capture between them, and the name does not
 * move — NARROWED is a predicate over the corpus, not a property of the id.
 */
export function diffId(beforeCaptureId: RecordId, afterCaptureId: RecordId): RecordId {
  return digest([bytes32(beforeCaptureId), bytes32(afterCaptureId)]);
}

/** A corpus record, named as A1 names one: by page and timestamps, never by a row id. */
export type Record =
  | { kind: 'CAPTURE'; url: string; capture: { waybackTimestamp: string; documentHash: string } }
  | {
      kind: 'DIFF';
      url: string;
      before: { waybackTimestamp: string; documentHash: string };
      after: { waybackTimestamp: string; documentHash: string };
    };

/**
 * ID(record) for either kind — the one symbol every caller uses.
 *
 * The predicate RECOMPUTABLE(e) is `e.fileHash = recordId(the record e is keyed
 * to)`, and the instrument `forensics:audit-evidence` is that line over every
 * row. A second spelling of this function anywhere under `src/` fails the
 * identity scan in the evidence acceptance suite.
 */
export function recordId(record: Record): RecordId {
  if (record.kind === 'CAPTURE') {
    return captureId(record.url, record.capture.waybackTimestamp, record.capture.documentHash);
  }
  return diffId(
    captureId(record.url, record.before.waybackTimestamp, record.before.documentHash),
    captureId(record.url, record.after.waybackTimestamp, record.after.documentHash),
  );
}

/**
 * A1's `contentVersionHash`: sha256 over the UTF-8 of the JSON of
 * `[{ side, text } …]` — the differ's raw segments in the differ's output
 * order, removed then added, the text as the differ emits it. Nothing else:
 * not survival, not opinion, not a version label. Bare lowercase hex, the
 * spelling every hash column of the corpus stores (`textHash`, its sibling
 * content version, included); `0x` is the display form.
 *
 * MOVED HERE AT STEP 11b from `src/services/recordDiff.ts`, unchanged. A1 states
 * the byte layout once, and it lived in the walk's writer — which is where the
 * only caller is, and exactly why it belonged somewhere the rule can be read
 * without reading the writer. `recordDiff` re-exports it for that caller.
 */
export function contentVersionHash(
  chunks: readonly { side: 'REMOVED' | 'ADDED'; text: string }[],
): string {
  const named = chunks.map(({ side, text }) => ({ side, text }));
  return createHash('sha256').update(JSON.stringify(named), 'utf8').digest('hex');
}
