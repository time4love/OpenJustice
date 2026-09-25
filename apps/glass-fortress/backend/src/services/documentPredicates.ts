import type { Arrival, Document, DocumentContentVersion, Shed } from '@prisma/client';
import { commitment, docId } from '../lib/documentIdentity';
import { verdict as verdictOverText, type Verdict } from '../lib/verdict';
import type { Evaluated } from './evidencePredicates';

// ---------------------------------------------------------------------------
// THE DOCUMENT LAYER'S PREDICATES — docs/gf-document-flows.md A3 :1356-:1387.
//
// EVERY ONE IS COMPUTED ON READ AND NONE IS STORED (§11 :1143-:1146). Custody is
// the case that matters: A2 :1274-:1275 derives it from what the row HOLDS —
// bytes, a cid, a shed record — and a `custody` COLUMN would be a second answer to
// a question the row already answers, which is this repository's dominant defect
// shape. The cases hold that a row carrying a contradictory column is ignored.
//
// PURE FUNCTIONS OVER ROWS, NO CLIENT. They take the rows their caller already
// loaded, so a caller may ask them inside a transaction without a second query and
// the suite may ask them with no database at all. A pure module never gains a
// dependency (thesis A1 :1247-:1250 as amended at thesis step 18).
//
// EVIDENCE A3'S PREDICATES ARE CALLED AND NEVER RE-SPELLED (A3 :1372):
// `CITATION_CURRENT(m)`, `ARGUED(m)` and `NEEDS_REVIEW(e)` are evidence's,
// UNCHANGED, computed over CURRENT(d) — so this module defines none of them. What
// it owes them is CURRENT(d), below, and the one spelling of the word they refuse
// on, which it takes from evidence's own type rather than re-typing the literal.
//
// THE VERDICT RULE IS THESIS STEP 19'S SYMBOL AND THIS STEP ADDS NOTHING TO IT
// (plan :162-:164). `verdict` here is a CALL of `lib/verdict`'s over CURRENT(d)'s
// text; a second spelling anywhere under `src/` is what `verdict-rule-one-spelling`
// (A7 :1579-:1581) catches.
// ---------------------------------------------------------------------------

/** A2 :1274-:1275 — derived from what the platform holds, never a column. */
export type Custody = 'HELD' | 'SEALED' | 'NONE';

/**
 * THE ONE SPELLING OF `AWAITING_DERIVATION`, taken from evidence A3's own type.
 *
 * §3 :335 calls it "evidence A3's name, one spelling", and a string literal
 * re-typed here would be exactly the second spelling that sentence forbids — so
 * the word is READ OFF the type evidence already exports rather than re-declared.
 * If evidence ever renames it, this fails to compile instead of drifting.
 */
type AwaitingReason = Extract<Evaluated<never>, { evaluable: false }>['reason'];

/**
 * The word a reader NAMES when CURRENT is not defined — evidence A3's, spelled once.
 *
 * It is DERIVED FROM EVIDENCE'S TYPE rather than typed out again, so the day that
 * layer renames it this fails to compile instead of quietly becoming a second
 * spelling. Every surface that reports the state — the coverage report, and the
 * checks of A6 that "fail naming AWAITING_DERIVATION" — takes the word from here.
 */
export const AWAITING_DERIVATION: AwaitingReason = 'AWAITING_DERIVATION';

/**
 * CURRENT(d), as a union whose arms cannot be confused for one another.
 *
 * A3 :1371 makes SHED and AWAITING different answers on purpose: `EVIDENCE_DERIVED`
 * "fails naming SHED, never AWAITING", because a document whose content was taken
 * back is not a document the platform owes a derivation for. A nullable version
 * would let a caller collapse the two.
 */
export type DocumentCurrent =
  | DocumentContentVersion
  | { awaiting: true }
  | { shed: true };

/**
 * CUSTODY(d) — HELD iff bytes present · SEALED iff cid present and bytes absent ·
 * NONE iff a Shed row exists (A2 :1274-:1275, A3 :1360).
 *
 * SHED WINS OVER BYTES because SHED nulled them (§8 :911): a row that still showed
 * bytes after a shed would be a row the shed did not finish.
 *
 * A ROW THAT IS NONE OF THE THREE THROWS, LOUDLY AND BY NAME. A2 gives exactly
 * three custody states; a byteless, cidless, unshed row is none of them, and
 * answering one of the three anyway would be the silent-filter defect this house
 * has already paid for — `requireSnapshotIdentity`'s pattern, applied here.
 */
