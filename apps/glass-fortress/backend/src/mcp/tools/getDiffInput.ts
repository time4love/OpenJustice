import { z } from 'zod';
import { getDiffInput } from '../../services/diffInput';

// ---------------------------------------------------------------------------
// get_diff_input
//
// The page text a diff detected as changed — the classifier's INPUT — beside the
// items it produced.
//
// Nothing exposed this. get_forensic_timeline returns deletedText/addedText,
// which is classifier OUTPUT, so a change that was detected and then described by
// nobody is invisible there. The raw columns were reachable over REST and through
// no MCP tool, which is why the 2026-08-26 truncation defect took a curl loop
// against production's public endpoint to find, and could not be reproduced
// against staging at all — its REST surface is behind the access gate.
//
// READ tool: two stored columns, no model, no archive fetch, no write. Unlike
// preview_diff_classification, which is gated because it SPENDS.
// ---------------------------------------------------------------------------

export const getDiffInputSchema = {
  diffId: z
    .string()
    .optional()
    .describe(
      'The diff, from get_forensic_timeline. Diff ids are per-environment — the same page change ' +
        'has a different id in each database — so use url + afterDate to ask two environments about ' +
        'the same change.',
    ),
  url: z.string().url().optional().describe('Tracked URL. Use with afterDate instead of diffId.'),
  afterDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'afterDate must be YYYY-MM-DD')
    .optional()
    .describe('The snapshot date the change was detected in, YYYY-MM-DD. Use with url.'),
};

export async function getDiffInputHandler(input: {
  diffId?: string;
  url?: string;
  afterDate?: string;
}): Promise<string> {
  return JSON.stringify(
    await getDiffInput({
      ...(input.diffId !== undefined ? { diffId: input.diffId } : {}),
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.afterDate !== undefined ? { afterDate: input.afterDate } : {}),
    }),
  );
}
