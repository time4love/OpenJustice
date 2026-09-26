import { toBytes32 } from '../lib/bytes32';
import { anchorDocumentCommitment, type CaptureRegistrar, type RegistryWindow } from './anchorSnapshots';
import { capturesEqualTo } from './documentCaptures';
import { anchored, digestOf } from './documentPredicates';
import { attributeClaim, entryFromChain, type AttributionVerdict, type ClaimAttribution } from './registryState';

// ---------------------------------------------------------------------------
// THE ONE DOCUMENT-ANCHORING FUNCTION, AND ANCHORED(d) ON EVERY READ — docs/gf-document-refactor-plan.md §4 :408, step 31
// :193–:200; docs/gf-document-flows.md §4 :410–:450, A3 :1366 as ruled 2026-09-24.
//
// "The module has exactly two [callers], the walk's anchoring on ACQUIRED and one document-anchoring function; that
// function has exactly three callers — the intake receipt, `add_document`, the standing pass — each named." This is
// that function. In this round its callers are `add_document` (a document's FIRST arrival) and the standing pass; the
// intake receipt is step 32's. `test/documentAnchoringCallers.test.ts` holds the names.
//
// ANCHORED(d) HAS TWO ARMS (A3 :1366 as ruled): the COMMITMENT attributed to our registrar, or — for a HELD document
// only — a capture whose documentHash EQUALS the DOC_ID, attributed. §4 :440–:442: "nothing is written for it": the
// bytes' plain hash is already public as the capture's documentHash with two witnesses. The capture arm is asked FIRST,
// so no write is attempted for such a document; a commitment written before the equality appeared stands. `standingOf`
// reads both arms once, for the reads and for the write alike, and the pure `anchored` decides.
//
// CHAIN STATE BEFORE EVERY WRITE, AND AFTER. The before-read is what makes a write safe to attempt twice: a
// commitment a timed-out transaction did register is found ATTRIBUTED and not written again. The after-read is the
// check — READ, never stored (A3 :1389–:1391): no IntegrityCheck, no column, no row.
//
// ONE WRITE PER COMMITMENT AT A TIME, IN THIS PROCESS (relay item 8, ruled 2026-09-24). Two simultaneous first sends
// share one attempt: the second caller awaits the first's promise and never reaches `submit`. The lock holds within one
// process; one instance per environment is ASSUMED and recorded in step 31's dated doc.
//
// FOREIGN_SUBMITTER IS A DEFECT, NEVER A DEBT. A commitment is `sha256(DOC_ID ‖ salt)` with a fresh random salt
// (§4 :440, "a commitment cannot collide; its salt is fresh"); a registry entry for it that someone else submitted is a
// world no clause creates, and writing past it would be anchoring over a claim we cannot explain. It throws, naming it.
//
// A READ NEVER REFUSES FOR THE CHAIN. `anchoredOf` answers FALSE where the chain cannot be read — "simply false until a
// standing pass" (§4 :447) — and logs why; a lens that refused on an RPC outage would hide every document.
// ---------------------------------------------------------------------------

/** What the anchoring and the reads need of a document: its public name, its identity, and whether its bytes are held. */
export interface AnchorableDocument {
  commitment: string;
  docId: string;
  /** CUSTODY(d) = HELD — the only custody the capture arm is asked for (§4 :441). */
  held: boolean;
}

/** Which arm answered ANCHORED(d), or null while it is owed. */
export type AnchoredBy = 'COMMITMENT' | 'CAPTURE' | null;

export interface Standing {
  anchored: boolean;
  by: AnchoredBy;
}

export interface AnchorOutcome extends Standing {
  /** Whether this call sent a transaction. */
  wrote: boolean;
}

interface Read extends Standing {
  /** The commitment's own attribution — null where the capture arm answered first and the commitment was not asked. */
  commitment: ClaimAttribution | null;
}

/** Both arms, read from chain state: the capture arm first (HELD only), then the commitment. Throws on a chain failure. */
async function standingOf(registrar: CaptureRegistrar, document: AnchorableDocument): Promise<Read> {
  const attributedHashes = new Set<string>();
  const ask = async (hash: string): Promise<ClaimAttribution> => {
    const claim = await attributeClaim(registrar, entryFromChain(registrar), hash);
    if (claim.verdict === 'ATTRIBUTED') attributedHashes.add(claim.hash);
    return claim;
  };
  const isAttributed = (hash: string): boolean => attributedHashes.has(toBytes32(hash).toLowerCase());

  const equalCapture = document.held && (await capturesEqualTo(document.docId)) !== null ? toBytes32(digestOf(document.docId)) : null;
  if (equalCapture !== null) {
    await ask(equalCapture);
    // Only the capture has been asked, so the predicate can be true here by the capture arm alone.
    if (anchored(document.commitment, isAttributed, equalCapture)) return { anchored: true, by: 'CAPTURE', commitment: null };
  }
  const commitment = await ask(document.commitment);
  const isAnchored = anchored(document.commitment, isAttributed, equalCapture);
  return { anchored: isAnchored, by: isAnchored ? 'COMMITMENT' : null, commitment };
}

