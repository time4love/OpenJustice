const invoked: unknown[] = [];
const answers: { value: unknown } = { value: null };
/** The provider's finish reason on the raw message, as each adapter spells it (`response_metadata`). */
const finish: { metadata: Record<string, unknown> } = { metadata: { finishReason: 'STOP' } };
const asked: { options: unknown; config: unknown } = { options: null, config: null };
jest.mock('../src/factories/LLMFactory', () => ({
  LLMFactory: {
    getChatModel: (_agent: string, options: unknown) => {
      asked.options = options;
      return {
        withStructuredOutput: (_schema: unknown, config: { includeRaw?: boolean }) => {
          asked.config = config;
          return {
            // LangChain's `includeRaw` pipeline (`@langchain/core` structured_output.js :61-:62): the raw message beside
            // the parsed body, and `parsed: null` when the adapter could not parse the answer at all.
            invoke: (messages: unknown) => {
              invoked.push(messages);
              const raw = { response_metadata: finish.metadata };
              return Promise.resolve(config.includeRaw === true ? { raw, parsed: answers.value } : answers.value);
            },
          };
        },
      };
    },
  },
  resolveModelId: (agent: string) => `double:${agent}`,
}));

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LEGAL } from '../src/mcp/instructions';
import { DOCUMENT_DESCRIPTION_PROMPT, DOCUMENT_DESCRIPTION_PROMPT_VERSION } from '../src/prompts/documentDescription';
import { DESCRIBER_MAX_OUTPUT_TOKENS, describe as describeDocumentWithModel } from '../src/services/documentDescriber';
import { documentReadingAnswer, documentReadingBody } from '../src/services/documentContentVersions';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import { SRC, readCode, tsFiles } from './walk/scan';

// ---------------------------------------------------------------------------
// THE DESCRIBER — `describe_document`'s model actor (document step 30, A4 :1437-:1441).
//
// THE MODEL IS MOCKED AT ITS BOUNDARY — `factories/LLMFactory` — and nothing here reaches one.
// What is held: the reading is PARSED by zod and labelled; the LEGAL framing is IMPORTED from its
// one spelling, never retyped; the module holds no database client (thesis A7 :1639-:1643).
// ---------------------------------------------------------------------------

beforeEach(() => {
  invoked.length = 0;
  answers.value = null;
  finish.metadata = { finishReason: 'STOP' };
  asked.options = null;
  asked.config = null;
});

/** The sentinel every WHOLE answer ends with — A4 :1439 as ruled, the body schema's last field. */
const END = { wholeAnswer: 'END' } as const;

describe('the reading is LABELLED and PARSED — COMPLIANCE rule 3, zod for every model output', () => {
  it('a well-formed reading comes back with the model and the prompt version beside it', async () => {
    answers.value = { summary: 'a circular', actors: ['the ministry'], ...END };
    const opinion = await describeDocumentWithModel({ title: 'the circular', text: '# sheet1\na\tb' });
    expect(opinion).toEqual({
      model: 'double:DOCUMENT_DESCRIBER',
      promptVersion: DOCUMENT_DESCRIPTION_PROMPT_VERSION,
      body: { summary: 'a circular', actors: ['the ministry'] },
    });
    // STRIPPED (Q2 of R79's round 2, ruled 2026-09-24): the stored body is A2 :1302-:1303's fields only.
    expect('wholeAnswer' in (opinion as { body: object }).body).toBe(false);
  });

  it('a MALFORMED reading THROWS — nothing is written and nothing is retried', async () => {
    // WHOLE (the sentinel is there, the finish reason is STOP) and still malformed — not a cut answer.
    answers.value = { actors: 'the ministry', ...END };
    await expect(describeDocumentWithModel({ title: 't', text: 'x' })).rejects.toThrow();
    expect(invoked).toHaveLength(1);
  });

  it('a FILE is handed to the model as its file; a spreadsheet as its computed TEXT (A4 :1441)', async () => {
    answers.value = { ...END };
    await describeDocumentWithModel({ title: 't', file: { mimeType: 'image/png', base64: 'AAAA' }, computedText: false });
    await describeDocumentWithModel({ title: 't', text: 'the cells' });
    const [asFile, asText] = invoked as { role: string; content: unknown }[][];
    expect(JSON.stringify(asFile?.at(1)?.content)).toContain('"data":"AAAA"');
    expect(String(asText?.at(1)?.content)).toContain('the cells');
  });
});

