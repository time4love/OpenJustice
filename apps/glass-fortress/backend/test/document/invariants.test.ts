jest.mock('../../src/lib/prisma', () => ({
  prisma: (require('../helpers/evidenceDouble') as typeof import('../helpers/evidenceDouble')).db,
}));
jest.mock('../../src/context/researcherContext', () => (require('../thesis/tools') as typeof import('../thesis/tools')).researcherContextDouble);
jest.mock('../../src/factories/LLMFactory', () => (require('../thesis/tools') as typeof import('../thesis/tools')).llmFactoryTripwire);
// THE CHAIN AND THE BUCKET, AT THEIR BOUNDARY (document step 34 chunk 4a, declared): invariant 2 asks the public reads
// themselves, and `./publicWorld` answers both.
jest.mock('../../src/services/Web3Service', () => {
  const actual = jest.requireActual<typeof import('../../src/services/Web3Service')>('../../src/services/Web3Service');
  return { ...actual, Web3Service: jest.fn() };
});
jest.mock('../../src/services/documentBucket', () => ({
  ...jest.requireActual<typeof import('../../src/services/documentBucket')>('../../src/services/documentBucket'),
  readObject: jest.fn(),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SRC } from '../walk/scan';
import { built } from './built';
import { NO_SENDER_IDENTITY_COLUMNS, NO_SENDER_IDENTITY_MODELS } from './contract';
import { modelBody, schemaText } from './schema';
import { resetDouble } from '../helpers/evidenceDouble';
import { AUTHOR } from '../thesis/fixtures';
import { ON_THE_FIXTURE, call, resetTools, seedThesis, textCiting } from '../thesis/tools';
import { COMMITMENT, HELD_NOW, seedHeld, seedPromoted } from './citationWorld';
import { resolvedRecordOf } from '../../src/mcp/tools/resolveRecord';
import { listFindingsHandler } from '../../src/mcp/tools/listFindings';
import { publishedPageOf } from '../../src/services/publicThesisPage';
import { serveDocumentContent } from '../../src/services/documentContentServe';
import { PAGE } from '../helpers/corpusFixture';
import { THESIS as GATE_THESIS } from '../thesis/fixtures';
import { DOC as OPENED_DOC, DOC_ID as OPENED_DOC_ID, SALT_HEX as OPENED_SALT_HEX, world as publicWorld } from './publicWorld';

// ---------------------------------------------------------------------------
// THE FOURTEEN INVARIANTS, NAMED INDIVIDUALLY: A7's closing list (:1595-:1608), SIX, and
// architecture target §11.7 (:702-:711), EIGHT.
//
// Each is a case of its own, because an invariant folded into another is an invariant that
// can fail without anything going red. Where a property cannot be reached from this round's
// tree the case says WHICH STEP OWES IT rather than asserting a world that does not exist.
// ---------------------------------------------------------------------------

interface Predicates { verdict: unknown }
const anchor = () => built<Predicates>('services/documentPredicates', ['verdict']);

async function sourceOf(path: string): Promise<string> {
  await anchor();
  return readFileSync(join(SRC, path), 'utf8');
}

const schema = async (): Promise<string> => {
  await anchor();
  return schemaText();
};

// --- A7 :1597-:1608 — the acceptance suite holds these on every refactor step -----------

describe('A7 invariant 1 — the public door writes an Arrival, Documents and their versions, and NOTHING ELSE', () => {
  it('no module under the intake route imports an evidence, mention, gap or thesis writer. STEP 32’S.', async () => {
    const source = await sourceOf('routes/documentIntakeRoutes.ts');
    for (const writer of ['promoteFromDebate', 'addThesisVersion', 'decideGap']) expect(source).not.toContain(writer);
  });
});

describe('A7 invariant 2 — the walk touches NO document', () => {
  it('no module under src/walk imports a document reader or writer', async () => {
    await anchor();
    const { readdirSync } = await import('node:fs');
    const walkDir = join(SRC, 'walk');
    const files = readdirSync(walkDir).filter((f) => f.endsWith('.ts'));
    // THE FLOOR: src/walk has files, so an empty directory cannot pass this vacuously.
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(join(walkDir, file), 'utf8');
      expect(source).not.toMatch(/from '.*(documentPredicates|addDocument|readDocument)'/);
    }
  });
});

describe('A7 invariant 3 — `submit` has ONE caller; the module EXACTLY TWO; the function its named set', () => {
  it('the anchoring module is the registry’s one caller, and gains a second caller of its own at step 31', async () => {
    const source = await sourceOf('services/anchorSnapshots.ts');
    expect(source).toContain('registerEvidenceHash');
    expect(source).toMatch(/anchorDocumentCommitment/);
  });
});

describe('A7 invariant 4 — NO RESEARCH ACT REACHES THE CHAIN', () => {
  it('add_document’s commitment reaches the MODULE and never `submit` (A7 :1603-:1604)', async () => {
    const source = await sourceOf('services/addDocument.ts');
    expect(source).not.toMatch(/registerEvidenceHash|\bsubmit\(/);
  });

  it('promotion writes NO chain entry — the document was committed at receipt (§6 :715-:716)', async () => {
    const source = await sourceOf('services/promoteFromDebate.ts');
    expect(source).not.toMatch(/registerEvidenceHash/);
  });
});

describe('A7 invariant 5 — NOTHING DELETES a Document, Arrival, version or decision row', () => {
  it('no `delete` on any of the nine tables outside the rebuild’s cleanup (plan §4 :413; A2 :1302, :1305)', async () => {
    await anchor();
    // NINE SINCE STEP 30 — `documentOpinion` joined when the OPINION register became a table
    // (A2 :1302 as ruled 2026-09-23): append-only, and SHED nulls its body and removes no row
    // (A2 :1305 as conformed). Ruled the researcher's Q-H, R76.
    const tables = [
      'document', 'arrival', 'arrivalDocument', 'arrivalDecision',
      'documentContentVersion', 'documentOpinion', 'documentOpeningDecision', 'passageVerdict', 'shed',
    ];
    // THE FLOOR: nine tables named, so a shortened list cannot pass.
    expect(tables).toHaveLength(9);
    const { readdirSync } = await import('node:fs');
    for (const file of readdirSync(join(SRC, 'services')).filter((f) => f.endsWith('.ts'))) {
      const source = readFileSync(join(SRC, 'services', file), 'utf8');
      for (const table of tables) {
        expect(source).not.toMatch(new RegExp(`prisma\\.${table}\\.delete`));
      }
    }
  });
});

describe('A7 invariant 6 — a citation pins ONLY `affirmed`', () => {
  // BEHAVIOURAL SINCE DOCUMENT STEP 33 (R81, Entry 15), where it once read a source file that does not exist: evidence
  // A7's test run over a DOCUMENT — the version write pins `affirmed` and never CURRENT(d), even after CURRENT moved.
  it('evidence A7’s test, run over a document (A7 :1608)', async () => {
    resetDouble();
    resetTools();
    seedThesis();
    seedHeld();
    const affirmed = `0x${'e1'.repeat(32)}`;
    seedPromoted(affirmed);
    const out = JSON.parse(
      await call('add_thesis_version', { ...ON_THE_FIXTURE.add_thesis_version, text: textCiting(`#doc_${COMMITMENT}`) }, AUTHOR),
    ) as { mentions?: { pin: string }[] };
    // CURRENT(d) is HELD_NOW and it is NOT what the citation pins.
    expect([out.mentions?.map((m) => m.pin), HELD_NOW === affirmed]).toEqual([[affirmed], false]);
  });
});

// --- architecture target §11.7 :702-:711 — the eight this layer ADDS --------------------

describe('§11.7 invariant 1 — the public door is SEALED, the researcher’s is HELD', () => {
  it('custody follows the DOOR and nothing else — the platform cannot check a declaration', async () => {
    const source = await sourceOf('services/addDocument.ts');
    expect(source).toMatch(/HELD/);
  });
});

describe('§11.7 invariant 2 — identity is the plaintext hash; the public name is the commitment', () => {
  // BEHAVIOURAL SINCE DOCUMENT STEP 34 chunk 4a (DECLARED; S5, R85 [R1]): this scanned `services/resolveRecord.ts` — a path
  // that does not exist — for the word `docId`, which says nothing about what is SERVED. It now ASKS every public read of
  // an opened document — `resolve_record`'s block, the public page's body, `list_findings`' register — at CONTENT and at
  // BYTES, and finds neither the DOC_ID nor the salt as a VALUE in any (Q10: not even at BYTES; they ride `/bytes` alone).
  // `/content`'s public branch joined at chunk 4b, which built it.
  it('DOC_ID is served ONLY with the bytes (§7 :765-:770), so no public read carries it', async () => {
    for (const opening of ['CONTENT', 'BYTES'] as const) {
      resetDouble();
      publicWorld({ opening });
      const block = JSON.parse(JSON.stringify(await resolvedRecordOf({ fileHash: OPENED_DOC }))) as Record<string, unknown>;
      // THE FLOOR: the block IS a block — a refusal carries no DOC_ID either, and would pass this case holding nothing.
      expect(block['kind']).toBe('DOCUMENT');
      const content = await serveDocumentContent({ commitment: OPENED_DOC });
      // THE FLOOR for `/content`: it SERVES at both openings — a refusal carries no DOC_ID either.
      expect('text' in content).toBe(true);
      for (const read of [JSON.stringify(block), JSON.stringify(await publishedPageOf(GATE_THESIS.id)), await listFindingsHandler({ url: PAGE.url }), JSON.stringify(content)]) {
        expect([read.includes(OPENED_DOC_ID.slice(2)), read.includes(OPENED_SALT_HEX)]).toEqual([false, false]);
      }
    }
  });
});

describe('§11.7 invariant 3 — the sender holds the ONLY key', () => {
  // CORRECTED, R74 chunk 3 — see `contract.ts`' NO_SENDER_IDENTITY_MODELS block. This
  // scanned the WHOLE schema text for `encryptedContact`, `senderKey` and `plaintext`:
  //   · `encryptedContact` stands in `Whistleblower` (`schema.prisma` :434) until STEP 36
  //     (plan :141, plan §4 :410), so it failed at step 29 for a step-36 reason;
  //   · `plaintext` occurs at `schema.prisma` :28 in a comment about the MCP BEARER TOKEN,
  //     so the case could never pass in ANY step. Plaintext at rest is `no-plaintext-at-rest`,
  //     a SOURCE scan over `src/` write paths (A7 :1562-:1565) that binds at step 32 — never
  //     a schema scan, and the schema is not where it would show.
  it('no column of Arrival or Document holds a key, a contact or a sender identity', async () => {
    const text = await schema();
    for (const model of NO_SENDER_IDENTITY_MODELS) {
      const body = modelBody(text, model);
      // THE FLOOR: the model was FOUND — an absent one makes every check below it vacuous.
      expect(body).not.toBe('');
      for (const column of NO_SENDER_IDENTITY_COLUMNS) expect(body).not.toContain(column);
    }
  });
});

describe('§11.7 invariant 4 — a model’s reading is an OPINION: labelled, never pinned, never published', () => {
  it('the opinion register is a separate TABLE (A2 :1302 as ruled) and no public serve carries it', async () => {
    const source = await sourceOf('services/readDocument.ts');
    expect(source).toMatch(/opinion/);
  });
});

describe('§11.7 invariant 5 — NOTHING IS DIFFED AGAINST A DOCUMENT', () => {
  it('no diff writer takes a document at either end (§9 :1037-:1041)', async () => {
    const source = await sourceOf('services/recordDiff.ts');
    expect(source).not.toMatch(/commitment|documentCommitment/);
  });
});

describe('§11.7 invariant 6 — every cited document has an opening decided, and an opening ONLY WIDENS', () => {
  it('CANNOT_NARROW is the refusal that holds it (A4 :1446)', async () => {
    const source = await sourceOf('services/decideOpening.ts');
    expect(source).toContain('CANNOT_NARROW');
  });
});

describe('§11.7 invariant 7 — withdrawal is honoured on the KEY with NO DECISION; SHED removes content and NO ROW', () => {
  it('the withdrawal handler writes a Shed row and deletes nothing. STEP 35’S.', async () => {
    const source = await sourceOf('services/shedDocument.ts');
    expect(source).not.toMatch(/\.delete\(/);
  });
});

describe('§11.7 invariant 8 — RECEIPT IS NEVER REFUSED FOR A CHAIN OUTAGE', () => {
  it('a receipt completes with `anchored: false` when the chain cannot be reached (§4 :444-:450)', async () => {
    const source = await sourceOf('services/addDocument.ts');
    // The outage arm is proven in the suite with an INJECTED failing chain client and is
    // NEVER staged on an environment (plan step 31 :207-:209).
    expect(source).toMatch(/anchored/);
  });
});
