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

  evidenceDate: z
    .string()
    .describe(
      'The date the evidence was published, created, or occurred, strictly in YYYY-MM-DD format. ' +
        'Search the entire image/document for any temporal marker: document creation dates, ' +
        'article publication dates, official letterhead dates, email/chat timestamps, ' +
        'government report dates. Extract the most legally relevant date. ' +
        'If absolutely no date can be found, output "Unknown".',
    ),
});

export type IntakeOutput = z.infer<typeof IntakeOutputSchema>;

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a Senior Legal Analyst building a class-action lawsuit against the Ministry of Health regarding Covid-19 policies. Analyze this image (evidence). Extract the text and intent.

The three primary legal theories of liability are:
1. **Side Effect Withholding** — Deliberate suppression or delayed disclosure of adverse event data.
2. **Regulatory Misleading** — False or misleading representations to regulators (e.g. FDA approval process, efficacy claims).
3. **Coercion** — Undue pressure, mandates, or threats used to compel vaccination or compliance without true informed consent.

Your task is to classify the evidence strictly according to the provided JSON schema. You must:
- Be objective and evidence-based.
- Never invent facts, laws, or citations not present in the submitted content.
- Assign the evidenceTier based solely on the legal strength and provenance of the material.
- If the content is clearly unrelated to these legal theories, set isRelevant to false.
- For targetEntity, extract the most specific named entity accountable for the offence. If no entity can be identified, use "Unknown".
- For evidenceDate, scan the ENTIRE image/document for any date — letterhead dates, publication dates, email timestamps, article bylines, official report dates, chat message timestamps. Output the most legally relevant date in strict YYYY-MM-DD format. If no date is visible anywhere, output "Unknown".
- CRITICAL LANGUAGE REQUIREMENT: ALL output strings (summary, missingInformation) MUST be written in highly professional Hebrew (עברית משפטית מקצועית). The category, evidenceTier, and evidenceDate fields must remain in English for database consistency.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the content block for the vision call.
 * Images are passed as image_url data-URIs; PDFs use Anthropic's native
 * document block format which LangChain passes through to the API.
 */
function buildFileContentBlock(base64: string, mimeType: string) {
  if (mimeType === 'application/pdf') {
    return {
      type: 'document' as const,
      source: {
        type: 'base64' as const,
        media_type: 'application/pdf' as const,
        data: base64,
      },
    };
  }
  return {
    type: 'image_url' as const,
    image_url: { url: `data:${mimeType};base64,${base64}` },
  };
}

// ---------------------------------------------------------------------------
// IntakeAgent
// ---------------------------------------------------------------------------

export class IntakeAgent {
  private readonly chain: { invoke(input: unknown): Promise<unknown> };

  constructor() {
    const model = new ChatAnthropic({ model: 'claude-sonnet-4-6', temperature: 0 });
    this.chain = model.withStructuredOutput(IntakeOutputSchema, {
      name: 'intake_analysis',
    }) as { invoke(input: unknown): Promise<unknown> };
  }

  /**
   * Analyse an evidence file and return a validated, typed analysis.
   *
   * Passes the file directly to Claude Vision with a combined legal analyst
   * system prompt. Returns a draft IntakeOutput — no hashing, blockchain,
   * or vector-store writes occur here.
   *
   * @param fileBuffer  Raw bytes of the uploaded file.
   * @param mimeType    MIME type of the file (image/jpeg, image/png, application/pdf).
   */
  async analyzeEvidence(fileBuffer: Buffer, mimeType: string): Promise<IntakeOutput> {
    const base64 = fileBuffer.toString('base64');
    const fileBlock = buildFileContentBlock(base64, mimeType);

    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      {
        role: 'human' as const,
        content: [
          fileBlock,
          { type: 'text' as const, text: 'Analyze this evidence document.' },
        ],
      },
    ];

    const result = await this.chain.invoke(messages);
    return IntakeOutputSchema.parse(result);
  }
}
