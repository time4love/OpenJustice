import { z } from 'zod';
import { verifyClaimText } from '../../services/archiveVerification';
import { documentRefusal } from '../../services/documentRefusals';
import { verifyDocumentPhrase } from '../../services/verifyDocumentPhrase';

// ---------------------------------------------------------------------------
// verify_claim_text
//
// Was this exact string on this page at this capture?
//
// Answered against the RAW archived HTML first. A platform's own text of a page
// can be blind to part of it — Readability's article, the legacy register, kept
// 4,330 of 6,266 characters of capture 20220905111109 of corona.health.gov.il, and
// among the part it discarded was the sentence a real thesis then claimed had been
// ADDED the following day. A verification tool built on a platform's text would
// have confirmed the false claim it was checking.
//
// So the answer has three parts, and the third is the point:
//   presentInRawArchive      — what the page actually said
//   presentInStoredSnapshot  — what the text this platform STORED for the capture
//                              says: its current `text`, what every diff and
//                              trajectory reads; null when the capture is not held
//   extractionDivergence     — they disagree, and the platform is blind here; null
//                              when the capture is not held
//
// Reports, never blocks.
//
// THE DOCUMENT ARM — document flows A4 :1470 (RULED 2026-09-23, in scope 2026-09-24, R81 Q3): `{ commitment, phrase }`
// asks the ONE verdict rule over CURRENT(d)'s computed text (`services/verifyDocumentPhrase`). EXACTLY ONE TARGET — a
// capture (`url` and `capture`) or a document (`commitment`) — else NEITHER, decided from the INPUT before any row is
// read (thesis A4 :1521's spelling). The capture arm's behaviour and answer are unchanged. Gated at the route with the
// rest of this tool (`mcpRoutes.ts`), as read_document is; no new tool, so the surface stays at 50.
// ---------------------------------------------------------------------------

export const verifyClaimTextSchema = {
  url: z.string().url().optional().describe('A CAPTURE: the tracked URL the phrase is claimed to have appeared on (with `capture`)'),
  capture: z
    .string()
    .regex(
      /^(\d{14}|\d{4}-\d{2}-\d{2})$/,
      'Pass a Wayback timestamp (YYYYMMDDHHMMSS) or a date (YYYY-MM-DD)',
    )
    .optional()
    .describe(
      'A CAPTURE: which one to check (with `url`) — an exact Wayback timestamp (YYYYMMDDHHMMSS), or a date ' +
        '(YYYY-MM-DD) which is resolved to every capture taken that day',
    ),
  commitment: z
    .string()
    .optional()
    .describe(
      "A DOCUMENT, instead of a capture: its commitment, as list_documents returns it — the phrase is checked against " +
        "the document's current computed text. Give a capture OR a commitment, never both",
    ),
  phrase: z
    .string()
    .min(4)
    .describe(
      'The exact text claimed to have been on the page. Matched after collapsing whitespace, so ' +
        're-wrapping does not matter; nothing else is normalised and no fuzzy matching is done.',
    ),
};

export async function verifyClaimTextHandler(input: {
  url?: string;
  capture?: string;
  commitment?: string;
  phrase: string;
}): Promise<string> {
  // EXACTLY ONE TARGET, from the input alone — nothing is read before this is decided (A4 :1470). A capture is its page
  // AND its capture; a document its commitment. Both named, or neither whole, is NEITHER.
  const namesCapture = input.url !== undefined || input.capture !== undefined;
  if (namesCapture && input.commitment !== undefined) {
    return JSON.stringify(
      documentRefusal('NEITHER', 'This call names both a capture (url, capture) and a document (commitment). Check one target per call.'),
    );
  }
  if (input.commitment !== undefined) {
    return JSON.stringify(await verifyDocumentPhrase(input.commitment, input.phrase));
  }
  if (input.url === undefined || input.capture === undefined) {
    return JSON.stringify(
      documentRefusal(
        'NEITHER',
        namesCapture
          ? 'A capture is named by BOTH its page (url) and its capture (a timestamp or a date); this call gives only one.'
          : 'This call names no target: give a capture (url and capture) or a document (commitment).',
      ),
    );
  }

  const result = await verifyClaimText({ url: input.url, capture: input.capture, phrase: input.phrase });

  if (result.status !== 'OK') return JSON.stringify(result);

  return JSON.stringify({
    ...result,
    explanation:
      '`presentInRawArchive` is the authoritative answer: it is a search over the WHOLE archived ' +
      'document. `presentInStoredSnapshot` is the same search over the text this platform stored for ' +
      'the capture — its current derived text, which every diff and trajectory for this page reads — ' +
      'or null when the capture is not held. `extractionDivergence` is true when the two disagree and ' +
      'null when the capture is not held. Fetch `rawUrl` yourself to reproduce the raw answer.',
    ...(result.capturesNotChecked > 0
      ? {
          coverageWarning:
            `${String(result.capturesNotChecked)} further capture(s) exist on this date and were NOT ` +
            'checked — the per-call cap was reached. A phrase reported absent here is absent from the ' +
            'captures listed, not from the day. Pass an exact Wayback timestamp to check a specific one.',
        }
      : {}),
    ...(result.anyExtractionDivergence
      ? {
          divergenceWarning:
            'EXTRACTION_DIVERGENCE: the raw page and the text this platform stored for it disagree about ' +
            'this phrase. The platform is blind to something the page said, so any claim about this text ' +
            'that rests on a diff or a trajectory is resting on the half that cannot see it. This exact ' +
            'condition produced a false claim in a real thesis.',
        }
      : {}),
  });
}
