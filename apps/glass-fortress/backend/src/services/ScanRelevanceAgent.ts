import { z } from 'zod';
import { LLMFactory } from '../factories/LLMFactory';
import { assertSchemaCompatibility } from '../lib/assertSchemaCompatibility';
import { SCAN_RELEVANCE_CHECK_PROMPT } from '../prompts/scanRelevanceCheck';

// ---------------------------------------------------------------------------
// Gate in front of /api/forensics/scan. A full scan can drive hundreds of LLM
// calls (WaybackScraper walks a URL's entire CDX history) — this is a single,
// cheap call that screens out URLs with no plausible connection to the
// investigation before that cost is incurred. See docs/gf-cost-exposure-dev-plan.md.
// ---------------------------------------------------------------------------

const ScanRelevanceSchema = z.object({
  isRelevant: z
    .boolean()
    .describe(
      'Whether tracking this page\'s edit history is plausibly useful to a Covid-19 health-policy ' +
        'investigation. Default to true when uncertain — see prompt for the full standard.',
    ),
  reason: z
    .string()
    .describe(
      '1-2 sentences of highly professional Hebrew explaining the decision — always populated, ' +
        'for both approvals and rejections.',
    ),
});

export type ScanRelevanceResult = z.infer<typeof ScanRelevanceSchema>;

/** How much of the page the model was given. */
export interface ScanRelevanceInputBound {
  /** Characters actually sent. */
  contentChars: number;
  /** True when the page was longer than that. */
  contentTruncated: boolean;
}

/**
 * The bound on what the model reads.
 *
 * A bound on what a JUDGEMENT reads is defensible in a way a bound on what is
 * STORED is not — a full scan costs hundreds of LLM calls, so screening cheaply
 * is the point. But it is only defensible while it is VISIBLE: unrecorded, a
 * rejection made on the first 10,000 characters is indistinguishable from one
 * made on the whole page, and unexamined caps are the family this codebase has
 * been burned by three times (the 8-chunk diff cap, MIN_CLAIM_LENGTH, [0:40k]).
 *
 * Exported so the value stored beside a verdict is the one that was applied,
 * rather than a second copy of the number.
 */
export const SCAN_RELEVANCE_MAX_CHARS = 10_000;

assertSchemaCompatibility(ScanRelevanceSchema, 'ScanRelevanceAgent');

export class ScanRelevanceAgent {
  private readonly chain: { invoke(input: unknown): Promise<unknown> };

  constructor() {
    const model = LLMFactory.getChatModel('SCAN_RELEVANCE', { temperature: 0 });
    this.chain = model.withStructuredOutput(ScanRelevanceSchema, {
      name: 'scan_relevance_check',
    }) as { invoke(input: unknown): Promise<unknown> };
  }

  /**
   * @param text     Page content (live-fetched or from the earliest archived
   *                 snapshot) — truncated before this call, not here.
   * @param url      Original URL, included as context.
   */
  async checkRelevance(
    text: string,
    url: string,
  ): Promise<ScanRelevanceResult & ScanRelevanceInputBound> {
    const messages = [
      { role: 'system' as const, content: SCAN_RELEVANCE_CHECK_PROMPT },
      {
        role: 'human' as const,
        content: `URL: ${url}\n\n---\n\n${text.slice(0, SCAN_RELEVANCE_MAX_CHARS)}`,
      },
    ];

    const result = await this.chain.invoke(messages);
    // The bound comes back with the verdict, computed from the SAME slice that
    // was sent — never recomputed by a caller, which would be a second copy of
    // the rule and could disagree with what the model actually read.
    return {
      ...ScanRelevanceSchema.parse(result),
      contentChars: Math.min(text.length, SCAN_RELEVANCE_MAX_CHARS),
      contentTruncated: text.length > SCAN_RELEVANCE_MAX_CHARS,
    };
  }
}
