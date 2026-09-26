import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// A DOCUMENT'S OWN NAME — docs/gf-document-flows.md §2 and A1, the byte layout
// stated ONCE, here, and nowhere else.
//
// A document is bytes handed to the platform that no archive holds, so its
// identity is the SHA-256 of those bytes and nothing else (§2 :138-:145). There
// is nothing to compose: no page, no archive timestamp, no pair. The bytes are
// the whole record, so their hash is the whole name.
//
// TWO NAMES, AND ONLY ONE OF THEM IS PUBLIC.
//
//   DOC_ID      sha256( bytes ) — the IDENTITY. GATED: served only with a BYTES
//               opening, where anyone holding the file could compute it anyway
//               (§7 :765-:770). Plain SHA-256 with NOTHING PREPENDED, so the
//               check an outsider runs is `sha256sum file` (§2 :229-:231) — the
//               ministry that sent the letter, the journalist who has a copy and
//               the source who scanned it can all recompute it knowing nothing
//               about this platform.
//   COMMITMENT  sha256( bytes32(DOC_ID) ‖ salt ) — the PUBLIC NAME: the citation
//               token, the registry entry, `Evidence.fileHash` for this kind.
//
// WHY THE PUBLIC NAME IS SALTED, and it is not ceremony (§4 :429-:438). A
// registry of plaintext hashes is a LEAK DETECTOR: an authority hashes its own
// copies and learns the platform holds that exact document — and where copies are
// individually varied, learns WHO HAD IT. The commitment gives every document its
// chain timestamp without giving anyone that check, and opening the name later,
// with the salt, proves the commitment was to this document and no other. Because
// the commitment is also the public name, no hash of a copy a source held is ever
// published, and no researcher has to judge whether an authority varies its copies.
//
// WHY THIS MODULE AND NOT `evidenceIdentity.ts`. Each layer states its own byte
// layout once, in its own A1, and the house already has three such modules —
// `evidenceIdentity` (a corpus record's name), `thesisIdentity` (a version's and a
// gap's), and this one. They are not three spellings of one rule: they are three
// DIFFERENT formulas over different inputs, and folding them together would put a
// document's salt in a module about captures. What is shared is the DISPLAY form,
// `0x` + 64 lowercase hex (evidence A1), and it is stated in each because it is
// two characters of formatting rather than a rule that can drift.
//
// PURE, AND IT IMPORTS ONLY `node:crypto` — thesis A1 :1247-:1250 as amended at
// thesis step 18: a module holding a database client depends on the pure one,
// never the reverse. `sha256Bytes` in `lib/captureDocument.ts` is the corpus's and
// drags `zlib`, `htmlText` and the Prisma namespace behind it; it also returns BARE
// hex, where every name here is displayed `0x`-prefixed.
// ---------------------------------------------------------------------------

/** A `0x`-prefixed, 64-character lowercase hex digest — evidence A1's display form. */
export type DocumentId = string;

/** Bare lowercase hex, 64 characters — a digest's storage spelling. */
const BARE_HEX_64 = /^[0-9a-f]{64}$/;

/**
 * The 32 raw bytes of a digest given in either spelling.
 *
 * THROWS RATHER THAN COERCING, for `evidenceIdentity`'s reason one layer over: a
 * malformed hash reaching an identity produces a WELL-FORMED NAME FOR NOTHING, and
 * the cheapest place to refuse it is before it is hashed. The commitment's whole
 * value is that it is a commitment to ONE document; a name composed from a digest's
 * TEXT rather than its BYTES would be a commitment to a string.
 */
function bytes32(hex: string): Buffer {
  const bare = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  const lower = bare.toLowerCase();
  if (!BARE_HEX_64.test(lower)) {
    throw new Error(
      `documentIdentity: expected a 32-byte SHA-256 digest as hex, got ${JSON.stringify(hex)}. ` +
        "A document's commitment is composed from raw digest bytes, never from a digest's text.",
    );
  }
  return Buffer.from(lower, 'hex');
}