export function custody(document: Document, shed: Shed | null): Custody {
  if (shed !== null) return 'NONE';
  if (document.bytes !== null) return 'HELD';
  if (document.cid !== null) return 'SEALED';
  throw new Error(
    `documentPredicates: document ${document.commitment} holds neither bytes nor a cid and has no Shed row, ` +
      'so its custody is none of A2 :1274\'s three. A row in that state was written wrong and is not answered for.',
  );
}

/**
 * RECOMPUTABLE(d) — A3 :1361-:1363, AND IT DIFFERS BY MODE BECAUSE WHAT THE
 * PLATFORM CAN RE-CHECK DIFFERS BY MODE.
 *
 *   HELD    sha256(bytes) = docId, from storage, forever.
 *   SEALED  `verifiedAtReceipt` IS SET — an OBSERVATION with its moment, never
 *           re-evaluated. The platform cannot repeat that check and says so
 *           rather than pretending a standing audit (§2 :219-:221), so this arm
 *           ignores any bytes a caller hands it.
 *   NONE    what was LAST RECORDED, as recorded (A3 :1363).
 *
 * THE NAME IS QUALIFIED, AND THE RESEARCHER RULED IT SO (2026-09-23). `recomputable`
 * names TWO DIFFERENT PREDICATES in two appendices: evidence A3 :1023's
 * RECOMPUTABLE(e), `e.fileHash = ID(the record it is keyed to)`, and this one, which
 * asks whether the platform can re-check a DOCUMENT'S OWN NAME. Round 1 kept the bare
 * name here and EXEMPTED this module from evidence's one-symbol scan
 * (`test/evidence/scans.test.ts`) — an edit to a sibling acceptance suite, which
 * `gf-document-refactor-plan.md` §1 :47-:49 and `gf-refactor-plan.md` §4 rule 2
 * :522-:524 both forbid: "a seam that needs a sibling's test edited is a seam this plan
 * got wrong." So the export is `recomputableDocument`, beside `recomputableEvidence`:
 * BOTH QUALIFIED, NEITHER BARE, which also closes the asymmetry round 1 flagged and
 * could not guard.
 *
 * THE FORMULA IS `lib/documentIdentity`'s AND IS CALLED, NOT RESPELLED. `docId(bytes)`
 * is DOC_ID(d) — A1 :1232, "sha256( bytes )", stated once in that module and nowhere
 * else. Re-deriving the name to compare it is asking the one formula again; composing
 * it with a second `createHash` here would have been a second spelling of an identity,
 * which is what `evidence/identity.test.ts`'s NAMED_HASHERS scan exists to catch.
 *
 * `bytes` IS THE CALLER'S READ OF THE BUCKET OBJECT, not the row's column: the
 * column holds the object's key (A2 :1267) and only a caller that can reach the
 * bucket can answer the HELD arm. A HELD row whose object could not be read
 * answers FALSE — the row claims an object that is not there, which is the
 * MALFORMED case `document-recomputable` lists and never repairs (A7 :1549-:1552).
 */
export function recomputableDocument(document: Document, shed: Shed | null, bytes: Uint8Array | null): boolean {
  const mode = shed !== null ? 'NONE' : custody(document, null);
  if (mode === 'SEALED' || mode === 'NONE') return document.verifiedAtReceipt !== null;
  if (bytes === null) return false;
  return docId(bytes) === document.docId;
}

/**
 * RECOMPUTABLE(e)'s THIRD ARM — A3 :1364-:1365.
 *
 * "kind DOCUMENT: e.fileHash = sha256(bytes32(d.docId) ‖ d.salt) for the Document
 * keyed by e.documentCommitment — evidence A3's predicate, third arm."
 *
 * IT IS NOT A SECOND SPELLING OF EVIDENCE'S `recomputable`, and the reason is the
 * formula: evidence's takes a `Record` that is a CAPTURE or a DIFF and names it
 * with `recordId`, which has no document arm and could not gain one without a
 * document's salt reaching a module about captures. A document's public name is
 * its COMMITMENT, and the one symbol that composes it is `lib/documentIdentity`'s,
 * called here.
 *
 * THE FILEHASH IS THE COMMITMENT AND NEVER THE DOC_ID. A row naming a document by
 * its identity rather than its public name is malformed, and the cases hold both
 * directions so that a field comparison cannot pass where a recomputation must.
 */
