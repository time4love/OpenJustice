import { getResearcherId } from '../context/researcherContext';
import { normaliseAddress } from '../lib/anchoringTarget';
import { readChainIdentity } from '../lib/chainIdentity';
import { prisma } from '../lib/prisma';
import { refusal, type Refusal } from '../mcp/tools/evidenceRefusals';
import { openingsOf } from './documentOpenings';
import type { Document, Shed } from '@prisma/client';
import { attestationOf } from './anchorDocuments';
import { custody, digestOf } from './documentPredicates';
import { entryFromChain, RegistryReadError, type ClaimAttribution } from './registryState';
import { Web3Service } from './Web3Service';

// ---------------------------------------------------------------------------
// check_on_chain_status({ commitment }) — THE COMMITMENT ARM. docs/gf-document-flows.md A4 :1468–:1469 as ruled
// 2026-09-24 (R80 Q4): "asked about a commitment, answers about its entry: registered · ATTRIBUTED · block time ·
// category — a document ANCHORED by A3 :1366's capture arm is answered as attested by that capture, with its index,
// never as unregistered; NOT_PUBLIC unless PUBLIC(d) (A3 :1379), the gate resolve_record carries at :1466–:1467."
// The capture arm of the tool — a page and a capture, or a record's fileHash — stays in `mcp/tools/checkOnChainStatus.ts`.
//
// THE GATE is `openPage`'s shape (`evidenceRefusals.ts` :224–:228): refused iff NOT PUBLIC(d) AND no researcher. A
// signed-in researcher reads through, as for a capture — plan :211's staging check asks it of documents no thesis has
// opened. ONE refusal body, whatever the reason and whoever asks, so the answer never says whether the platform holds
// a name. PUBLIC(d) is OPENED(d), document step 34's; nothing writes an opening before it, so no document is public,
// and a decision appearing early THROWS naming the step (`readDocument.ts` :280–:289's pattern).
//
// THE COMMITMENT'S OWN ENTRY IS ANSWERED FIRST: "a commitment written before the equality appeared stands" (A3 :1366).
// Only a commitment that does NOT attest — unregistered, or registered by another submitter — of a HELD document is
// answered by an equal, attributed capture's entry. Which arm attests is `anchorDocuments.attestationOf`'s — the ONE
// reading of ANCHORED's chain half, shared with the anchoring write and the publication gate (R85 chunk 4a round 2).
//
// CHAIN STATE, NEVER A RECEIPT; the registry is OBSERVED, never configured; a chain that would not answer is
// CHAIN_UNAVAILABLE — "a verdict about the CHECK" (evidence A4 :1115).
// ---------------------------------------------------------------------------

export interface CommitmentEntry {
  /** 0x-prefixed, lower-case — the hash the chain was asked about. */
  hash: string;
  isRegistered: boolean;
  registryIndex: number | null;
  submitter: string | null;
  attributed: boolean;
  /** ISO, from the entry's block time; null where nothing is registered. */
  blockTime: string | null;
  category: string | null;
}

export interface CommitmentStatus {
  commitment: string;
  /** Which entry attests the document; null while its anchor is owed. */
  attestedBy: 'COMMITMENT' | 'CAPTURE' | null;
  entry: CommitmentEntry;
  /** Set iff the CAPTURE attests: the page and capture whose documentHash equals the document's identity. */
  capture: { url: string; capture: string; documentHash: string } | null;
  registry: { chainId: number | null; registryAddress: string | null };
}

/** THE ONE BODY — no name in it, so an unknown commitment and an unopened one are indistinguishable. */
const NOT_PUBLIC_BODY =
  'No public document answers to that commitment. A document is public only once a published thesis has opened it; ' +
  'a signed-in researcher may ask about any document the platform holds.';

/**
 * A chain that would not answer, or answered inconsistently, is a verdict about the CHECK — never "unregistered".
 * The one spelling for both arms of the tool.
 */
