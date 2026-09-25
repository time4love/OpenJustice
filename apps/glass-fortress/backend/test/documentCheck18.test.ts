jest.mock('../src/lib/prisma', () => ({
  prisma: (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).db,
}));
jest.mock('../src/factories/LLMFactory', () => (require('./thesis/tools') as typeof import('./thesis/tools')).llmFactoryTripwire);

import * as evidencePredicates from '../src/services/evidencePredicates';
import { evaluatePublication, publishabilityOf, rowsOf, type ThesisCheck } from '../src/services/publicationEvaluation';
import { db, resetDouble, store, type Row } from './helpers/evidenceDouble';
import { VERSION } from './thesis/fixtures';
import { PASSING, evidencePasses, seedPublishable } from './thesis/gateWorld';
import { COMMITMENT, HELD_NOW, seedHeld, seedSealed } from './document/citationWorld';
import { mentionRow } from './thesis/rows';
import { resetTools } from './thesis/tools';

// ---------------------------------------------------------------------------
// CHECK 18 `DOCUMENT_OPENING_DECIDED`, BUILT AT DOCUMENT STEP 33 — docs/gf-document-refactor-plan.md :255 (R81 Q-2),
// docs/gf-document-flows.md A6 :1535: "every #doc_ mention of the head has a DocumentOpeningDecision, and none is BYTES
// on a sealed document; hard".
//
// WHY HERE AND NOW: step 33 makes a `#doc_` head writable, and the public reading of a document is step 34's. Check 18
// refuses publication of such a head until `decide_opening` exists, so the public page never meets a published
// document mention first. Nothing writes an opening before step 34, so these cases SEED one.
//
// HELD THROUGH THE GATE'S OWN FOLD, over the thesis gate world (`test/thesis/gateWorld.ts`, read, never edited): the
// rows `rowsOf` renders and the verdict `publishabilityOf` folds from THOSE rows — the one evaluation `publish_thesis`
// and `check_publication_readiness` both call. `test/thesis/gate.test.ts` reads A6's first seventeen rows only (:70–:71)
// and stays unedited; row 18 is appended after them.
// ---------------------------------------------------------------------------

/** The passing world, its head citing one document beside its record. */
async function seedCitingDocument(sealed = false): Promise<void> {
  await seedPublishable();
  if (sealed) seedSealed();
  else seedHeld();
  store.mentions = [
    ...store.mentions,
    mentionRow({ id: 'mention-doc', versionId: VERSION.id, kind: 'DOCUMENT', name: COMMITMENT, contentVersionHash: HELD_NOW, debateSessionId: null }, false),
  ];
}

const opening = (sequence: number, value: 'PASSAGE' | 'CONTENT' | 'BYTES'): Row => ({
  id: `opening-${String(sequence)}`,
  thesisId: store.thesis?.['id'],
  commitment: COMMITMENT,
  sequence,
  opening: value,
  researcherId: 'researcher-author',
  createdAt: new Date(Date.UTC(2026, 8, 22)),
});

async function rows(): Promise<ThesisCheck[]> {
  return rowsOf(await evaluatePublication(VERSION.id, PASSING));
}

const row18 = (all: readonly ThesisCheck[]): ThesisCheck => {
  // Compared as a STRING: a gate that has no such row must fail THIS case by name, not the file at compile time.
  const found = all.find((r) => String(r.id) === 'DOCUMENT_OPENING_DECIDED');
  if (found === undefined) throw new Error('the gate rendered no DOCUMENT_OPENING_DECIDED row');
  return found;
};

beforeEach(() => {
  resetDouble();
  resetTools();
  // THE EVIDENCE HALF AS THE THESIS GATE'S OWN CASES STAND IT (`test/thesis/gate.test.ts` :107): rows 5–10 are evidence's,
  // held there; this file asks row 18 only.
  jest.spyOn(evidencePredicates, 'publishableEvidence').mockResolvedValue(evidencePasses(VERSION));
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('check 18 DOCUMENT_OPENING_DECIDED — built at step 33 (plan :255; A6 :1535)', () => {
  it('FAILS a head whose #doc_ mention has no opening decided, naming the mention — and publication is refused on it', async () => {
    await seedCitingDocument();
    const evaluation = await evaluatePublication(VERSION.id, PASSING);
    const check = row18(rowsOf(evaluation));
    expect([check.kind, check.verdict]).toEqual(['hard', 'FAIL']);
    expect(check.failures).toEqual([expect.objectContaining({ name: COMMITMENT, opening: null })]);
    expect(publishabilityOf(evaluation).failed).toContain('DOCUMENT_OPENING_DECIDED');
  });

  it('a head citing NO document reports row 18 EXAMINED_NONE with zero examined, and reads no opening at all', async () => {
    await seedPublishable();
    db.documentOpeningDecision.findMany.mockClear();
    const check = row18(await rows());
    expect([check.verdict, check.examined, check.failures]).toEqual(['EXAMINED_NONE', [], []]);
    expect(db.documentOpeningDecision.findMany).not.toHaveBeenCalled();
  });

  it('it is appended AFTER A6’s first seventeen — the thesis gate’s rows keep their order and count', async () => {
    await seedPublishable();
    const all = await rows();
    expect([all.length, all.at(-1)?.id]).toEqual([18, 'DOCUMENT_OPENING_DECIDED']);
  });

  it('PASSES when the opening in force is decided — the highest sequence of the append-only log', async () => {
    await seedCitingDocument();
    store.documentOpeningDecisions = [opening(1, 'BYTES'), opening(2, 'CONTENT')];
    const check = row18(await rows());
    expect([check.verdict, check.examined]).toEqual(['PASS', [{ name: COMMITMENT, opening: 'CONTENT' }]]);
  });

  it('FAILS BYTES on a SEALED document — the platform holds no bytes of it (A6 :1535; §7 :803–:804)', async () => {
    await seedCitingDocument(true);
    store.documentOpeningDecisions = [opening(1, 'BYTES')];
    const check = row18(await rows());
    expect(check.verdict).toBe('FAIL');
    expect(check.failures).toEqual([expect.objectContaining({ name: COMMITMENT, opening: 'BYTES' })]);
  });

  it('BYTES on a HELD document passes — only the sealed arm is refused', async () => {
    await seedCitingDocument();
    store.documentOpeningDecisions = [opening(1, 'BYTES')];
    expect(row18(await rows()).verdict).toBe('PASS');
  });
});