export function recomputableEvidence(fileHash: string, document: Document): boolean {
  return commitment(document.docId, document.salt) === fileHash;
}

/**
 * ANCHORED(d) — A3 :1366, as ruled 2026-09-24: ATTRIBUTED(d.commitment), OR, for a HELD document, EQUALS_CAPTURE(d)
 * with that capture ATTRIBUTED.
 *
 * `attributed` IS THE CHAIN'S ANSWER, handed in: ATTRIBUTED is read from chain state by `registryState`'s one spelling
 * and never re-derived here, and this module stays pure (its header). It is asked about the COMMITMENT — the public
 * name, never the DOC_ID (§4 :429–:438) — and, only when a caller hands one, about `equalCapture`: the documentHash of a
 * capture EQUALS_CAPTURE matched, which the ruling makes the one sanctioned look-up of that plain hash, because it is
 * already public as the capture's documentHash with two witnesses. A caller passes it only for a HELD document
 * (`verified` enforces that itself; `anchorDocuments.ts` reads custody before it asks).
 */
export function anchored(commitment: string, attributed: (hash: string) => boolean, equalCapture: string | null = null): boolean {
  return attributed(commitment) || (equalCapture !== null && attributed(equalCapture));
}

/**
 * VERIFIED(d) — A3 :1367: RECOMPUTABLE(d) AND ANCHORED(d). CALLS both; spells neither. The capture arm is HELD only —
 * §4 :441 names "a HELD document", and a SEALED DOC_ID never leaves the platform — so for any other custody the
 * capture is not passed on, whatever the caller handed in.
 *
 * THE NAME IS QUALIFIED, as `recomputableDocument` is and for the same reason: evidence A3's VERIFIED(e) is
 * `evidencePredicates.verified`, and `test/evidence/scans.test.ts` holds that no other module declares a `verified`.
 * That suite stays unedited (plan §1 :47–:49: "a seam that needs a sibling's test edited is a seam this plan got
 * wrong"); the researcher ruled `recomputable` the same way on 2026-09-23.
 */
export function verifiedDocument(
  document: Document,
  shed: Shed | null,
  bytes: Uint8Array | null,
  attributed: (hash: string) => boolean,
  equalCapture: string | null = null,
): boolean {
  const held = shed === null && custody(document, null) === 'HELD';
  return recomputableDocument(document, shed, bytes) && anchored(document.commitment, attributed, held ? equalCapture : null);
}

/**
 * CURRENT(d) — A3 :1368-:1371, by custody mode.
 *
 *   HELD    the version whose `derivedUnder` CONTAINS `CURRENT_EXTRACTOR` (below, and A3
 *           :1368 as ruled 2026-09-23); none → AWAITING_DERIVATION, and the platform owes it.
 *   SEALED  the version derived AT_RECEIPT, FOREVER. A sealed document's plaintext
 *           existed once (§2), so nothing can derive another and a HELD_BYTES row
 *           against one is ignored rather than preferred. It never reads AWAITING:
 *           there are no bytes to derive from, so nothing is owed.
 *   NONE    SHED — undefined, and the failure names SHED and never AWAITING.
 *
 * IT READS MEMBERSHIP OF `derivedUnder`, NEVER EQUALITY ON `extractorVersion` — RULED
 * BY THE RESEARCHER 2026-09-23 (A3 :1368, A2 :1300, §3 :324). §3 :317 forbids a second
 * row for a re-derivation that yields identical text, and the old rule asked for a row
 * whose `extractorVersion` EQUALS today's — so a held document whose text a new extractor
 * REPRODUCES had no row that could answer, read AWAITING_DERIVATION forever while the pass
 * reported UNCHANGED, and became permanently uncitable under A6 :1531's hard check.
 * `derivedUnder` is the append-only list of every extractor version that reproduced this
 * text; `extractorVersion` still names the one that produced it FIRST and is never
 * overwritten, because it is provenance and not a pointer.
 *
 * `currentExtractor` IS A PARAMETER, AND IT STILL TAKES NULL — BUT THE TREE'S
 * `CURRENT_EXTRACTOR` IS NOT NULL. The researcher ruled the extractor on 2026-09-23
 * and the constant is set, so no CALLER passes null today. The parameter keeps the
 * arm for the SUITE, which must be able to state what CURRENT(d) answers when no
 * extractor is chosen — a world the design has a word for (AWAITING_DERIVATION,
 * A3 :1368-:1369) and which returns the day an OCR stage is being weighed and the
 * constant is moved. It is a PARAMETER and never a re-read of the constant, so this
 * module stays pure and testable without mocking a module.
 */
