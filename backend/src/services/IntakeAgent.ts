import { ChatAnthropic } from '@langchain/anthropic';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Evidence tier enum — business/legal classification
// ---------------------------------------------------------------------------

export const EVIDENCE_TIER = {
  ANECDOTAL: 'Tier 4: Anecdotal',
  SUPPORTING: 'Tier 3: Supporting',
  MATERIAL: 'Tier 2: Material',
  SMOKING_GUN: 'Tier 1: Smoking Gun',
} as const;

export type EvidenceTier = (typeof EVIDENCE_TIER)[keyof typeof EVIDENCE_TIER];

// ---------------------------------------------------------------------------
// Zod output schema
// ---------------------------------------------------------------------------

export const IntakeOutputSchema = z.object({
  isRelevant: z
    .boolean()
    .describe(
      'Whether the submitted content contains evidence relevant to the Covid-19 policy lawsuit.',
    ),

  category: z
    .enum(['Side Effect Withholding', 'Regulatory Misleading', 'Coercion', 'Other'])
    .describe('The legal category that best describes the nature of this evidence.'),

  summary: z
    .string()
    .describe(
      'A concise 2-3 sentence summary of what the evidence shows and why it is legally significant.',
    ),

  missingInformation: z
    .array(z.string())
    .describe(
      'List of items that would strengthen this evidence but are absent ' +
        '(e.g. "Missing original URL", "No date visible", "Author not identified").',
    ),

  targetEntity: z
    .string()
    .describe(
      'The specific entity, official, or organisation responsible for the offence described in the evidence ' +
        '(e.g. "Ministry of Health", "FDA", "Pfizer", "Employer", "HMO", "Specific Politician Name"). ' +
        'Extract directly from the evidence; do not invent.',
    ),

  evidenceTier: z
    .enum([
      'Tier 4: Anecdotal',
      'Tier 3: Supporting',
      'Tier 2: Material',
      'Tier 1: Smoking Gun',
    ])
    .describe(
      'Legal weight classification:\n' +
        '  Tier 4: Anecdotal   — Hearsay, social media posts, circumstantial. Low legal weight.\n' +
        '  Tier 3: Supporting  — Media articles, general patterns. Good for context but not definitive.\n' +
        '  Tier 2: Material    — Official documents, direct coercion letters, official public statements.\n' +
        '  Tier 1: Smoking Gun — Internal leaked documents, definitive proof of withholding info or explicit coercion.',
    ),
});

export type IntakeOutput = z.infer<typeof IntakeOutputSchema>;

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a Senior Legal Analyst building a class-action lawsuit against the Ministry of Health regarding Covid-19 policies.

The three primary legal theories of liability are:
1. **Side Effect Withholding** — Deliberate suppression or delayed disclosure of adverse event data.
2. **Regulatory Misleading** — False or misleading representations to regulators (e.g. FDA approval process, efficacy claims).
3. **Coercion** — Undue pressure, mandates, or threats used to compel vaccination or compliance without true informed consent.

Your task is to analyze the user-submitted text or document content and classify it strictly according to the provided JSON schema. You must:
- Be objective and evidence-based.
- Never invent facts, laws, or citations not present in the submitted content.
- Assign the evidenceTier based solely on the legal strength and provenance of the material provided.
- If the content is clearly unrelated to these legal theories, set isRelevant to false.
- For targetEntity, extract the most specific named entity accountable for the offence. If multiple entities are responsible, name the primary one. If no entity can be identified, use "Unknown".`;

// ---------------------------------------------------------------------------
// IntakeAgent
// ---------------------------------------------------------------------------

export class IntakeAgent {
  // Typed as a minimal interface to avoid fighting LangChain's overloaded generics.
  // Runtime behaviour is fully correct; the return type is validated by the Zod parse below.
  private readonly chain: { invoke(input: unknown): Promise<unknown> };

  constructor() {
    const model = new ChatAnthropic({
      model: 'claude-sonnet-4-6',
      temperature: 0,
    });

    this.chain = model.withStructuredOutput(IntakeOutputSchema, {
      name: 'intake_analysis',
    }) as { invoke(input: unknown): Promise<unknown> };
  }

  /**
   * Analyse raw evidence text and return a validated, typed output.
   *
   * @param rawText  The full text content of the submitted evidence document.
   * @returns        A validated IntakeOutput object conforming to the Zod schema.
   */
  async analyzeEvidence(rawText: string): Promise<IntakeOutput> {
    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      { role: 'human' as const, content: rawText },
    ];

    const result = await this.chain.invoke(messages);

    // withStructuredOutput already validates and parses via the Zod schema,
    // but we do a final parse to get a strongly-typed return value.
    return IntakeOutputSchema.parse(result);
  }
}
