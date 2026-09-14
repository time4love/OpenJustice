import { z } from 'zod';
import { LLMFactory, resolveModelId } from '../factories/LLMFactory';
import { assertSchemaCompatibility } from '../lib/assertSchemaCompatibility';
import { THESIS_CRITIQUE_PROMPT } from '../prompts/thesisCritique';
import type { ComputedContent } from './framingRounds';

// ---------------------------------------------------------------------------
// THE CRITIC — docs/gf-thesis-flows.md T4 :578–:614, A4 :1481–:1486.
//
// IT WRITES NOTHING AND IMPORTS NO DATABASE CLIENT (A7 `models-write-no-state` :1639–:1642). Its output reaches a row
// only through `run_analysis`, AFTER `services/thesisCriticAudit.ts` has put a verdict beside every assertion. Types
// from the modules that hold a client are imported as TYPES; the trajectories' spans are computed by
// `services/criticMaterial.ts` and handed here as data (R48 sketch §a).
//
// ONE EXPORTED FUNCTION, `critique` — the boundary the suite stubs (R48 §6-R25, §9-11): a case replaces this one
// export and holds the audit over its output; the model factory stays a tripwire.
//
// WHAT IT IS HANDED IS THE COMPUTED REGISTER, AND ONLY THAT (T4 :589–:590): the text, each cited record's CURRENT
// computed content, each trajectory, the gap list with its decisions — never a summary.
// ---------------------------------------------------------------------------

/** A cited record as the critic reads it: its label, its name, and its CURRENT computed content. */
export type CriticRecord = { label: string; name: string } & ComputedContent;

/** One stretch of a trajectory's presence history — a BOUND, not a duration (FINDING 77). */
export interface CriticSpan {
  date: string;
  present: boolean;
  captures: number;
  days: number | null;
  openEnded: boolean;
}

/** A cited trajectory, labelled `[T<n>·<id prefix>]` (FINDING 78); one no detection pass holds is said, never dropped. */
export type CriticTrajectory =
  | {
      label: string;
      id: string;
      resolves: true;
      url: string;
      claimText: string;
      finalState: string;
      spans: CriticSpan[];
      caveat: string;
    }
  | { label: string; id: string; resolves: false };

/** A gap of the list, at what it reads as. */
export interface CriticGap {
  gapId: string;
  description: string;
  readsAs: string;
  reason: string | null;
}

export interface CritiqueInput {
  claim: string;
  text: string;
  records: readonly CriticRecord[];
  trajectories: readonly CriticTrajectory[];
  gaps: readonly CriticGap[];
}

/**
 * A4 :1483–:1484's `opinion`, MINUS every verdict — `quoteVerified`, `phraseVerified` and a gap's id are the AUDIT's to
 * add, mechanically. A schema that asked the model for them would let it grade itself (`framingAssessor.ts` :66–:71).
 */
export const ThesisCritiqueSchema = z.object({
  counterArguments: z
    .array(
      z.object({
        quote: z.string().describe('A sentence of the thesis TEXT, copied VERBATIM. This is checked mechanically.'),
        challenge: z.string().describe("What a hostile reader says against that sentence"),
        grounding: z.enum(['RECORD', 'ABSENCE']).describe('RECORD: rests on what a record shows · ABSENCE: rests on what is missing'),
        source: z.string().describe('The LABEL it rests on, e.g. "[2]" or "[T1·6a505dc8]"; "" for an absence named in no record'),
        phrase: z
          .string()
          .describe('RECORD: a phrase IN that source\'s content · ABSENCE: the phrase whose absence is claimed. Checked mechanically.'),
      }),
    )
    .describe('Counter-arguments, each quoting the sentence it challenges. Empty when the version stands.'),
  suggestedGaps: z
    .array(
      z.object({
        description: z.string().describe('One sentence: what the thesis needs and the corpus lacks'),
        document: z.string().describe('The document that would close it'),
        holder: z.string().describe('Who holds that document'),
      }),
    )
    .describe('Candidates, not gaps — the researcher accepts or not.'),
  alternativeReadings: z.array(z.string()).describe('Readings of the same records that need no intent'),
  strength: z
    .object({
      grade: z.enum(['STRONG', 'MODERATE', 'WEAK']),
      reasoning: z.string(),
    })
    .describe("The critic's grade — shown as the critic's, gating nothing"),
});

