import { createHash } from 'node:crypto';
import { normaliseClaim } from './normalise';

// ---------------------------------------------------------------------------
// A THESIS VERSION'S IDENTITY, AND A GAP'S — docs/gf-thesis-flows.md A1 :1231, :1234–:1235.
//
//   contentHash = sha256(utf8(text)) — the text as approved, bytes
//   gapId       = sha256(utf8(NORMALISE(description))) — the same gap across runs and versions
//
// OVER THE BYTES EXACTLY. No trim, no newline normalisation, no whitespace
// collapse: the hash is what the researcher approved, so a trailing newline is a
// different version (`test/thesis/scans.test.ts`' `gap-id-stable` vectors,
// derived at a shell). Displayed `0x` + 64 lowercase hex, evidence A1's form.
//
// A PURE MODULE: it imports `node:crypto` and `lib/normalise`, itself pure, and
// nothing else of the application. The version write and the gap decision, which
// hold a database client, depend on it — never the reverse (the researcher's
// ruling of 2026-09-11).
// ---------------------------------------------------------------------------

const hex = (text: string): string => `0x${createHash('sha256').update(text, 'utf8').digest('hex')}`;

/** `0x` + sha256 over the UTF-8 bytes of `text`, lowercase hex. */
export function contentHash(text: string): string {
  return hex(text);
}

/**
 * `0x` + sha256 over the UTF-8 bytes of the NORMALISED description, lowercase hex.
 *
 * NORMALISE IS CALLED, never re-spelled (A7 `one-symbol`): a description re-wrapped or re-indented is the
 * same gap, so a re-run that raises it finds its decision; a re-WORDED one is a new gap (T4 :619–:621).
 */
export function gapId(description: string): string {
  return hex(normaliseClaim(description));
}
