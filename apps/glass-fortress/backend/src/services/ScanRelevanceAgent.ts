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
  async checkRelevance(text: string, url: string): Promise<ScanRelevanceResult> {
    const messages = [
      { role: 'system' as const, content: SCAN_RELEVANCE_CHECK_PROMPT },
      {
        role: 'human' as const,
        content: `URL: ${url}\n\n---\n\n${text.slice(0, 10_000)}`,
      },
    ];

    const result = await this.chain.invoke(messages);
    return ScanRelevanceSchema.parse(result);
  }
}
