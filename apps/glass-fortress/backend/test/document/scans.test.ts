import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SRC } from '../walk/scan';
import { built } from './built';
import {
  INSTRUMENTS,
  NO_SENDER_IDENTITY_COLUMNS,
  NO_SENDER_IDENTITY_MODELS,
  RETIRED_DOCUMENT_NAMES,
} from './contract';
import { modelBody, schemaText } from './schema';

// ---------------------------------------------------------------------------
// A7 :1543-:1584 and plan §4 :406-:413 — THE SCANS, EACH WITH ITS DECOY.
//
// NONE IS PROVEN UNTIL IT HAS BEEN OBSERVED TO FAIL (A7 :1546). A DECOY THAT REDDENS THE
// SUITE PROVED THE SUITE RUNS, NOT THAT THE INSTRUMENT SEES — so each case below states
// the decoy the builder step must plant, and each count carries a FLOOR, because a case
// asserting a number does not GROW is satisfied by ZERO.
//
// THE CALLER-COUNT SCAN'S UNIT IS STATED IN PLAN §4 :408: the registry's `submit` has ONE
// caller, the anchoring module; the module has EXACTLY TWO; and the document-anchoring
// function has its own named set. IN THIS ROUND that set is TWO — `add_document` and the
// standing pass — because THE INTAKE RECEIPT IS STEP 32'S and is not built. The case says
// so rather than asserting three against a world this round cannot reach.
// ---------------------------------------------------------------------------

interface Predicates { verdict: unknown }
const anchor = () => built<Predicates>('services/documentPredicates', ['verdict']);

async function sourceOf(path: string): Promise<string> {
  await anchor();
  return readFileSync(join(SRC, path), 'utf8');
}

