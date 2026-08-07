import { z } from 'zod';
import { LLMFactory } from '../factories/LLMFactory';

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
      'A 2-3 sentence summary in highly professional Hebrew. It MUST include the SPECIFIC tactic or ' +
        'Modus Operandi used by the entity (e.g., instead of just saying "they lied", explain HOW they lied, ' +
        'such as "manipulated the mathematical denominator" or "hid the Re-challenge data").',
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

  keyFigures: z
    .array(z.string())
    .describe(
      'Extract ONLY the names of figures DIRECTLY INVOLVED, actively participating, or legally ' +
        'responsible for the events described in the evidence. ' +
        'Do NOT include background names, external politicians, or commentators cited merely for context ' +
        '(e.g., exclude Anthony Fauci or Albert Bourla if they are only mentioned in passing and bear ' +
        'no direct responsibility for the specific act described). ' +
        'ALL names MUST be transliterated or translated into Hebrew ' +
        '(e.g., "ד"ר שרון אלרוי-פריס", "פרופ\' מתי ברקוביץ\'", "אלברט בורלה"). ' +
        'Return an empty array if no directly responsible figures are named.',
    ),

  medicalConditions: z
    .array(z.string())
    .describe(
      'Extract broad medical categories — group minor symptoms under their major systemic category ' +
        'to avoid tag clutter (e.g., group dizziness + headache under "פגיעות נוירולוגיות"; ' +
        'group irregular periods + spotting under "שיבושים במחזור החודשי"). ' +
        'ALL medical tags MUST be written in professional Hebrew ' +
        '(e.g., "דלקת שריר הלב", "פגיעות נוירולוגיות", "שיבושים במחזור החודשי", "קרישי דם"). ' +
        'Return an empty array if no medical conditions are mentioned.',
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

  rejectionReason: z
    .string()
    .optional()
    .describe(
      'Populated ONLY when isRelevant is false. ' +
        'A single polite sentence in highly professional Hebrew explaining exactly why this ' +
        'submission was rejected — e.g. what specific threshold it failed to meet. ' +
        'Must be undefined (omitted) when isRelevant is true.',
    ),
});

export type IntakeOutput = z.infer<typeof IntakeOutputSchema>;

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a Senior Legal Analyst building a class-action lawsuit against the Ministry of Health regarding Covid-19 policies. Analyze this document (evidence). Extract the text and intent.

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
- For keyFigures, extract ONLY the names of individuals DIRECTLY RESPONSIBLE for or actively participating in the offence described. Do NOT include figures merely referenced for context. Transliterate all names into Hebrew (e.g., "ד\"ר שרון אלרוי-פריס", "פרופ' מתי ברקוביץ'"). Return an empty array if none qualify.
- For medicalConditions, group symptoms under their major systemic Hebrew category to avoid clutter (e.g., "דלקת שריר הלב", "פגיעות נוירולוגיות", "שיבושים במחזור החודשי"). ALL medical tags MUST be in professional Hebrew. Return an empty array if none are mentioned.
- For evidenceDate, scan the ENTIRE image/document for any date — letterhead dates, publication dates, email timestamps, article bylines, official report dates, chat message timestamps. Output the most legally relevant date in strict YYYY-MM-DD format. If no date is visible anywhere, output "Unknown".
- CRITICAL LANGUAGE REQUIREMENT: ALL output strings (summary, missingInformation, rejectionReason, keyFigures, medicalConditions) MUST be written in highly professional Hebrew (עברית משפטית מקצועית). The category, evidenceTier, and evidenceDate fields must remain in English for database consistency.

**REJECTION CRITERIA — You MUST set isRelevant: false AND populate rejectionReason in Hebrew if ANY of the following apply:**
1. The content is an opinion piece, editorial, commentary, or political argument that makes no specific, verifiable factual claim tied to the lawsuit pillars.
2. The content is a general social media post, rant, or personal grievance without concrete documentation of wrongdoing by a named entity.
3. The content is completely unrelated to Covid-19 policies, vaccine side effects, coercion, or regulatory conduct.
4. The content has zero factual evidentiary value that could be presented in a court of law (e.g. memes, satire, unrelated news, restaurant reviews, sports articles).

**EXCEPTION for Tier 4 — Personal Testimony:**
- ACCEPT a personal testimony ONLY IF the person describes a SPECIFIC direct physical injury (e.g. "I developed myocarditis 3 days after my second dose, confirmed by hospital records") or a SPECIFIC direct employer coercion they personally experienced (e.g. "My manager sent me a written letter threatening dismissal if I refused vaccination").
- REJECT vague statements like "the government lied to us", general protest slogans, or political opinions.

