import { z } from 'zod';
import { verifyClaimText } from '../../services/archiveVerification';

// ---------------------------------------------------------------------------
// verify_claim_text
//
// Was this exact string on this page at this capture?
//
// Answered against the RAW archived HTML, never against UrlSnapshot.fullText.
// That column is a Readability extraction which discards a large fraction of
// the page — on capture 20220905111109 of corona.health.gov.il, 4,330 of 6,266
// characters kept, measured by this tool against the live archive on
// 2026-08-23 — and among the part it discarded was the sentence a real thesis
// then claimed had been ADDED the following day. A verification tool built on
// the extraction would have confirmed the false claim it was checking.
//
// So the answer has three parts, and the third is the point:
//   presentInRawArchive          — what the page actually said
//   presentInPlatformExtraction  — what the scan pipeline could see
//   extractionDivergence         — they disagree, and the pipeline is blind here
//
// Reports, never blocks.
// ---------------------------------------------------------------------------

export const verifyClaimTextSchema = {
  url: z.string().url().describe('The tracked URL the phrase is claimed to have appeared on'),
  capture: z
    .string()
    .regex(
      /^(\d{14}|\d{4}-\d{2}-\d{2})$/,
      'Pass a Wayback timestamp (YYYYMMDDHHMMSS) or a date (YYYY-MM-DD)',
    )
    .describe(
      'Which capture to check: an exact Wayback timestamp (YYYYMMDDHHMMSS), or a date (YYYY-MM-DD) ' +
        'which is resolved to every capture taken that day',
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
  url: string;
  capture: string;
  phrase: string;
}): Promise<string> {
  const result = await verifyClaimText(input);

  if (result.status !== 'OK') return JSON.stringify(result);

  return JSON.stringify({
    ...result,
    explanation:
      '`presentInRawArchive` is the authoritative answer: it is a search over the WHOLE archived ' +
      'document. `presentInPlatformExtraction` is the same search over Readability’s article — what ' +
      'the scan pipeline sees, and therefore what every diff, trajectory and on-chain contentHash ' +
      'for this page is derived from. `presentInStoredSnapshot` is the text actually banked at scan ' +
      'time, or null when this capture was never scanned. Fetch `rawUrl` yourself to reproduce any ' +
      'of it.',
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
            'EXTRACTION_DIVERGENCE: the raw page and this platform’s extraction disagree about this ' +
            'phrase. The pipeline is blind to something the page said, so any claim about this text ' +
            'that rests on a diff, a trajectory, or an evidence summary is resting on the half that ' +
            'cannot see it. This exact condition produced a false claim in a real thesis.',
        }
      : {}),
  });
}