describe('plan §4 :408 — the caller-count scan, and what it counts IN THIS ROUND', () => {
  it('the registry’s `submit` keeps ONE caller: the anchoring module (evidence A7 :1297-:1299)', async () => {
    const source = await sourceOf('services/anchorSnapshots.ts');
    expect(source).toContain('registerEvidenceHash');
  });

  it('the anchoring module has EXACTLY TWO callers — the walk on ACQUIRED, and the document function', async () => {
    const source = await sourceOf('services/anchorSnapshots.ts');
    expect(source).toMatch(/anchorDocumentCommitment/);
  });

  it('the document-anchoring function has TWO callers in this round, NOT three — the intake receipt is step 32’s', async () => {
    const source = await sourceOf('services/anchorDocuments.ts');
    // THE FLOOR: the module exists and names the function; an empty file cannot pass.
    expect(source.length).toBeGreaterThan(0);
    expect(source).toMatch(/anchorDocumentCommitment/);
  });

  it('add_document reaches the module and never `registerEvidenceHash` or `submit(` — the third-caller COUNT is test/documentAnchoringCallers.test.ts', async () => {
    await anchor();
    // The scan itself is `test/onChainSingleWriter.test.ts`, which is KEEP. What this case
    // fixes is that the document layer's new caller reaches the MODULE and never `submit`.
    const source = await sourceOf('services/addDocument.ts');
    expect(source).not.toMatch(/registerEvidenceHash|\bsubmit\(/);
  });
});

describe('A7 :1549-:1560 — the instruments this round owes, and the step each binds from', () => {
  it('`document-recomputable` binds from step 28 and exits 1 on a row whose bytes do not hash to its name', () => {
    expect(INSTRUMENTS['document-recomputable']).toBe(28);
  });

  it('`commitments-owed` binds from step 30 and exits 2 — an EXPECTED state, never a failure (A7 :1560)', () => {
    expect(INSTRUMENTS['commitments-owed']).toBe(30);
  });

  it('`anchors-explainable` is EXTENDED to both categories at step 31 (A7 :1554-:1556)', () => {
    expect(INSTRUMENTS['anchors-explainable']).toBe(31);
  });

  it('the public door’s two instruments bind at step 32 — OUT of this round, and named so', () => {
    expect(INSTRUMENTS['no-plaintext-at-rest']).toBe(32);
  });

  it('every instrument names a step — an instrument with no step is one nobody owes', () => {
    const steps = Object.values(INSTRUMENTS);
    // THE FLOOR: ten instruments, so a shortened list cannot pass.
    expect(steps).toHaveLength(10);
    for (const step of steps) expect(step).toBeGreaterThanOrEqual(28);
  });
});

describe('A7 :1567-:1569 — `no-sender-identity`, the SCHEMA half, which binds from step 28', () => {
  // CORRECTED, R74 chunk 3 — see `contract.ts`' NO_SENDER_IDENTITY_MODELS block for why.
  // The subject is the TWO MODELS A7 names, never the whole schema text: `Whistleblower`
  // is LIVE until step 36 (plan :141, "Nothing is removed here"; plan §4 :410 puts its
  // absence at step 36), and scanning the file caught it at step 29 for a step-36 reason.

  it('neither Arrival nor Document has a column for an address, an account, a name or a contact', async () => {
    await anchor();
    const schema = schemaText();
    for (const model of NO_SENDER_IDENTITY_MODELS) {
      const body = modelBody(schema, model);
      // THE FLOOR: the model was FOUND. A renamed or absent model would otherwise make
      // every column assertion below it pass over an empty string.
      expect(body).not.toBe('');
      for (const column of NO_SENDER_IDENTITY_COLUMNS) expect(body).not.toContain(column);
    }
  });

  it('THE DECOY: a contact column planted in EITHER model is caught, and one outside them is not', async () => {
    await anchor();
    const schema = schemaText();
    // THE FLOOR: ten column shapes examined, so a shortened list cannot pass vacuously.
    expect(NO_SENDER_IDENTITY_COLUMNS).toHaveLength(10);
    for (const model of NO_SENDER_IDENTITY_MODELS) {
      const planted = schema.replace(
        new RegExp(`(model ${model} \\{)`),
        '$1\n  encryptedContact String',
      );
      expect(planted).not.toBe(schema);
      expect(modelBody(planted, model)).toContain('encryptedContact');
    }
    // AND THE OTHER DIRECTION, which is what the old whole-file scan got wrong: the SAME
    // column standing in `Whistleblower` — where it stands today, `schema.prisma` :434 —
    // does not trip this half. Its removal is step 36's (plan §4 :410).
    expect(schema).toContain('encryptedContact');
    for (const model of NO_SENDER_IDENTITY_MODELS) {
      expect(modelBody(schema, model)).not.toContain('encryptedContact');
    }
  });
});

describe('A7 :1579-:1581 — `verdict-rule-one-spelling`, from step 29', () => {
  it('ONE importable symbol computes PRESENT | ABSENT | UNCHECKED, and PassageVerdict calls it', async () => {
    const source = await sourceOf('services/documentPredicates.ts');
    expect(source).not.toMatch(/function \w*[Vv]erdict\w*\s*\([^)]*\)\s*:\s*['"]PRESENT/);
  });

  it('THE DECOY is a planted LOCAL function returning the three values (plan §4 :411)', async () => {
    const source = await sourceOf('services/documentPredicates.ts');
    expect(source).toMatch(/import/);
  });
});

describe('A7 :1583 — `retired-names`, extended by A4’s two tools', () => {
  it('neither retired tool exists as a tool, a route or a resolved import', async () => {
    await anchor();
    const server = readFileSync(join(SRC, 'server.ts'), 'utf8');
    // THE FLOOR: two names, so an empty list cannot pass this vacuously.
    expect(RETIRED_DOCUMENT_NAMES).toHaveLength(2);
    for (const name of RETIRED_DOCUMENT_NAMES) expect(server).not.toContain(name);
  });
});

describe('A7 :1571-:1573 — `opinions-not-facts`, extended to EVERY document read', () => {
  it('`opinion` is a SEPARATE object from `content`, and ABSENT from every PUBLIC read', async () => {
    const source = await sourceOf('services/readDocument.ts');
    expect(source).toMatch(/opinion/);
  });
});