export function chainUnavailable(err: unknown): Refusal<'CHAIN_UNAVAILABLE'> {
  const message = err instanceof Error ? err.message : String(err);
  const kind = err instanceof RegistryReadError ? 'The registry answered inconsistently' : 'The registry could not be reached';
  return refusal(
    'CHAIN_UNAVAILABLE',
    `${kind}: ${message}. This is a verdict about the CHECK, not about the capture: it is NOT ` +
      'evidence that the hash is unregistered.',
  );
}

/** PUBLIC(d) = OPENED(d) is defined (A3 :1379) — through the ONE loader, so this gate and the public serves agree. */
async function publicDocument(commitment: string): Promise<boolean> {
  return (await openingsOf([commitment])).get(commitment)?.public ?? false;
}

/** Which entry attests a document, that entry, and — iff a capture attests — the page and capture. */
export interface CommitmentAttestation {
  attestedBy: 'COMMITMENT' | 'CAPTURE' | null;
  entry: CommitmentEntry;
  capture: { url: string; capture: string; documentHash: string } | null;
}

/**
 * THE ONE SPELLING OF "A COMMITMENT'S ENTRY" — asked of the chain for `check_on_chain_status`'s commitment arm and for
 * document §7's public block (`documentPublicRead`, through `documentStanding.publicStandingOf`), so the two can never
 * report a document's anchor differently. WHICH ARM ATTESTS is `anchorDocuments.attestationOf`'s — the ONE reading of
 * ANCHORED's chain half the anchoring write and the publication gate read too (R85 chunk 4a round 2, REVIEW's M3): the
 * commitment first, and where it attests it stands; else a HELD document's equal capture, attributed, attests (A3 :1366;
 * A4 :1469). This adds only the ENTRY — the attesting claim's index, block time and category, read at its index. THROWS on
 * a chain failure — each caller names it.
 */
export async function commitmentEntryOf(document: Document, shed: Shed | null): Promise<CommitmentAttestation> {
  const web3 = new Web3Service();
  const entryAt = entryFromChain(web3);
  const entryOf = async (claim: ClaimAttribution): Promise<CommitmentEntry> => {
    const record = claim.index === null ? undefined : await entryAt(claim.index);
    return {
      hash: claim.hash,
      isRegistered: claim.verdict !== 'UNREGISTERED',
      registryIndex: claim.index,
      submitter: claim.submitter,
      attributed: claim.verdict === 'ATTRIBUTED',
      blockTime: record === undefined ? null : new Date(record.timestamp * 1000).toISOString(),
      category: record === undefined ? null : record.category,
    };
  };
  const held = custody(document, shed) === 'HELD';
  const read = await attestationOf(web3, { commitment: document.commitment, docId: document.docId, held });
  if (read.by === 'CAPTURE' && read.capture !== null) {
    return {
      attestedBy: 'CAPTURE',
      entry: await entryOf(read.capture.claim),
      capture: { url: read.capture.url, capture: read.capture.capture, documentHash: digestOf(document.docId) },
    };
  }
  return { attestedBy: read.by, entry: await entryOf(read.commitment), capture: null };
}

export async function commitmentOnChain(commitment: string): Promise<CommitmentStatus | Refusal<'NOT_PUBLIC' | 'CHAIN_UNAVAILABLE'>> {
  const document = await prisma.document.findUnique({ where: { commitment }, include: { shed: true } });
  if (document === null) return refusal('NOT_PUBLIC', NOT_PUBLIC_BODY);
  if (!(await publicDocument(commitment)) && getResearcherId() === null) return refusal('NOT_PUBLIC', NOT_PUBLIC_BODY);

  const identity = await readChainIdentity();
  const registry = {
    chainId: identity.reachable ? identity.chainId : null,
    registryAddress: identity.registryAddress === null ? null : normaliseAddress(identity.registryAddress),
  };

  try {
    const { shed, ...row } = document;
    return { commitment, ...(await commitmentEntryOf(row, shed)), registry };
  } catch (err) {
    return chainUnavailable(err);
  }
}
