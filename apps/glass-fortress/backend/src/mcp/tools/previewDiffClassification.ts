import { z } from 'zod';
import {
  previewDiffClassification,
  MAX_PREVIEW_RUNS,
} from '../../services/previewDiffClassification';

// ---------------------------------------------------------------------------
// preview_diff_classification
//
// "Given a diff, show me what the classifier says — without touching state."
//
// Nothing exposed this. get_forensic_timeline returns the STORED verdict, which
// is whatever was written at scan time by whatever prompt was current then;
// `forensics:reclassify` re-runs the classifier but OVERWRITES that verdict, so
// asking the question destroyed the previous answer, and it cannot run against
// production at all (FINDING 100).
//
// So the stored classifications on the one environment that matters most were
// both uninspectable and unreproducible. This makes them neither.
//
// Classified as a WRITE tool despite writing nothing. mcpRoutes.ts states the
// rule — "ask what it spends, not what it writes" — and this spends one full
// LLM call per `runs`, the same reason suggest_thesis and get_research_agenda
// are gated there.
// ---------------------------------------------------------------------------

export const previewDiffClassificationSchema = {
  diffId: z
    .string()
    .optional()
    .describe(
      'The diff to classify, from get_forensic_timeline. Diff ids are per-environment — the same ' +
        'page change has a different id in each database — so use url + afterDate to ask two ' +
        'environments about the same change.',
    ),
  url: z
    .string()
    .url()
    .optional()
    .describe('Tracked URL. Use with afterDate instead of diffId.'),
  afterDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'afterDate must be YYYY-MM-DD')
    .optional()
    .describe('The snapshot date the change was detected in, YYYY-MM-DD. Use with url.'),
  runs: z
    .number()
    .int()
    .min(1)
    .max(MAX_PREVIEW_RUNS)
    .optional()
    .describe(
      `How many independent classifications to draw (1-${String(MAX_PREVIEW_RUNS)}, default 1). The ` +
        'classifier is non-deterministic even at temperature 0, so a single run is one sample and ' +
        'cannot tell a real disagreement from noise. Each run costs a full LLM call.',
    ),
};

export async function previewDiffClassificationHandler(input: {
  diffId?: string;
  url?: string;
  afterDate?: string;
  runs?: number;
}): Promise<string> {
  if (input.diffId === undefined && (input.url === undefined || input.afterDate === undefined)) {
    return JSON.stringify({
      status: 'INVALID_INPUT',
      explanation:
        'Identify the diff either by diffId, or by url AND afterDate together. url alone is not ' +
        'enough — a tracked page has many diffs.',
    });
  }

  const result = await previewDiffClassification({
    ...(input.diffId !== undefined ? { diffId: input.diffId } : {}),
    ...(input.url !== undefined ? { url: input.url } : {}),
    ...(input.afterDate !== undefined ? { afterDate: input.afterDate } : {}),
    ...(input.runs !== undefined ? { runs: input.runs } : {}),
  });

  return JSON.stringify(result);
}
