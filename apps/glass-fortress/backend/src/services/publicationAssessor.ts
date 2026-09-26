import { z } from 'zod';
import { LLMFactory } from '../factories/LLMFactory';
import { assertSchemaCompatibility } from '../lib/assertSchemaCompatibility';
import { PUBLICATION_ASSESSMENT_PROMPT } from '../prompts/publicationAssessment';
import type { PublicationAssessment } from './publicationEvaluation';

// ---------------------------------------------------------------------------
// THE PUBLICATION ASSESSOR — docs/gf-thesis-flows.md T5 :755–:765, A6 :1599–:1601; thesis step 23.
//
// IT WRITES NOTHING AND IMPORTS NO DATABASE CLIENT (A7 `models-write-no-state` :1639–:1642). Its output reaches a row
// only through `publish_thesis`, AFTER the gate, parsed, stored VERBATIM on the attempt; `check_publication_readiness`
// returns it labelled and writes nothing. The material is loaded by `services/publishedThesis.ts` and handed here.
//
// ONE EXPORTED DRAW, `assess` — the boundary the suite stubs (R48 §6-R25); the model factory stays a tripwire.
//
// WHAT IT IS HANDED (the R49 sketch §d1): the claim, the provision, the version's text VERBATIM, THE_CALL and THE_REQUESTS
// as they would publish with it, the TITLE of every document the version cites — published with the citation (document
// §7 :848), so examined for personal names like the text (thesis :757 as CONFORMED 2026-09-26, R84 Q15; document A6
// :1537) — and the researcher's rationale. NEVER A RECORD'S CONTENT, a document's text, an analysis, a framing round, a
// debate or a note: a citation stays a name inside the text, so the assessor cannot judge what a record supports, and the
// prompt never asks it to.
//
// NO MODEL OR PROMPT-VERSION EXPORT (D16): the attempt row has no column for either, and a constant nothing stores is dead.
// ---------------------------------------------------------------------------

/** What the assessor is handed — the version's words and the appeals that publish with it, and nothing of the corpus. */
export interface PublicationMaterial {
  claim: string;
  provision: string | null;
  text: string;
  /** THE_CALL as it would publish with the version — each item the researcher's approved Json. */
  call: readonly unknown[];
  /** THE_REQUESTS likewise; a request's `restsOn` names stay names, never resolved. */
  requests: readonly unknown[];
  /** The TITLE of every document the version cites, as the researcher approved it — published with the citation (Q15). */
  titles: readonly string[];
  rationale: string;
}

const AssessmentShape = z.object({
  rationaleHasSubstance: z
    .boolean()
    .describe('Whether the rationale ARGUES — what the thesis claims, what the text rests on, where it stops'),
  substanceGaps: z.array(z.string()).describe('Which of the three parts the rationale is missing; [] when it has substance'),
  verdict: z
    .enum(['SUPPORTS', 'DISPUTES', 'NOT_REACHED'])
    .describe('Whether the rationale represents the TEXT faithfully; NOT_REACHED exactly when the rationale has no substance'),
  objection: z.string().describe('On DISPUTES, the specific mismatch between the rationale and the text; "" otherwise'),
  names: z
    .array(
      z.object({
        name: z.string().describe('A personal name, as written'),
        where: z.enum(['TEXT', 'CALL', 'REQUEST', 'TITLE']).describe('Where it appears — TITLE for a cited document\'s title'),
        quote: z.string().describe('The sentence it appears in, copied word for word'),
      }),
    )
    .describe('EVERY personal name in the text, the call items, the requests and the cited documents\' titles; [] when there are none'),
  allegationsFramed: z.boolean().describe('Whether the claims are framed as suspicions under examination, not proven facts'),
  allegationsNote: z
    .string()
    .describe('The sentence the text states as proven fact rather than as a suspicion — quoted; "" when framed'),
  assessment: z.string().describe('Hebrew, brief: the four judgements'),
});