/**
 * DOC_ID(d) = sha256( bytes ) — A1 :1232.
 *
 * The file EXACTLY AS HANDED OVER, and NO NORMALISATION OF ANY KIND: a paste with a
 * trailing newline is a DIFFERENT document, because it is different bytes (§2 :185-:186).
 *
 * THE SUBJECT DIFFERS BY DOOR AND THE CALLER SAYS WHICH (A1 :1233-:1235). SEALED hashes
 * the file AFTER the browser's metadata strip — what was handed over IS the stripped
 * file; HELD hashes it AS THE RESEARCHER GAVE IT, unstripped. One formula, two stated
 * subjects, never one subject assumed for both.
 */
export function docId(bytes: Uint8Array): DocumentId {
  return `0x${createHash('sha256').update(Buffer.from(bytes)).digest('hex')}`;
}

/**
 * COMMITMENT(d) = sha256( bytes32(DOC_ID(d)) ‖ salt ) — A1 :1236-:1238.
 *
 * `salt` is random bytes of the hash's width, generated by the PLATFORM at receipt and
 * NEVER by the sender, stored on the row and GATED. A sender-chosen salt would let the
 * sender choose the public name, and a fixed one would restore the leak detector the
 * salt exists to remove.
 *
 * THE DOC_ID GOES IN AS ITS 32 RAW BYTES, never as its `0x` text — `bytes32` above
 * refuses anything else.
 */
export function commitment(documentId: DocumentId, salt: Uint8Array): DocumentId {
  const digest = createHash('sha256')
    .update(Buffer.concat([bytes32(documentId), Buffer.from(salt)]))
    .digest('hex');
  return `0x${digest}`;
}

/**
 * The content version's name — A1 :1242-:1243 as CONFORMED 2026-09-26 (the researcher, R85 Q-G).
 *
 * `sha256( utf8(text) )` over the extractor's output AS EMITTED, and the document's COMMITMENT when the content IS
 * the bytes (`text` null): a photograph no engine reads has no computed text, so its content version is the bytes
 * themselves, and it is named by the document's PUBLIC name.
 *
 * NEVER THE DOC_ID. The pin is served at every opening (§7 :777–:779, :851) and "no hash of a copy a source held is ever
 * published" (§7 :765–:770); a bytes-only version named by its DOC_ID published that hash below BYTES. The commitment
 * is reproduced from the bytes AND the salt (§3 :293 as CONFORMED; A1 :1236–:1237), so a verifier opened to BYTES —
 * handed both — reproduces it.
 *
 * THIS FUNCTION RETURNS WHAT IT IS HANDED for a null text, so the rule is its CALLERS': each hands the document's
 * commitment (`documentContentVersions.deriveContent`), and `test/documentBytesOnlyName.test.ts` holds all three.
 * The verdict rule never reads this hash: it reads `text === null` (`lib/verdict`).
 */
export function contentVersionHashOf(text: string | null, commitment: DocumentId): DocumentId {
  if (text === null) return commitment;
  return `0x${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

/**
 * THE SHARED TEST VECTOR — A1 :1254-:1257.
 *
 * "Two implementations of one hash are unavoidable, and the receipt tests them." The
 * BROWSER computes DOC_ID with WebCrypto over the bytes it is handed; the SERVER
 * recomputes it here; `NAME_MISMATCH` is the refusal that fires when they disagree.
 * This vector is what makes that testable on both sides of the wire rather than
 * asserted on one.
 *
 * `bytes` is BASE64 so the vector survives a JSON file, a test fixture and a browser
 * suite unchanged — a byte array written as a literal is a byte array someone
 * reformats. The browser half lands at STEP 30 with the upload dialog (plan :182 and
 * §4 :412 as amended), not at step 32: the dialog hashes in the browser.
 *
 * THE SAME VECTOR SERVES THE SEALED DOOR at step 32, so the intake dialog inherits a
 * vector already proven rather than minting a second one.
 */
export const HASH_VECTOR = {
  /** Base64 of 27 bytes: the ASCII text `document-identity-vector-v1`. */
  bytes: 'ZG9jdW1lbnQtaWRlbnRpdHktdmVjdG9yLXYx',
  /**
   * `docId(Buffer.from(bytes, 'base64'))`, COMPUTED and pinned — never typed by hand.
   * Derived with `node:crypto` and re-derived independently with Python's `hashlib`;
   * the two agree. `identity.test.ts` recomputes it from `bytes` on every run, so a
   * hand-edit of either field reddens rather than becoming the new truth.
   */
  docId: '0xf33b465ef60084f3e81652a0d758129db9384af8d1d382167b44b9ef2cd65e8f',
} as const;
