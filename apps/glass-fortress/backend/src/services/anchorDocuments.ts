import { toBytes32 } from '../lib/bytes32';
import { anchorDocumentCommitment, type CaptureRegistrar, type RegistryWindow } from './anchorSnapshots';
import { capturesEqualTo } from './documentCaptures';
import { anchored, digestOf } from './documentPredicates';
import { attributeClaim, entryFromChain, type AttributionVerdict, type ClaimAttribution, type RegistryReader } from './registryState';

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
// bytes' plain hash is already public as the capture's documentHash with two witnesses.
//
// ONE RULE FOR WHICH ARM ATTESTS — `attestationOf`, exported, the ONE reading of ANCHORED's chain half for every caller:
// the anchoring write, every read (`standingsOf`, `anchoredOf`, `readStanding`), the publication gate's VERIFIED(d), and
// `check_on_chain_status` and the public block (`checkOnChainStatus.commitmentEntryOf`). THE COMMITMENT IS ASKED FIRST
// and, where it attests, it STANDS — "a commitment written before the equality appeared stands" (A3 :1366); only where it
// does NOT attest (unregistered, or registered by another submitter) is a HELD document's equal capture asked, and an
// attributed one attests (A4 :1469: "answered as attested by that capture, with its index"). Both arms are asked BEFORE
// any write, so no write is attempted for a document an equal capture already attests. The pure `anchored` decides.
//
// WHY IT IS ONE FUNCTION (R85 chunk 4a round 2, REVIEW's M3): the write asked the capture first and the tool's commitment
// arm asked the commitment first and never the capture behind a foreign submitter — so the gate called a document
// VERIFIED that `check_on_chain_status` and the public block called unattested. Two spellings of one OR disagreed.
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

/** Both arms as the chain answers them, and which attests — `attestationOf`'s answer. */
export interface Attestation extends Standing {
  /** The commitment's own attribution — ALWAYS asked, because where it attests it stands (A3 :1366). */
  commitment: ClaimAttribution;
  /** Where the commitment does not attest and a HELD document's bytes equal a capture's: that capture and its claim. */
  capture: { claim: ClaimAttribution; url: string; capture: string } | null;
}

/** THE ONE READING OF ANCHORED's chain half (the header): the commitment first, then an equal capture. Throws on a chain failure. */
export async function attestationOf(reader: RegistryReader, document: AnchorableDocument): Promise<Attestation> {
  const attributedHashes = new Set<string>();
  const ask = async (hash: string): Promise<ClaimAttribution> => {
    const claim = await attributeClaim(reader, entryFromChain(reader), hash);
    if (claim.verdict === 'ATTRIBUTED') attributedHashes.add(claim.hash);
    return claim;
  };
  const isAttributed = (hash: string): boolean => attributedHashes.has(toBytes32(hash).toLowerCase());

  const commitment = await ask(document.commitment);
  if (anchored(document.commitment, isAttributed)) return { anchored: true, by: 'COMMITMENT', commitment, capture: null };
  const equal = document.held ? await capturesEqualTo(document.docId) : null;
  if (equal === null) return { anchored: false, by: null, commitment, capture: null };
  const captureHash = toBytes32(digestOf(document.docId));
  const claim = await ask(captureHash);
  const isAnchored = anchored(document.commitment, isAttributed, captureHash);
  return { anchored: isAnchored, by: isAnchored ? 'CAPTURE' : null, commitment, capture: { claim, url: equal.url, capture: equal.capture } };
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
  const before = await attestationOf(registrar, document);
  if (before.anchored) return { anchored: true, by: before.by, wrote: false };
  if (before.commitment.verdict === 'FOREIGN_SUBMITTER') {
    throw new Error(
      `anchorDocument: ${before.commitment.hash} is registered at index ${String(before.commitment.index)} by ` +
        `${String(before.commitment.submitter)}, not by this registrar. A salted commitment cannot collide (document ` +
        'flows §4 :440); this is a defect to investigate, never a debt to pay, and nothing was written.',
    );
  }
  await anchorDocumentCommitment(window, document.commitment);
  const after = await attestationOf(registrar, document);
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
      const { anchored: isAnchored, by } = await attestationOf(registrar, document);
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
 * "nothing owed" for a chain it never reached. The commitment is always asked (`attestationOf`), so its verdict is too.
 */
export async function readStanding(window: RegistryWindow, document: AnchorableDocument): Promise<Standing & { verdict: AttributionVerdict }> {
  const read = await attestationOf(await window.registrar(), document);
  return { anchored: read.anchored, by: read.by, verdict: read.commitment.verdict };
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