export type ThesisCritique = z.infer<typeof ThesisCritiqueSchema>;

assertSchemaCompatibility(ThesisCritiqueSchema, 'thesisCritic');

/** Which model judged it — recorded on the analysis row beside the prompt version (A2 :1317). */
export const THESIS_CRITIC_MODEL = (): string => resolveModelId('THESIS_CRITIC');

function recordBlock(record: CriticRecord): string {
  if (record.kind === 'CAPTURE') {
    return `${record.label} #ev_${record.name}\nצילום ${record.capture} של ${record.url}\n--- הטקסט המחושב ---\n${record.text}`;
  }
  const removed = record.chunks.filter((c) => c.side === 'REMOVED').map((c) => c.text);
  const added = record.chunks.filter((c) => c.side === 'ADDED').map((c) => c.text);
  return [
    `${record.label} #ev_${record.name}\nשינוי בין הצילומים ${record.before} ו-${record.after} של ${record.url}`,
    removed.length > 0 ? `נמחק:\n- ${removed.join('\n- ')}` : 'לא נמחק תוכן.',
    added.length > 0 ? `נוסף:\n- ${added.join('\n- ')}` : 'לא נוסף תוכן.',
  ].join('\n');
}

/** A span, as a bound: "absent in N captures, up to D days until the next observed change" (FINDING 77). */
function spanLine(span: CriticSpan): string {
  const state = span.present ? 'מופיעה' : 'נעדרת';
  const captures = span.captures === 1 ? 'צילום אחד' : `${String(span.captures)} צילומים`;
  const days =
    span.days === null
      ? ''
      : span.openEnded
        ? `, עד ${String(span.days)} ימים עד הצילום האחרון, ללא שינוי נוסף`
        : `, עד ${String(span.days)} ימים עד השינוי הנצפה הבא`;
  return `  ${span.date} ${state} (${captures}${days})`;
}

function trajectoryBlock(t: CriticTrajectory): string {
  if (!t.resolves) return `${t.label} המסלול ${t.id} אינו קיים עוד באף מעבר זיהוי — לא ניתן להציגו.`;
  return [`${t.label} "${t.claimText}" — ${t.url}, מצב סופי ${t.finalState}`, ...t.spans.map(spanLine), `  (${t.caveat})`].join('\n');
}

function gapLine(gap: CriticGap): string {
  return `- ${gap.description} — ${gap.readsAs}${gap.reason === null ? '' : ` (${gap.reason})`}`;
}

/** ONE DRAW. `run_analysis` spends it once per call, outside any transaction, after ANALYSIS_CURRENT is decided. */
export async function critique(input: CritiqueInput): Promise<ThesisCritique> {
  const model = LLMFactory.getChatModel('THESIS_CRITIC', { temperature: 0 });
  const chain = model.withStructuredOutput(ThesisCritiqueSchema, { name: 'thesis_critique' }) as {
    invoke(input: unknown): Promise<unknown>;
  };

  const raw = await chain.invoke([
    { role: 'system', content: THESIS_CRITIQUE_PROMPT },
    {
      role: 'user',
      content:
        `הטענה: ${input.claim}\n\n--- טקסט הגרסה ---\n${input.text}\n--- סוף הטקסט ---\n\n` +
        `--- הרשומות ---\n${input.records.length === 0 ? 'הגרסה אינה מצטטת רשומות.' : input.records.map(recordBlock).join('\n\n')}\n\n` +
        `--- מסלולי טענות ---\n${input.trajectories.length === 0 ? 'הגרסה אינה מצטטת מסלולים.' : input.trajectories.map(trajectoryBlock).join('\n\n')}\n\n` +
        `--- רשימת הפערים ---\n${input.gaps.length === 0 ? 'אין פערים ברשימה.' : input.gaps.map(gapLine).join('\n')}`,
    },
  ]);

  // PARSED, NEVER TRUSTED RAW — zod for every model output (CLAUDE.md). A parse failure THROWS and nothing is written
  // and nothing is retried: a retry is a second paid draw the researcher did not approve (R48 §6-R25).
  return ThesisCritiqueSchema.parse(raw);
}
