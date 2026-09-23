import { LLMFactory, resolveModelId } from '../factories/LLMFactory';
import { assertSchemaCompatibility } from '../lib/assertSchemaCompatibility';
import { DOCUMENT_DESCRIPTION_PROMPT, DOCUMENT_DESCRIPTION_PROMPT_VERSION } from '../prompts/documentDescription';
import { documentReadingBody, type DocumentOpinion } from './documentContentVersions';

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
// ---------------------------------------------------------------------------

assertSchemaCompatibility(documentReadingBody, 'documentDescriber');

/** The agent type the factory resolves — `DOCUMENT_DESCRIBER_PROVIDER` would choose it; none is set. */
export const DESCRIBER_AGENT = 'DOCUMENT_DESCRIBER';

/** What the describer reads: the title the researcher gave, and EITHER the file OR the computed text. */
export type DescriberInput =
  | { title: string; file: { mimeType: string; base64: string } }
  | { title: string; text: string };

export async function describe(input: DescriberInput): Promise<DocumentOpinion> {
  const model = LLMFactory.getChatModel(DESCRIBER_AGENT, { temperature: 0 });
  const chain = model.withStructuredOutput(documentReadingBody, { name: 'document_reading' }) as {
    invoke(input: unknown): Promise<unknown>;
  };
  const heading = `שם המסמך, כפי שהחוקר נתן אותו: ${input.title}`;
  const content =
    'file' in input
      ? [
          { type: 'text', text: heading },
          { type: 'file', source_type: 'base64', mime_type: input.file.mimeType, data: input.file.base64 },
        ]
      : `${heading}\n\n--- הטקסט המחושב ---\n${input.text}\n--- סוף הטקסט ---`;

  const raw = await chain.invoke([
    { role: 'system', content: DOCUMENT_DESCRIPTION_PROMPT },
    { role: 'user', content },
  ]);

  return {
    model: resolveModelId(DESCRIBER_AGENT),
    promptVersion: DOCUMENT_DESCRIPTION_PROMPT_VERSION,
    body: documentReadingBody.parse(raw),
  };
}
