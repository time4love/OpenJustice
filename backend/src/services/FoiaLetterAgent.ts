import { z } from 'zod';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import { LLMFactory } from '../factories/LLMFactory';

export const FoiaLetterOutputSchema = z.object({
  letterText: z
    .string()
    .describe(
      'The full FOIA request letter in Hebrew, ready to send. ' +
        'Use the exact placeholder {{REQUESTER_NAME}} wherever the requester\'s name or signature ' +
        'should appear — the frontend will substitute it with the actual name entered by the user. ' +
        'Use the exact placeholder {{DATE}} wherever the submission date should appear. ' +
        'Includes: recipient block (ministry + title + address), subject line, legal basis citation, ' +
        'numbered specific requests (3–5), response deadline reminder (30 days per סעיף 7(א)), ' +
        'fee-waiver statement, and a closing with {{REQUESTER_NAME}} and {{DATE}}.',
    ),
  targetMinistry: z
    .string()
    .describe(
      'The specific Israeli government ministry or public body this letter should be addressed to. ' +
        'In Hebrew (e.g. משרד הבריאות, משרד ראש הממשלה, המשרד להגנת הסביבה). ' +
        'Choose the body most likely to hold the requested information.',
    ),
  legalBasis: z
    .string()
    .describe(
      'The primary legal basis cited in the letter — statute name and relevant sections. ' +
        'For most requests: חוק חופש המידע, התשנ"ח-1998, סעיפים 7-8.',
    ),
  targetEmail: z
    .string()
    .optional()
    .describe(
      'The best-known FOIA officer or public enquiries email address for the target ministry. ' +
        'Provide if known from training data (e.g. "chofesh.mida@moh.health.gov.il" for משרד הבריאות). ' +
        'Omit if genuinely unknown rather than guessing.',
    ),
  targetAddress: z
    .string()
    .optional()
    .describe(
      'The mailing address of the target ministry in Hebrew, formatted for a letter header ' +
        '(e.g. "רחוב בן טבאי 2, ירושלים 9101002"). Omit if unknown.',
    ),
});

export type FoiaLetterOutput = z.infer<typeof FoiaLetterOutputSchema>;

function assertSchemaCompatibility(): void {
  const jsonSchema = toJsonSchema(FoiaLetterOutputSchema) as { properties?: Record<string, unknown> };
  const missing = Object.keys(FoiaLetterOutputSchema.shape).filter(
    (f) => !(f in (jsonSchema.properties ?? {})),
  );
  if (missing.length > 0) {
    throw new Error(
      `[FoiaLetterAgent] Schema compatibility failure: fields dropped — [${missing.join(', ')}].`,
    );
  }
}

assertSchemaCompatibility();

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a legal assistant helping activists draft Israeli Freedom of Information (FOI) requests.

You are given:
- A legal thesis under construction about potential Covid-19 policy failures by Israeli authorities
- A specific evidence gap that must be filled to prove the thesis
- A suggested search to address the gap

Your task is to draft a formal Hebrew FOIA request letter targeting the Israeli government body most likely to hold the relevant documents.

LETTER STRUCTURE (follow exactly):
1. Recipient block — ministry name, title ("המנהל הכללי" or "ממונה על חופש המידע"), and address
2. Date line — use {{DATE}} as the placeholder
3. Subject line — נושא: בקשה לקבלת מידע לפי חוק חופש המידע, התשנ"ח-1998
4. Opening paragraph — state who is asking (use {{REQUESTER_NAME}}) and the legal basis
5. Numbered requests — 3-5 specific, concrete information requests derived from the gap
6. Fee-waiver paragraph — cite תקנות חופש המידע (אגרות), התשנ"ט-1999, תקנה 6 for public-interest waiver
7. Timeline paragraph — remind the ministry of the 30-day statutory response period per סעיף 7(א)
8. Closing — professional, respectful sign-off with {{REQUESTER_NAME}} and {{DATE}}

PLACEHOLDERS — use these exact strings, do not replace them:
- {{REQUESTER_NAME}} — the requester's name (user will fill this in; use it in the opening and closing)
- {{DATE}} — the submission date (auto-filled to today; use it in the header and closing)

LEGAL BASIS:
- Primary: חוק חופש המידע, התשנ"ח-1998
- Section 7(א): obligation to respond within 30 days (extendable by 30 days with notice)
- Section 9: exemptions — pre-empt the most likely ones for the requested documents
- Regulation 6 of תקנות חופש המידע (אגרות): fee waiver for public-interest requests

KNOWN ISRAELI MINISTRY FOIA CONTACTS (use when relevant):
- משרד הבריאות: email chofesh.mida@moh.health.gov.il | רחוב בן טבאי 2, ירושלים 9101002
- משרד ראש הממשלה: email dover@pmo.gov.il | שדרות קפלן 3, ירושלים 9101001
- משרד המשפטים: email cfm@justice.gov.il | רחוב צלח א-דין 29, ירושלים 9107701
- משרד הכלכלה: email cfm@economy.gov.il | שדרות בן גוריון 5, ירושלים 9195013
- מד"א (מגן דוד אדום): pniyot@mdais.org
- National Immunization Programme / מחלקת חיסונים — report through Ministry of Health above

RULES:
- Write entirely in professional, formal Hebrew
- Requests must be specific and concrete — avoid vague requests that are easy to reject
- Derive requests directly from the gap description and suggested search
- Provide targetEmail and targetAddress if you can confidently identify them; omit if uncertain`;

// ---------------------------------------------------------------------------
// FoiaLetterAgent
// ---------------------------------------------------------------------------

export class FoiaLetterAgent {
  private readonly chain: { invoke(input: unknown): Promise<unknown> };

  constructor() {
    const model = LLMFactory.getChatModel('FOIA_LETTER', { temperature: 0.2 });
    this.chain = model.withStructuredOutput(FoiaLetterOutputSchema, {
      name: 'foia_letter',
    }) as { invoke(input: unknown): Promise<unknown> };
  }

  async generate(input: {
    thesisTitle: string;
    gapDescription: string;
    suggestedSearch: string;
  }): Promise<FoiaLetterOutput> {
    const { thesisTitle, gapDescription, suggestedSearch } = input;

    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      {
        role: 'human' as const,
        content:
          `THESIS: ${thesisTitle}\n\n` +
          `EVIDENCE GAP:\n${gapDescription}\n\n` +
          `SUGGESTED SEARCH / INFORMATION NEEDED:\n${suggestedSearch}\n\n` +
          `Draft the FOIA request letter. Use {{REQUESTER_NAME}} and {{DATE}} as placeholders. ` +
          `Be specific in the numbered requests — generic requests are routinely rejected. ` +
          `Include targetEmail and targetAddress if you can identify them with confidence.`,
      },
    ];

    const result = await this.chain.invoke(messages);
    return FoiaLetterOutputSchema.parse(result);
  }
}
