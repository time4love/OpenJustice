import { z } from 'zod';
import { isWaybackTimestamp } from '../../lib/evidenceIdentity';
import { toBytes32 } from '../../lib/bytes32';
import { normaliseAddress } from '../../lib/anchoringTarget';
import { readChainIdentity } from '../../lib/chainIdentity';
import { Web3Service } from '../../services/Web3Service';
import {
  attributeClaim,
  entryFromChain,
  RegistryReadError,
  type ClaimAttribution,
} from '../../services/registryState';
import { storedAttributionFor, type StoredAttribution } from '../../services/evidencePredicates';
import {
  loadCaptures,
  loadPage,
  resolveRecordByName,
  type Page,
  type TimelineCapture,
} from '../../services/corpusReads';
import { answer, refusal, openPage, shared, type Refusal } from './evidenceRefusals';

// ---------------------------------------------------------------------------
// check_on_chain_status — PUBLIC, RE-SCOPED TO A CAPTURE — evidence A4, §5.
//
// "A check on a CAPTURE: isRegistered · ATTRIBUTED · anchoredHash =
// documentHash · the stored verdict and its version; asked about a record's
// fileHash it answers about every capture beneath it."
//
// WHY A CAPTURE AND NOT AN EVIDENCE ROW. §5: "The chain attests the CORPUS …
// Everything above the corpus — selection, argument, version, citation — is
// derived from it, and a chain entry for a derived fact attests only that
// someone wrote it." There is no evidence registration left to check, so the
// question this tool asks is the only one the chain can answer.
//
// CHAIN STATE, NEVER A RECEIPT. §8: "`isRegistered(hash)` returns an entry's
// index and `getEvidence(index)` returns its submitter and block time, forever;
// a receipt is readable only inside the RPC's retention horizon. The audit's
// `TX_UNREADABLE` was a fact about the transaction our row named, not about the
// chain's attestation." `forensics:confirm-anchors`, which read receipts, is
// retired and held absent by the retired-names scan.
//
// ONE SPELLING OF ATTRIBUTED. This tool composes nothing: it calls
// `attributeClaim`, the same function the ledger, the audits and the anchor-time
// check call, through the entry lookup that reads ONE entry at the index
// `isRegistered` returned — so a per-capture question costs two calls rather
// than a walk of the whole registry.
//
// THE CHAIN IS NEVER READ AS AGREEMENT. An unreachable chain, or two reads of
// one state that disagree, is `CHAIN_UNAVAILABLE` — "a verdict about the CHECK",
// never a `registered: false` a caller could mistake for a negative.
// ---------------------------------------------------------------------------

export const checkOnChainStatusSchema = {
  url: z.url().optional().describe('The page — exact URL. With `capture`, checks that one capture'),
  capture: z
    .string()
    .optional()
    .describe('One capture, by its 14-digit wayback timestamp — with `url`'),
  fileHash: z
    .string()
    .optional()
    .describe("A record's name instead: answers about every capture beneath it"),
};

interface CaptureStatus {
  capture: string;
  documentHash: string;
  isRegistered: boolean;
  registryIndex: number | null;
  submitter: string | null;
  attributed: boolean;
  anchoredHash: string | null;
  anchoredHashMatchesDocumentHash: boolean;
  storedVerdict: {
    verdict: string;
    verifierVersion: string;
    checkedAt: Date;
    attributed: boolean | null;
  } | null;
}

interface OnChainStatus {
  page: { url: string; public: boolean };
  captures: CaptureStatus[];
  /** OBSERVED, never configured — the 2026-08-29 rule: a wrong environment records itself. */
  registry: { chainId: number | null; registryAddress: string | null };
}

export async function checkOnChainStatusHandler(input: {
  url?: string;
  capture?: string;
  fileHash?: string;
}): Promise<string> {
  return answer(async (): Promise<OnChainStatus | Refusal> => {
    const subject = await subjectOf(input);
    if ('error' in subject) return subject;

    const access = await openPage(subject.page);
    if (access.refused !== null) return access.refused;

    const identity = await readChainIdentity();
    const registry = {
      chainId: identity.reachable ? identity.chainId : null,
      registryAddress:
        identity.registryAddress === null ? null : normaliseAddress(identity.registryAddress),
    };

    let web3: Web3Service;
    try {
      web3 = new Web3Service();
    } catch (err) {
      return chainUnavailable(err);
    }

    const stored = await storedAttributionFor(subject.captures.map((c) => c.id));
    const captures: CaptureStatus[] = [];
    for (const capture of subject.captures) {
      let claim: ClaimAttribution;
      try {
        claim = await attributeClaim(web3, entryFromChain(web3), toBytes32(capture.documentHash));
      } catch (err) {
        return chainUnavailable(err);
      }
      captures.push(statusOf(capture, claim, stored.get(capture.id)));
    }

    return { page: { url: subject.page.url, public: access.public }, captures, registry };
  });
}

