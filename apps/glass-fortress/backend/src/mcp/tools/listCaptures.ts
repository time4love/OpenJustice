import { z } from 'zod';
import { listCaptures } from '../../services/archiveVerification';

// ---------------------------------------------------------------------------
// list_captures
//
// What captures exist for this page between these dates, and which of them
// does this platform hold?
//
// Trivial, and nothing exposed it until now. get_forensic_timeline returns
// DIFFS; get_claim_trajectories returns snapshotsExamined as a bare COUNT.
// Neither can answer "is there a capture between the publication and the
// change?" — the question the central temporal claim of the first real thesis
// turned on, and one that took a curl loop against the Wayback CDX API to
// answer by hand.
//
// The stored-vs-archive distinction is the substance, not a detail. The vault
// holds 83 captures for corona.health.gov.il while the archive holds more, so
// an interval computed from stored captures alone is WIDER than the truth. A
// researcher who reads "nothing changed between these two snapshots" from the
// forensic timeline may be reading straight over a capture nobody scanned.
// ---------------------------------------------------------------------------

const DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD');

export const listCapturesSchema = {
  url: z.string().url().describe('The tracked URL to list archived captures for'),
  from: DATE.optional().describe('Earliest capture date to include, YYYY-MM-DD (inclusive)'),
  to: DATE.optional().describe('Latest capture date to include, YYYY-MM-DD (inclusive)'),
};

export async function listCapturesHandler(input: {
  url: string;
  from?: string;
  to?: string;
}): Promise<string> {
  const result = await listCaptures(input.url, {
    ...(input.from ? { from: input.from } : {}),
    ...(input.to ? { to: input.to } : {}),
  });

  if (result.status !== 'OK') return JSON.stringify(result);

  return JSON.stringify({
    ...result,
    explanation:
      'Every capture the Internet Archive holds for this page in the requested range. ' +
      '`storedLocally: false` means the archive has this capture but this platform never scanned it — ' +
      'so any interval computed from the forensic timeline alone is wider than the archive supports. ' +
      '`storedNotInArchiveIndex` counts the reverse: captures this platform holds that the archive ' +
      'index did not return, which means the two sources disagree about this page’s history.',
    ...(result.truncated
      ? {
          truncationWarning:
            'The capture list was cut at the per-call limit, so it is NOT the complete history. ' +
            'Do not conclude that no capture exists in a gap — narrow the range with from/to and ask again.',
        }
      : {}),
  });
}