const inFlight = new Map<string, Promise<AnchorOutcome>>();

/** Anchor one document, once per commitment at a time — the ONE function every document path goes through. */
export function anchorDocument(window: RegistryWindow, document: AnchorableDocument): Promise<AnchorOutcome> {
  const held = inFlight.get(document.commitment);
  if (held !== undefined) return held;
  const attempt = anchorOnce(window, document).finally(() => inFlight.delete(document.commitment));
  inFlight.set(document.commitment, attempt);
  return attempt;
}

async function anchorOnce(window: RegistryWindow, document: AnchorableDocument): Promise<AnchorOutcome> {
  const registrar = await window.registrar();
  const before = await standingOf(registrar, document);
  if (before.anchored) return { anchored: true, by: before.by, wrote: false };
  if (before.commitment?.verdict === 'FOREIGN_SUBMITTER') {
    throw new Error(
      `anchorDocument: ${before.commitment.hash} is registered at index ${String(before.commitment.index)} by ` +
        `${String(before.commitment.submitter)}, not by this registrar. A salted commitment cannot collide (document ` +
        'flows §4 :440); this is a defect to investigate, never a debt to pay, and nothing was written.',
    );
  }
  await anchorDocumentCommitment(window, document.commitment);
  const after = await standingOf(registrar, document);
  return { anchored: after.anchored, by: after.by, wrote: true };
}

/**
 * ANCHORED(d) for each document, read from chain state — the one read `read_document`, `list_documents`, `add_document`'s
 * answer and the publication gate's VERIFIED(d) share. Sequential: a public endpoint rate-limits bursts
 * (`registryState.ts` :77–:79). A document the chain could not answer for is `{ unread }`, NAMING THE OUTAGE — never
 * `anchored: false` here, so the gate can refuse by the outage's name (document step 34, the researcher's Q1 (ii)).
 * `anchoredOf` below is the view that reads an outage as owed, as §4 :447 rules for every other read.
 */
export async function standingsOf(
  window: RegistryWindow,
  documents: readonly AnchorableDocument[],
): Promise<Map<string, Standing | { unread: string }>> {
  const answers = new Map<string, Standing | { unread: string }>();
  if (documents.length === 0) return answers;
  let registrar: CaptureRegistrar;
  try {
    registrar = await window.registrar();
  } catch (error) {
    const unread = `the chain could not be reached — ${messageOf(error)}`;
    for (const document of documents) answers.set(document.commitment, { unread });
    return answers;
  }
  for (const document of documents) {
    try {
      const { anchored: isAnchored, by } = await standingOf(registrar, document);
      answers.set(document.commitment, { anchored: isAnchored, by });
    } catch (error) {
      answers.set(document.commitment, { unread: `${document.commitment} could not be read from the chain — ${messageOf(error)}` });
    }
  }
  return answers;
}

/**
 * ANCHORED(d) for each document, as every read but the gate shows it: a chain that cannot be read answers FALSE for the
 * documents it could not answer, logged — never a refusal of the read (§4 :447). A VIEW of `standingsOf`, the one read.
 */
export async function anchoredOf(window: RegistryWindow, documents: readonly AnchorableDocument[]): Promise<Map<string, Standing>> {
  const owed: Standing = { anchored: false, by: null };
  const answers = new Map<string, Standing>();
  for (const [commitment, standing] of await standingsOf(window, documents)) {
    if ('unread' in standing) {
      console.error(`anchoredOf: ${standing.unread}; the document reads as owed`);
      answers.set(commitment, owed);
    } else {
      answers.set(commitment, standing);
    }
  }
  return answers;
}

/**
 * ANCHORED(d) and the commitment's own verdict, read from chain state — the read `commitments-owed`, the standing pass
 * and `get_environment`'s count share. THROWS on a chain failure: an operational count that swallowed one would report
 * "nothing owed" for a chain it never reached. The verdict is null where the capture arm answered first.
 */
export async function readStanding(window: RegistryWindow, document: AnchorableDocument): Promise<Standing & { verdict: AttributionVerdict | null }> {
  const read = await standingOf(await window.registrar(), document);
  return { anchored: read.anchored, by: read.by, verdict: read.commitment?.verdict ?? null };
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
