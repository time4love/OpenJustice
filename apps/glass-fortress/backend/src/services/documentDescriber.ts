import { LLMFactory, resolveModelId } from '../factories/LLMFactory';
import { assertSchemaCompatibility } from '../lib/assertSchemaCompatibility';
import { DOCUMENT_DESCRIPTION_PROMPT, DOCUMENT_DESCRIPTION_PROMPT_VERSION } from '../prompts/documentDescription';
import { documentReadingAnswer, documentReadingBody, type DocumentOpinion } from './documentContentVersions';

// ---------------------------------------------------------------------------
// THE DESCRIBER — the MODEL ACTOR behind `describe_document` (A4 :1437-:1441).
//
// IT IMPORTS NO DATABASE CLIENT, and that is thesis A7 :1639-:1643 (`models-write-no-state`):
// a model-actor module's output reaches a row only through the tool that called it, after the
// audit. `documentContentVersions` is imported for the zod SCHEMA of a reading, never for its
// writer; `describeDocument.ts` holds the client and writes.
//
// ONE DOCUMENT, READ THE WAY A4 :1441 RULES: an image or a PDF AS ITS FILE, a spreadsheet
// THROUGH ITS COMPUTED TEXT. The file travels as LangChain's standard data content block, which
// each provider adapter converts; the model is the factory's DEFAULT for this agent type, the one
// the assessor and the critic use (R76 Q-D, ruled: no environment change), and `resolveModelId`
// records which one actually ran.
//
// PARSED, NEVER TRUSTED RAW — zod for every model output (CLAUDE.md). A parse failure THROWS,
// nothing is written and nothing is retried: a retry is a second paid draw the researcher did
// not approve (the critic's rule, R48 §6-R25).
//
// A CUT ANSWER IS NOT A MALFORMED ONE — A4 :1439, :1441 as ruled 2026-09-23 (F3). On staging a draw
// hit the model's output limit mid-JSON and the partial body was stored as a reading. Two guards,
// EACH REFUSING ON ITS OWN ("twice over"): the provider's FINISH REASON, read off the raw message,
// and the REQUIRED terminal sentinel `wholeAnswer`, whose absence means the body stopped before its
// end. Either answers `{ incomplete }`, which the tool refuses as INCOMPLETE_ANSWER, writing nothing. A WHOLE answer's
// sentinel is STRIPPED before it is returned: the stored body is A2 :1302-:1303's fields only (Q2, ruled 2026-09-24).
// `maxOutputTokens` is the BACKSTOP; the prompt's word budget binds first (the researcher, 2026-09-24).
// ---------------------------------------------------------------------------

assertSchemaCompatibility(documentReadingAnswer, 'documentDescriber');

/** The agent type the factory resolves — `DOCUMENT_DESCRIBER_PROVIDER` would choose it; none is set. */
export const DESCRIBER_AGENT = 'DOCUMENT_DESCRIBER';

/**
 * The output-token BACKSTOP — ruled 2026-09-24 (the researcher): 32,768, twice the ~15k the v3 word budget comes to
 * (≈6,500 words of Hebrew with JSON escaping, an estimate), so the word budget binds first and this only catches a
 * model that ignores it. An operational parameter of interaction A8's kind.
 */
export const DESCRIBER_MAX_OUTPUT_TOKENS = 32_768;

/**
 * How each provider says "stopped at the output limit" on the raw message's `response_metadata` — Gemini's
 * `finishReason` (`@langchain/google-genai` carries the candidate's fields there) and Anthropic's `stop_reason`.
 */
const CUT = { finishReason: 'MAX_TOKENS', stop_reason: 'max_tokens' } as const;

/**
 * What the describer reads: the title the researcher gave, and EITHER the file — with whether the platform
 * already holds computed text for it, so the model is TOLD rather than left to guess whether to transcribe
 * (prompt v3) — OR the computed text itself.
 */
export type DescriberInput =
  | { title: string; file: { mimeType: string; base64: string }; computedText: boolean }
  | { title: string; text: string };

/**
 * Why an answer is INCOMPLETE, with the provider's finish reason beside it (null when it gave none): CUT — the finish
 * reason says the output limit stopped it; NO_SENTINEL — it parsed and stopped before `wholeAnswer`; UNPARSEABLE — the
 * adapter could not parse it at all. The refusal names what was missing, never "cut" for a finish reason that is not.
 */
export interface Incomplete {
  cause: 'CUT' | 'NO_SENTINEL' | 'UNPARSEABLE';
  finishReason: string | null;
}

/** A reading, or why the answer was INCOMPLETE — the tool refuses the second as INCOMPLETE_ANSWER. */
export type DescriberAnswer = DocumentOpinion | { incomplete: Incomplete };

export async function describe(input: DescriberInput): Promise<DescriberAnswer> {
  const model = LLMFactory.getChatModel(DESCRIBER_AGENT, { temperature: 0, maxOutputTokens: DESCRIBER_MAX_OUTPUT_TOKENS });
  const chain = model.withStructuredOutput(documentReadingAnswer, { name: 'document_reading', includeRaw: true }) as {
    invoke(input: unknown): Promise<{ raw: unknown; parsed: unknown }>;
  };
  const computed = 'text' in input || input.computedText;
  const heading = `שם המסמך, כפי שהחוקר נתן אותו: ${input.title}\nיש לפלטפורמה טקסט מחושב של המסמך: ${computed ? 'כן' : 'לא'}`;
  const content =
    'file' in input
      ? [
          { type: 'text', text: heading },
          { type: 'file', source_type: 'base64', mime_type: input.file.mimeType, data: input.file.base64 },
        ]
      : `${heading}\n\n--- הטקסט המחושב ---\n${input.text}\n--- סוף הטקסט ---`;

  const { raw, parsed } = await chain.invoke([
    { role: 'system', content: DOCUMENT_DESCRIPTION_PROMPT },
    { role: 'user', content },
  ]);

  const finishReason = finishReasonOf(raw);
  if (finishReason === CUT.finishReason || finishReason === CUT.stop_reason) return { incomplete: { cause: 'CUT', finishReason } };
  // THE SENTINEL: `parsed` is null when the adapter could not parse the answer at all — a truncated JSON — and an
  // object without `wholeAnswer: 'END'` stopped before its last field. Either is an incomplete answer, not a malformed one.
  if (typeof parsed !== 'object' || parsed === null) return { incomplete: { cause: 'UNPARSEABLE', finishReason } };
  if ((parsed as { wholeAnswer?: unknown }).wholeAnswer !== 'END') return { incomplete: { cause: 'NO_SENTINEL', finishReason } };

  // WHOLE: parsed against the ANSWER schema (a malformed field still THROWS), then STRIPPED to the body — zod's object
  // drops the key the body does not name, so the sentinel never reaches a row.
  return {
    model: resolveModelId(DESCRIBER_AGENT),
    promptVersion: DOCUMENT_DESCRIPTION_PROMPT_VERSION,
    body: documentReadingBody.parse(documentReadingAnswer.parse(parsed)),
  };
}

/** The provider's finish reason off the raw message, in whichever spelling its adapter uses; null when it gave none. */
function finishReasonOf(raw: unknown): string | null {
  const metadata = (raw as { response_metadata?: { finishReason?: unknown; stop_reason?: unknown } } | null)?.response_metadata ?? {};
  const reason = metadata.finishReason ?? metadata.stop_reason;
  return typeof reason === 'string' ? reason : null;
}