export function currentVersion(
  document: Document,
  versions: readonly DocumentContentVersion[],
  currentExtractor: string | null,
  shed: Shed | null,
): DocumentCurrent {
  const awaiting = { awaiting: true } as const;
  if (shed !== null) return { shed: true };
  if (custody(document, null) === 'SEALED') {
    const receipt = versions.find((version) => version.derivedFrom === 'AT_RECEIPT');
    if (receipt === undefined) {
      throw new Error(
        `documentPredicates: sealed document ${document.commitment} has no AT_RECEIPT version. ` +
          'Its plaintext existed once, at receipt (§2 :158-:162), so a sealed row without one was written wrong.',
      );
    }
    return receipt;
  }
  if (currentExtractor === null) return awaiting;
  return versions.find((version) => version.derivedUnder.includes(currentExtractor)) ?? awaiting;
}

/**
 * VERDICT(phrase, d) — A3 :1385-:1386, the ONE verdict rule over CURRENT(d).text.
 *
 * UNCHECKED WHERE THE CONTENT IS THE BYTES, with its reason, "never silently
 * PRESENT, never a model reading an image to grade another model" (§3 :362-:364).
 * `lib/verdict` already returns UNCHECKED for a null text — this function's whole
 * job is to hand it CURRENT(d)'s text and to answer UNCHECKED where there is no
 * CURRENT at all, which is the same absence one step out.
 */
export function verdict(phrase: string, current: DocumentContentVersion | null): Verdict {
  return verdictOverText(phrase, current?.text ?? null);
}

/**
 * EQUALS_CAPTURE(d) — A3 :1383-:1384: "∃ UrlSnapshot with documentHash = d.docId — read on
 * demand; the read names the page and capture." The ONE witness the platform did not create
 * (§2 :236-:242): where a held document's bytes are a page's bytes as served, the walk's anchor
 * attests them too.
 *
 * IT COMPARES DIGESTS, NOT SPELLINGS. `UrlSnapshot.documentHash` is stored as BARE hex
 * (`lib/evidenceIdentity.ts` :46, `sha256Bytes`) and a DOC_ID is displayed `0x`-prefixed
 * (A1 :1244), so a string comparison would never fire on real rows. Both sides are reduced to
 * the 64 lowercase hex digits of the digest before they are compared.
 *
 * IT COMPARES THE DOC_ID AND NEVER THE COMMITMENT — the salt makes a commitment incomparable to
 * any hash of bytes by construction (§4 :440-:442). PURE: the caller reads the snapshots.
 */
export function equalsCapture(
  document: Document,
  snapshots: readonly { documentHash: string; url: string; capture: string }[],
): { url: string; capture: string } | null {
  const digest = digestOf(document.docId);
  const match = snapshots.find((snapshot) => digestOf(snapshot.documentHash) === digest);
  return match === undefined ? null : { url: match.url, capture: match.capture };
}

/** A SHA-256 digest's 64 lowercase hex digits, whichever display it arrived in. */
export function digestOf(hash: string): string {
  return (hash.startsWith('0x') || hash.startsWith('0X') ? hash.slice(2) : hash).toLowerCase();
}

/**
 * ANSWERED(a) — A3 :1375: "∃ document of arrival a cited by HEAD(a.thesis) or PUBLISHED(a.thesis)". DERIVED FROM THE
 * MENTIONS AND NEVER STORED (§5 :606–:607): a gap decided CITED on a commitment answers the arrival by the citation that
 * already exists, and no column or flag records it (§6 :717–:719).
 *
 * PURE: `cited` is the commitments the DOCUMENT mentions of HEAD(a.thesis) and PUBLISHED(a.thesis) name, read by the
 * caller; `documents` the arrival's own commitments. An arrival with NO THESIS — the researcher's door, A2 :1280–:1284 —
 * has no HEAD to be cited by, so it is never ANSWERED. An arrival of NO documents answers nothing.
 */
export function answered(arrival: Pick<Arrival, 'thesisId'>, cited: readonly string[], documents: readonly string[]): boolean {
  if (arrival.thesisId === null) return false;
  return documents.some((commitment) => cited.includes(commitment));
}
