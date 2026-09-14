import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// A THESIS VERSION'S IDENTITY — docs/gf-thesis-flows.md A1 :1231.
//
//   contentHash = sha256(utf8(text)) — the text as approved, bytes
//
// OVER THE BYTES EXACTLY. No trim, no newline normalisation, no whitespace
// collapse: the hash is what the researcher approved, so a trailing newline is a
// different version (`test/thesis/scans.test.ts`' `gap-id-stable` vectors,
// derived at a shell). Displayed `0x` + 64 lowercase hex, evidence A1's form.
//
// A PURE MODULE: it imports `node:crypto` and nothing of the application. The
// version write, which holds a database client, depends on it — never the
// reverse (the researcher's ruling of 2026-09-11). A gap's id (A1 :1234) joins
// this module at thesis step 22, with the gap decisions that give it a subject.
// ---------------------------------------------------------------------------

/** `0x` + sha256 over the UTF-8 bytes of `text`, lowercase hex. */
export function contentHash(text: string): string {
  return `0x${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}