assertSchemaCompatibility(AssessmentShape, 'publicationAssessor');

/**
 * The assessor's output, parsed: A2 :1335's `verdict` is SUPPORTS | DISPUTES | null, and the model says NOT_REACHED where
 * the row stores null — so NOT_REACHED is REFINED to hold exactly when the rationale has no substance. A model that
 * disputes a rationale it also calls empty has contradicted itself, and the parse refuses it.
 */
const PublicationAssessmentSchema = AssessmentShape.superRefine((output, ctx) => {
  if ((output.verdict === 'NOT_REACHED') !== !output.rationaleHasSubstance) {
    ctx.addIssue({
      code: 'custom',
      path: ['verdict'],
      message: `verdict ${output.verdict} with rationaleHasSubstance ${String(output.rationaleHasSubstance)}: NOT_REACHED is exactly the rationale with no substance`,
    });
  }
});

export type PublicationAssessorOutput = z.infer<typeof PublicationAssessmentSchema>;

/** One appeal as the researcher approved it — each field on its own line, under its label. */
function appealBlock(label: string, appeal: unknown): string {
  if (typeof appeal !== 'object' || appeal === null || Array.isArray(appeal)) {
    // A LOUD GUARD: `decide_gap` writes each appeal as an object; anything else is a malformed row, never an empty appeal.
    throw new Error(`publicationAssessor: appeal ${label} is not an object — a malformed decision, not an appeal to assess.`);
  }
  const fields = Object.entries(appeal).map(
    ([field, value]) => `${field}: ${Array.isArray(value) ? value.map(String).join(', ') : String(value)}`,
  );
  return [label, ...fields].join('\n');
}

function appealsSection(prefix: string, appeals: readonly unknown[], none: string): string {
  return appeals.length === 0 ? none : appeals.map((a, i) => appealBlock(`[${prefix}${String(i + 1)}]`, a)).join('\n\n');
}

/** ONE DRAW. Spent once per call, outside any transaction; nothing here is written. */
export async function assess(material: PublicationMaterial): Promise<PublicationAssessorOutput> {
  const model = LLMFactory.getChatModel('THESIS_PUBLICATION', { temperature: 0 });
  const chain = model.withStructuredOutput(AssessmentShape, { name: 'publication_assessment' }) as {
    invoke(input: unknown): Promise<unknown>;
  };

  const raw = await chain.invoke([
    { role: 'system', content: PUBLICATION_ASSESSMENT_PROMPT },
    {
      role: 'user',
      content:
        `הטענה: ${material.claim}\n${material.provision === null ? '' : `ההוראה: ${material.provision}\n`}\n` +
        `--- טקסט הגרסה ---\n${material.text}\n--- סוף הטקסט ---\n\n` +
        `--- הקריאה לחושפים ---\n${appealsSection('C', material.call, 'אין פריטים בקריאה.')}\n\n` +
        `--- בקשות חופש המידע ---\n${appealsSection('R', material.requests, 'אין בקשות.')}\n\n` +
        `--- שמות המסמכים המצוטטים ---\n${material.titles.length === 0 ? 'אין מסמכים מצוטטים.' : material.titles.map((title, i) => `[D${String(i + 1)}] ${title}`).join('\n')}\n\n` +
        `--- נימוק הפרסום ---\n${material.rationale}\n--- סוף הנימוק ---`,
    },
  ]);

  // PARSED, NEVER TRUSTED RAW — zod for every model output (CLAUDE.md). A parse failure THROWS; nothing is written and
  // nothing is retried: a retry is a second paid draw nobody approved (R48 §6-R25).
  return PublicationAssessmentSchema.parse(raw);
}

/** What the gate reads of the output (A3 :1394): substance, the names found, and the allegations opinion. */
export function projectionOf(output: PublicationAssessorOutput): PublicationAssessment {
  return {
    substance: output.rationaleHasSubstance,
    names: output.names.map((n) => n.name),
    allegationsFramed: output.allegationsFramed,
  };
}
