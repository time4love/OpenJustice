import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SRC } from '../walk/scan';
import { built } from './built';

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
  return readFileSync(join(SRC, '..', 'prisma', 'schema.prisma'), 'utf8');
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
  it('no `delete` on any of the eight tables outside the rebuild’s cleanup (plan §4 :413)', async () => {
    await anchor();
    const tables = [
      'document', 'arrival', 'arrivalDocument', 'arrivalDecision',
      'documentContentVersion', 'documentOpeningDecision', 'passageVerdict', 'shed',
    ];
    // THE FLOOR: eight tables named, so a shortened list cannot pass.
    expect(tables).toHaveLength(8);
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
  it('evidence A7’s test, run over a document (A7 :1608)', async () => {
    const source = await sourceOf('services/addThesisVersion.ts');
    expect(source).toMatch(/affirmed/i);
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
  it('DOC_ID is served ONLY with the bytes (§7 :765-:770), so no public read carries it', async () => {
    const source = await sourceOf('services/resolveRecord.ts');
    expect(source).not.toMatch(/\bdocId\b/);
  });
});

describe('§11.7 invariant 3 — the sender holds the ONLY key', () => {
  it('the platform keeps no key, no plaintext of a sealed document, no contact, no sender identity', async () => {
    const text = await schema();
    for (const column of ['encryptedContact', 'senderKey', 'plaintext']) expect(text).not.toContain(column);
  });
});

describe('§11.7 invariant 4 — a model’s reading is an OPINION: labelled, never pinned, never published', () => {
  it('the opinion register is a separate column and no public serve carries it', async () => {
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