/** One capture's answer: what the chain holds, and what the last stored check said. */
function statusOf(
  capture: TimelineCapture,
  claim: ClaimAttribution,
  stored: StoredAttribution | undefined,
): CaptureStatus {
  return {
    capture: capture.capture,
    documentHash: capture.documentHash,
    isRegistered: claim.verdict !== 'UNREGISTERED',
    registryIndex: claim.index,
    submitter: claim.submitter,
    attributed: claim.verdict === 'ATTRIBUTED',
    anchoredHash: capture.anchoredHash,
    anchoredHashMatchesDocumentHash: capture.anchoredHash === capture.documentHash,
    storedVerdict: reportable(stored),
  };
}

/**
 * A chain that would not answer, or answered inconsistently, is a verdict about
 * the CHECK. `RegistryReadError` is the second case — "two reads of one state
 * that contradict each other are not a verdict" — and it is reported here rather
 * than swallowed, because the safe direction is to decide nothing.
 */
function chainUnavailable(err: unknown): Refusal {
  const message = err instanceof Error ? err.message : String(err);
  const kind = err instanceof RegistryReadError ? 'The registry answered inconsistently' : 'The registry could not be reached';
  return refusal(
    'CHAIN_UNAVAILABLE',
    `${kind}: ${message}. This is a verdict about the CHECK, not about the capture: it is NOT ` +
      'evidence that the hash is unregistered.',
  );
}

/**
 * The stored verdict as a caller reads it, or null where none was ever written.
 *
 * A row exists or it does not; `verdict`, `verifierVersion` and `checkedAt`
 * arrive together or the read never asked. Narrowed once, here, so the three
 * are not re-checked at the point of use.
 */
function reportable(stored: StoredAttribution | undefined): CaptureStatus['storedVerdict'] {
  if (stored?.verdict == null || stored.verifierVersion === null || stored.checkedAt === null) {
    return null;
  }
  return {
    verdict: stored.verdict,
    verifierVersion: stored.verifierVersion,
    checkedAt: stored.checkedAt,
    attributed: stored.attributed,
  };
}

/** What was asked about: a page and the captures beneath it. */
interface Subject {
  page: Page;
  captures: TimelineCapture[];
}

async function subjectOf(input: {
  url?: string;
  capture?: string;
  fileHash?: string;
}): Promise<Subject | Refusal> {
  if (input.fileHash !== undefined && input.fileHash !== '') {
    const resolved = await resolveRecordByName(input.fileHash);
    if (resolved === null) {
      return refusal(
        'NOT_A_RECORD',
        `${input.fileHash} names nothing the corpus holds, so there are no captures beneath it ` +
          'to ask the chain about.',
      );
    }
    const captures =
      resolved.capture !== null
        ? [resolved.capture]
        : resolved.pair === null
          ? []
          : [resolved.pair.before, resolved.pair.after];
    return { page: resolved.page, captures };
  }

  if (input.url === undefined || input.url === '') {
    return refusal(
      'NOT_A_CAPTURE',
      'Name what to check: a page and a capture (url, capture), or a record (fileHash).',
    );
  }
  const page = await loadPage(input.url);
  if (page === null) return shared.notSurveyed(input.url);

  const capture = input.capture;
  if (capture === undefined || !isWaybackTimestamp(capture)) {
    return refusal(
      'NOT_A_CAPTURE',
      `${capture ?? '(none)'} is not a capture. A capture is named by its 14-digit wayback ` +
        'timestamp (YYYYMMDDHHMMSS), never by a date.',
    );
  }
  const held = (await loadCaptures(page.id)).find((c) => c.capture === capture);
  if (held === undefined) {
    return refusal(
      'NOT_A_CAPTURE',
      `${capture} is not an acquired capture of ${page.url}: the corpus holds no bytes for it, so ` +
        'there is no documentHash to ask the registry about. list_captures shows what the ' +
        "page's work-list says about it.",
    );
  }
  return { page, captures: [held] };
}