**CRITICAL: Never force irrelevant content into a category to avoid rejection. A strict, honest rejection with a clear rejectionReason is far more valuable to the legal team than a fabricated classification.**`;

const SYSTEM_PROMPT_TEXT = `You are a Senior Legal Analyst building a class-action lawsuit against the Ministry of Health regarding Covid-19 policies. Analyze the following web article / text document (evidence). The text has been extracted from a web page and is provided as plain text.

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
- For keyFigures, extract ONLY the names of individuals DIRECTLY RESPONSIBLE for or actively participating in the offence described. Do NOT include figures merely referenced for context. Transliterate all names into Hebrew (e.g., "ד\"ר שרון אלרוי-פריס", "פרופ' מתי ברקוביץ'"). Return an empty array if none qualify.
- For medicalConditions, group symptoms under their major systemic Hebrew category to avoid clutter (e.g., "דלקת שריר הלב", "פגיעות נוירולוגיות", "שיבושים במחזור החודשי"). ALL medical tags MUST be in professional Hebrew. Return an empty array if none are mentioned.
- For evidenceDate, scan the text for any date — article publication dates, bylines, official report dates. Output the most legally relevant date in strict YYYY-MM-DD format. If no date is visible, output "Unknown".
- CRITICAL LANGUAGE REQUIREMENT: ALL output strings (summary, missingInformation, rejectionReason, keyFigures, medicalConditions) MUST be written in highly professional Hebrew (עברית משפטית מקצועית). The category, evidenceTier, and evidenceDate fields must remain in English for database consistency.

**REJECTION CRITERIA — You MUST set isRelevant: false AND populate rejectionReason in Hebrew if ANY of the following apply:**
1. The content is an opinion piece, editorial, commentary, or political argument that makes no specific, verifiable factual claim tied to the lawsuit pillars.
2. The content is a general social media post, rant, or personal grievance without concrete documentation of wrongdoing by a named entity.
3. The content is completely unrelated to Covid-19 policies, vaccine side effects, coercion, or regulatory conduct.
4. The content has zero factual evidentiary value that could be presented in a court of law (e.g. memes, satire, unrelated news, restaurant reviews, sports articles).

**EXCEPTION for Tier 4 — Personal Testimony:**
- ACCEPT a personal testimony ONLY IF the person describes a SPECIFIC direct physical injury (e.g. "I developed myocarditis 3 days after my second dose, confirmed by hospital records") or a SPECIFIC direct employer coercion they personally experienced (e.g. "My manager sent me a written letter threatening dismissal if I refused vaccination").
- REJECT vague statements like "the government lied to us", general protest slogans, or political opinions.

**CRITICAL: Never force irrelevant content into a category to avoid rejection. A strict, honest rejection with a clear rejectionReason is far more valuable to the legal team than a fabricated classification.**`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the content block for the vision call.
 *
 * Gemini (default): both images and PDFs use the image_url data-URI format,
 * which LangChain's Google GenAI adapter converts to inline-data blobs.
 *
 * Anthropic fallback: PDFs require Anthropic's native document block; images
 * still use image_url.
 */
function buildFileContentBlock(base64: string, mimeType: string) {
  const provider = (process.env['INTAKE_PROVIDER'] ?? 'gemini').toLowerCase().trim();

  if (mimeType === 'application/pdf' && provider === 'anthropic') {
    return {
      type: 'document' as const,
      source: {
        type: 'base64' as const,
        media_type: 'application/pdf' as const,
        data: base64,
      },
    };
  }

  // Works for images (all providers) and PDFs (Gemini)
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
    const model = LLMFactory.getChatModel('INTAKE', { temperature: 0 });
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

  /**
   * Analyse plain-text evidence scraped from a web URL.
   *
   * Used by the URL intake flow. The text has already been extracted from HTML
   * by Readability — no vision call is needed.
   *
   * @param text       Cleaned article body text.
   * @param sourceUrl  Original URL, included as provenance context in the prompt.
   */
  async analyzeText(text: string, sourceUrl: string): Promise<IntakeOutput> {
    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT_TEXT },
      {
        role: 'human' as const,
        content: [
          {
            type: 'text' as const,
            text: `Source URL: ${sourceUrl}\n\n---\n\n${text.slice(0, 40_000)}`,
          },
          { type: 'text' as const, text: 'Analyze this evidence document.' },
        ],
      },
    ];

    const result = await this.chain.invoke(messages);
    return IntakeOutputSchema.parse(result);
  }
}
