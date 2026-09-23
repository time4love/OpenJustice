const invoked: unknown[] = [];
const answers: { value: unknown } = { value: null };
jest.mock('../src/factories/LLMFactory', () => ({
  LLMFactory: {
    getChatModel: () => ({
      withStructuredOutput: () => ({
        invoke: (messages: unknown) => {
          invoked.push(messages);
          return Promise.resolve(answers.value);
        },
      }),
    }),
  },
  resolveModelId: (agent: string) => `double:${agent}`,
}));

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LEGAL } from '../src/mcp/instructions';
import { DOCUMENT_DESCRIPTION_PROMPT, DOCUMENT_DESCRIPTION_PROMPT_VERSION } from '../src/prompts/documentDescription';
import { describe as describeDocumentWithModel } from '../src/services/documentDescriber';
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
});

describe('the reading is LABELLED and PARSED — COMPLIANCE rule 3, zod for every model output', () => {
  it('a well-formed reading comes back with the model and the prompt version beside it', async () => {
    answers.value = { summary: 'a circular', actors: ['the ministry'] };
    const opinion = await describeDocumentWithModel({ title: 'the circular', text: '# sheet1\na\tb' });
    expect(opinion).toEqual({
      model: 'double:DOCUMENT_DESCRIBER',
      promptVersion: DOCUMENT_DESCRIPTION_PROMPT_VERSION,
      body: { summary: 'a circular', actors: ['the ministry'] },
    });
  });

  it('a MALFORMED reading THROWS — nothing is written and nothing is retried', async () => {
    answers.value = { actors: 'the ministry' };
    await expect(describeDocumentWithModel({ title: 't', text: 'x' })).rejects.toThrow();
    expect(invoked).toHaveLength(1);
  });

  it('a FILE is handed to the model as its file; a spreadsheet as its computed TEXT (A4 :1441)', async () => {
    answers.value = {};
    await describeDocumentWithModel({ title: 't', file: { mimeType: 'image/png', base64: 'AAAA' } });
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