describe('the LEGAL framing has ONE spelling — imported, never retyped (R76 Q-G)', () => {
  it('the prompt carries LEGAL whole', () => {
    expect(DOCUMENT_DESCRIPTION_PROMPT).toContain(LEGAL);
  });

  it('its opening words appear in ONE source file under src/ — `mcp/instructions.ts`', () => {
    const holders = tsFiles(SRC).filter((file) => readCode(file).includes('LEGAL FRAMING. All claims about named individuals'));
    // THE FLOOR: exactly one — zero would mean the scan cannot see the text at all.
    expect(holders.map((file) => file.replace(`${SRC}/`, ''))).toEqual(['mcp/instructions.ts']);
  });
});

describe('models-write-no-state — thesis A7 :1639-:1643, applied to the describer', () => {
  it('the describer imports no database client', () => {
    const source = readFileSync(join(SRC, 'services', 'documentDescriber.ts'), 'utf8');
    expect(source).toMatch(/from '\.\.\/factories\/LLMFactory'/);
    expect(source).not.toMatch(/lib\/prisma|@prisma\/client'|PrismaClient/);
  });
});

describe('the prompt’s VERSION moves with its TEXT — COMPLIANCE rule 3', () => {
  // A reading is labelled with the prompt's version (`documentDescriber.ts`), so a text changed
  // under an unchanged version labels two different prompts with one name. The pin makes a text
  // edit without a version bump RED: add the new version's hash here in the same change.
  const PINNED: Readonly<Record<string, string>> = {
    'v2-one-document-title-not-described': '8dc9d82f96f37cc93ed1b126e261ad7fd2a9f8c38fb9c14bcd6282e5da79557e',
    'v3-transcription-only-without-text-names-as-printed': '1b4e1be7e3caa59980162728d1498ea7abdb77dd2ce753a33b2392abb0fbe3a3',
  };

  it('the text hashes to the pin its version names', () => {
    const hash = createHash('sha256').update(DOCUMENT_DESCRIPTION_PROMPT).digest('hex');
    expect(PINNED[DOCUMENT_DESCRIPTION_PROMPT_VERSION]).toBe(hash);
  });
});

describe('the TITLE is the researcher’s name for the document — not part of it, and not described (R78 round 2, Fable’s LOW)', () => {
  it('the prompt says the title is not part of the document and is not to be described', () => {
    expect(DOCUMENT_DESCRIPTION_PROMPT).toMatch(/השם אינו חלק מהמסמך/);
    expect(DOCUMENT_DESCRIPTION_PROMPT).toMatch(/אל תתאר אותו/);
  });
});

// ---------------------------------------------------------------------------
// A CUT ANSWER IS REFUSED, TWICE OVER — A4 :1439, :1441 as ruled 2026-09-23 (F3; D doc §5 :197-:199, §9 Q3).
//
// On staging a paid draw hit the model's output limit mid-JSON and the partial body was STORED as a valid opinion,
// because six optional fields cannot tell an OMITTED field from a LOST one. Two guards, each refusing ON ITS OWN:
// the provider's finish reason, and a REQUIRED terminal sentinel as the body schema's LAST field.
// ---------------------------------------------------------------------------

describe('a CUT answer is INCOMPLETE — never a reading (A4 :1439, :1441; F3)', () => {
  it('the FINISH REASON refuses ON ITS OWN — MAX_TOKENS with a body that PARSES, sentinel and all (REVIEW MEDIUM)', async () => {
    finish.metadata = { finishReason: 'MAX_TOKENS' };
    answers.value = { summary: 'a whole-looking body', ...END };
    expect(await describeDocumentWithModel({ title: 't', text: 'x' })).toEqual({ incomplete: { cause: 'CUT', finishReason: 'MAX_TOKENS' } });
    expect(invoked).toHaveLength(1);
  });

  it('Anthropic’s spelling of the same fact — `stop_reason: max_tokens` — refuses too', async () => {
    finish.metadata = { stop_reason: 'max_tokens' };
    answers.value = { summary: 'a whole-looking body', ...END };
    expect(await describeDocumentWithModel({ title: 't', text: 'x' })).toEqual({ incomplete: { cause: 'CUT', finishReason: 'max_tokens' } });
  });

  it('the SENTINEL refuses ON ITS OWN — a body with no `wholeAnswer`, the finish reason STOP', async () => {
    answers.value = { summary: 'the first field, and then nothing' };
    expect(await describeDocumentWithModel({ title: 't', text: 'x' })).toEqual({ incomplete: { cause: 'NO_SENTINEL', finishReason: 'STOP' } });
  });

  it('an answer the adapter could not parse at all (`parsed: null`) is INCOMPLETE — a truncated JSON has no sentinel', async () => {
    answers.value = null;
    expect(await describeDocumentWithModel({ title: 't', text: 'x' })).toEqual({ incomplete: { cause: 'UNPARSEABLE', finishReason: 'STOP' } });
  });

  it('asks for the RAW message — the finish reason is read off it, never assumed', async () => {
    answers.value = { ...END };
    await describeDocumentWithModel({ title: 't', text: 'x' });
    expect(asked.config).toMatchObject({ includeRaw: true });
  });
});

describe('the SENTINEL is the ANSWER schema’s LAST field, REQUIRED — and never STORED (A4 :1439; Q2 ruled 2026-09-24)', () => {
  it('`wholeAnswer` is the last key of the answer schema, and an answer without it does not parse', () => {
    expect(Object.keys(documentReadingAnswer.shape).at(-1)).toBe('wholeAnswer');
    expect(documentReadingAnswer.safeParse({ summary: 's' }).success).toBe(false);
    expect(documentReadingAnswer.safeParse({ summary: 's', ...END }).success).toBe(true);
  });

  it('the STORED body schema has no sentinel — A2 :1302-:1303’s fields only', () => {
    expect(Object.keys(documentReadingBody.shape)).not.toContain('wholeAnswer');
    // THE FLOOR: the six reading fields are all there.
    expect(Object.keys(documentReadingBody.shape).sort()).toEqual(['actors', 'categories', 'date', 'description', 'summary', 'transcription']);
  });

  it('its name sorts LAST too — Gemini emits keys alphabetically when no order is sent (the adapter sends none)', () => {
    const keys = Object.keys(documentReadingAnswer.shape);
    expect([...keys].sort().at(-1)).toBe('wholeAnswer');
  });

  it('it compiles to `enum`, never `const` — the Gemini adapter passes the JSON schema through untouched', () => {
    const compiled = JSON.stringify(toJsonSchema(documentReadingAnswer));
    expect(compiled).not.toContain('"const"');
    expect(compiled).toContain('"enum":["END"]');
  });
});

describe('`maxOutputTokens` is the BACKSTOP; the prompt’s word budget binds first (the researcher, 2026-09-24)', () => {
  it('the model is asked for at most 32,768 output tokens', async () => {
    answers.value = { ...END };
    await describeDocumentWithModel({ title: 't', text: 'x' });
    expect(DESCRIBER_MAX_OUTPUT_TOKENS).toBe(32_768);
    expect(asked.options).toMatchObject({ maxOutputTokens: 32_768 });
  });
});

describe('prompt v3 — A4 :1439 as ruled 2026-09-23 (F3), its text approved 2026-09-24', () => {
  it('the model is TOLD whether computed text exists — transcription is decided by a fact, never guessed', async () => {
    answers.value = { ...END };
    await describeDocumentWithModel({ title: 't', file: { mimeType: 'application/pdf', base64: 'AAAA' }, computedText: true });
    await describeDocumentWithModel({ title: 't', file: { mimeType: 'image/png', base64: 'AAAA' }, computedText: false });
    await describeDocumentWithModel({ title: 't', text: 'the cells' });
    const told = (invoked as { content: unknown }[][]).map((call) => JSON.stringify(call.at(1)?.content));
    expect(told.at(0)).toContain('יש לפלטפורמה טקסט מחושב של המסמך: כן');
    expect(told.at(1)).toContain('יש לפלטפורמה טקסט מחושב של המסמך: לא');
    expect(told.at(2)).toContain('יש לפלטפורמה טקסט מחושב של המסמך: כן');
  });

  it('transcription ONLY without computed text, and a transcription past its budget STOPS WITH THE MARKER', () => {
    expect(DOCUMENT_DESCRIPTION_PROMPT).toContain('רק לתמונה או ל-PDF סרוק, ורק כשאין טקסט מחושב');
    expect(DOCUMENT_DESCRIPTION_PROMPT).toContain('[התמלול נעצר כאן — המסמך ממשיך]');
  });

  it('names are ALLOWED as the document prints them; character, intent and guilt stay forbidden', () => {
    expect(DOCUMENT_DESCRIPTION_PROMPT).toContain('בשמותיהם כפי שהמסמך מדפיס אותם');
    expect(DOCUMENT_DESCRIPTION_PROMPT).toContain('הגופים, היחידות, התפקידים והאנשים');
    expect(DOCUMENT_DESCRIPTION_PROMPT).toContain('אל תכתוב על כוונות, אשמה או אופי של אדם — גם כשהמסמך מזכיר אותו בשמו.');
  });

  it('the version is v3', () => {
    expect(DOCUMENT_DESCRIPTION_PROMPT_VERSION).toBe('v3-transcription-only-without-text-names-as-printed');
  });
});
