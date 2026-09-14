import { z } from 'zod';
import { LLMFactory } from '../factories/LLMFactory';
import { assertSchemaCompatibility } from '../lib/assertSchemaCompatibility';
import { FOIA_REQUEST_PROMPT } from '../prompts/foiaRequestDrafting';
import type { ComputedContent } from './framingRounds';

// ---------------------------------------------------------------------------
// THE FOIA DRAFTER — docs/gf-thesis-flows.md T4 :654–:683, A4 :1496–:1499.
//
// IT WRITES NOTHING AND IMPORTS NO DATABASE CLIENT (A7 `models-write-no-state` :1639–:1642); and its output is not
// state at all — "a request is not a researcher act and creates no state" (T4 :656). `draft_foia_request` returns the
// draft; the researcher reads it, amends it, and passes what they approve to `decide_gap REQUESTED`.
//
// ONE EXPORTED FUNCTION, `draftRequest` — the boundary the suite stubs (R48 §6-R25).
// ---------------------------------------------------------------------------

/** A cited record as the drafter reads it: its label, its name, its CURRENT computed content, and the passages citing it. */
export type DraftRecord = { label: string; name: string; passages: readonly string[] } & ComputedContent;

export interface DraftInput {
  claim: string;
  provision: string | null;
  gap: { gapId: string; description: string; readsAs: string };
  records: readonly DraftRecord[];
}

/**
 * A4 :1498's return, MINUS `addresses` — the tool fills them from the code table by the authority named here (R20) —
 * and with `restsOn` as the LABELS the call handed, which the tool resolves to names.
 */
export const FoiaDraftSchema = z.object({
  text: z.string().describe('The letter, in the statutory form, with {{REQUESTER_NAME}} and {{DATE}} as they are'),
  authority: z.string().describe('The body the request is addressed to, by its official name'),
  legalBasis: z.string().describe('The sections the request rests on'),
  restsOn: z.array(z.string()).describe('The LABELS of the records the request rests on, e.g. ["[1]"] — only those handed'),
});

export type FoiaDraft = z.infer<typeof FoiaDraftSchema>;

assertSchemaCompatibility(FoiaDraftSchema, 'foiaDrafter');

function recordBlock(record: DraftRecord): string {
  const content =
    record.kind === 'CAPTURE'
      ? `צילום ${record.capture} של ${record.url}\n--- הטקסט המחושב ---\n${record.text}`
      : [
          `שינוי בין הצילומים ${record.before} ו-${record.after} של ${record.url}`,
          ...record.chunks.map((c) => `${c.side === 'REMOVED' ? 'נמחק' : 'נוסף'}: ${c.text}`),
        ].join('\n');
  return `${record.label} #ev_${record.name}\n${content}\n--- הפסקאות בתזה שמצטטות אותה ---\n${record.passages.join('\n\n')}`;
}

/** ONE DRAW, and nothing is written with it. */
export async function draftRequest(input: DraftInput): Promise<FoiaDraft> {
  const model = LLMFactory.getChatModel('THESIS_FOIA', { temperature: 0 });
  const chain = model.withStructuredOutput(FoiaDraftSchema, { name: 'foia_request' }) as {
    invoke(input: unknown): Promise<unknown>;
  };

  const raw = await chain.invoke([
    { role: 'system', content: FOIA_REQUEST_PROMPT },
    {
      role: 'user',
      content:
        `הטענה: ${input.claim}\n${input.provision === null ? '' : `ההוראה: ${input.provision}\n`}\n` +
        `--- הפער ---\n${input.gap.description} (${input.gap.readsAs})\n\n` +
        `--- הרשומות ---\n${input.records.length === 0 ? 'הגרסה אינה מצטטת רשומות.' : input.records.map(recordBlock).join('\n\n')}`,
    },
  ]);

  // PARSED, NEVER TRUSTED RAW; a parse failure throws and is not retried (R48 §6-R25).
  return FoiaDraftSchema.parse(raw);
}
