import { z } from 'zod';
import { LLMFactory } from '../factories/LLMFactory';
import { assertSchemaCompatibility } from '../lib/assertSchemaCompatibility';
import { FOIA_LETTER_DRAFTING_PROMPT } from '../prompts/foiaLetterDrafting';

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

assertSchemaCompatibility(FoiaLetterOutputSchema, 'FoiaLetterAgent');

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
      { role: 'system' as const, content: FOIA_LETTER_DRAFTING_PROMPT },
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
