import { ChatAnthropic } from '@langchain/anthropic';
import { z } from 'zod';
import type { BaseMessageChunk } from '@langchain/core/messages';
import { VectorStoreService } from './VectorStoreService';

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
// System prompts
// ---------------------------------------------------------------------------

const EXTRACTION_SYSTEM_PROMPT = `You are a precise document text extraction assistant. Your ONLY task is to extract ALL visible text from the provided document or image — verbatim, preserving order and structure. If the document is in a language other than English, preserve the original language exactly. After the extracted text, append a separator line "---" followed by a single sentence describing the document type and visual provenance (e.g. "Official government letterhead", "Screenshot of a social media post", "Scanned printed memo").`;

const CLASSIFICATION_SYSTEM_PROMPT = `You are a Senior Legal Analyst building a class-action lawsuit against the Ministry of Health regarding Covid-19 policies.

The three primary legal theories of liability are:
1. **Side Effect Withholding** — Deliberate suppression or delayed disclosure of adverse event data.
2. **Regulatory Misleading** — False or misleading representations to regulators (e.g. FDA approval process, efficacy claims).
3. **Coercion** — Undue pressure, mandates, or threats used to compel vaccination or compliance without true informed consent.

You will receive:
- The extracted text of a submitted document.
- Optionally, a context block with summaries of related existing evidence (for calibration purposes only — do not cite them in your output).

Your task is to classify the submitted document strictly according to the provided JSON schema. You must:
- Be objective and evidence-based.
- Never invent facts, laws, or citations not present in the submitted content.
- Assign the evidenceTier based solely on the legal strength and provenance of the material provided.
- If the content is clearly unrelated to these legal theories, set isRelevant to false.
- For targetEntity, extract the most specific named entity accountable for the offence. If multiple entities are responsible, name the primary one. If no entity can be identified, use "Unknown".
- CRITICAL LANGUAGE REQUIREMENT: You MUST write the summary and missingInformation values in fluent, natural Hebrew (עברית שוטפת). The category and evidenceTier fields must remain in English for database consistency.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the content block for the vision extraction call.
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

/**
 * Safely extract the text content from a BaseMessageChunk,
 * handling both string content and content block arrays.
 */
function extractContent(message: BaseMessageChunk): string {
  if (typeof message.content === 'string') return message.content;
  return (message.content as Array<{ text?: string }>)
    .map((block) => block.text ?? '')
    .join('\n')
    .trim();
}

// ---------------------------------------------------------------------------
// IntakeAgent
// ---------------------------------------------------------------------------

export class IntakeAgent {
  // Typed as minimal interfaces to avoid fighting LangChain's overloaded generics.
  readonly model: ChatAnthropic;
  private readonly classificationChain: { invoke(input: unknown): Promise<unknown> };

  constructor(private readonly vectorStore: VectorStoreService) {
    this.model = new ChatAnthropic({ model: 'claude-sonnet-4-6', temperature: 0 });
    this.classificationChain = this.model.withStructuredOutput(IntakeOutputSchema, {
      name: 'intake_analysis',
    }) as { invoke(input: unknown): Promise<unknown> };
  }

  /**
   * Analyse a file buffer and return a validated, typed intake analysis.
   *
   * Workflow:
   *  1. Vision extraction — passes the file to Claude Vision to extract all text.
   *  2. Context search — queries the vector store for up to 3 related existing records.
   *  3. Classification — structured LLM call using extracted text + vector context.
   *
   * Returns a draft IntakeOutput. No hashing or on-chain/vector-store writes occur here.
   *
   * @param fileBuffer  Raw bytes of the uploaded file.
   * @param mimeType    MIME type of the file (image/jpeg, image/png, application/pdf).
   */
  async analyzeEvidence(fileBuffer: Buffer, mimeType: string): Promise<IntakeOutput> {
    // 1. Vision extraction
    const base64 = fileBuffer.toString('base64');
    const fileBlock = buildFileContentBlock(base64, mimeType);

    const extractionResult = await this.model.invoke([
      { role: 'system' as const, content: EXTRACTION_SYSTEM_PROMPT },
      {
        role: 'human' as const,
        content: [fileBlock, { type: 'text' as const, text: 'Extract all text from this document.' }],
      },
    ]);

    const extractedText = extractContent(extractionResult);

    // 2. Vector context search (top 3 semantically related records)
    const contextEvidence = await this.vectorStore.searchSimilarEvidence(
      extractedText.slice(0, 500),
      3,
    );

    // 3. Classification with context
    const contextBlock =
      contextEvidence.length > 0
        ? `\n\nContext — existing related evidence (for classification calibration only — do not cite or reference these):\n${JSON.stringify(
            contextEvidence.map((e) => ({
              tier: e.metadata.tier,
              category: e.metadata.category,
              summary: e.metadata.summary,
            })),
            null,
            2,
          )}`
        : '';

    const messages = [
      { role: 'system' as const, content: CLASSIFICATION_SYSTEM_PROMPT },
      { role: 'human' as const, content: `${extractedText}${contextBlock}` },
    ];

    const result = await this.classificationChain.invoke(messages);
    return IntakeOutputSchema.parse(result);
  }
}
