jest.mock('../../src/lib/prisma', () => ({
  prisma: (require('../helpers/evidenceDouble') as typeof import('../helpers/evidenceDouble')).db,
}));
jest.mock('../../src/context/researcherContext', () => (require('../thesis/tools') as typeof import('../thesis/tools')).researcherContextDouble);
jest.mock('../../src/factories/LLMFactory', () => (require('../thesis/tools') as typeof import('../thesis/tools')).llmFactoryTripwire);

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SRC } from '../walk/scan';
import { built } from './built';
import { NEVER_RAISED_FOR_A_DOCUMENT } from './contract';
import { modelBody, schemaText } from './schema';
import { resetDouble, store } from '../helpers/evidenceDouble';
import { AUTHOR } from '../thesis/fixtures';
import { ON_THE_FIXTURE, call, resetTools, seedThesis, textCiting } from '../thesis/tools';
import { COMMITMENT, HELD_BEFORE, HELD_NOW, OTHER_COMMITMENT, documentRow, seedHeld, seedPromoted, versionRow } from './citationWorld';

// ---------------------------------------------------------------------------
// A4 :1452-:1470 — THE AMENDED TOOLS, BY THEIR ADDED ARMS ONLY.
//
// Every tool here already exists and is a sibling layer's. This file asserts ONLY what the
// document design adds to each, because a case re-asserting a sibling's contract would be
// a second spelling of it — and the sibling suites stay GREEN AND UNEDITED (plan §1 :47-:49).
//
// THE THREE THAT ARE NEVER RAISED FOR A DOCUMENT are asserted, never assumed (plan :253-:254):
// NOT_ACQUIRED, CONTRADICTED and NARROWED are refusals about captures and pairs, and a
// document has none of those states (§6 :723-:725).
// ---------------------------------------------------------------------------

interface Refusal { error: string; code: string }
const isRefusal = (a: unknown): a is Refusal => typeof (a as Refusal)?.code === 'string';

interface Predicates { verdict: unknown }
/** Loaded so an unbuilt layer fails BY NAME rather than by a file read that says nothing. */
const gate = () => built<Predicates>('services/documentPredicates', ['verdict']);

async function sourceOf(path: string): Promise<string> {
  await gate();
  return readFileSync(join(SRC, path), 'utf8');
}

describe('A4 :1452-:1453 — add_thesis_version parses #doc_ into a kind DOCUMENT mention', () => {
  // BEHAVIOURAL SINCE DOCUMENT STEP 33 (R81, Entry 15): the tool is CALLED over the evidence double, where these two
  // cases once read a source file that does not exist (`services/addThesisVersion.ts`; the write is
  // `mcp/tools/addThesisVersion.ts` over `services/thesisVersionWrite.ts`). Titles kept; the refusal set is Q1's.
  const next = ON_THE_FIXTURE.add_thesis_version;
  const AFFIRMED = `0x${'e1'.repeat(32)}`;
  const write = async (token: string) =>
    JSON.parse(await call('add_thesis_version', { ...next, text: textCiting(token) }, AUTHOR)) as {
      code?: string;
      mentions?: { kind: string; name: string; pin: string | null }[];
    };

  beforeEach(() => {
    resetDouble();
    resetTools();
    seedThesis();
  });

  it('the pin is from `affirmed` where an Evidence row exists, else CURRENT(d) (§6 :695-:697)', async () => {
    seedHeld();
    const unpromoted = await write(`#doc_${COMMITMENT}`);
    seedThesis();
    seedPromoted(AFFIRMED);
    const promoted = await write(`#doc_${COMMITMENT}`);
    expect([unpromoted.mentions, promoted.mentions]).toEqual([
      [{ kind: 'DOCUMENT', name: COMMITMENT, pin: HELD_NOW, argued: false }],
      [{ kind: 'DOCUMENT', name: COMMITMENT, pin: AFFIRMED, argued: false }],
    ]);
  });

  // DECLARED (R81 Q1, Entry 3): the first code was NOT_A_DOCUMENT; a `#doc_` naming no document is NOT_A_RECORD, T2's
  // one word for a token naming nothing (document A4 :1453, plan :245, as conformed 2026-09-24). Title and list amended.
  it('refuses NOT_A_RECORD, AWAITING_DERIVATION and SHED — T2’s own refusals, ONE SPELLING EACH', async () => {
    seedHeld();
    const unknown = await write(`#doc_${OTHER_COMMITMENT}`);
    store.documentContentVersions = [versionRow(HELD_BEFORE, { derivedUnder: ['v0-an-older-extractor'] })];
    const awaiting = await write(`#doc_${COMMITMENT}`);
    store.documents = [documentRow({ bytes: null })];
    store.sheds = [{ commitment: COMMITMENT, cause: 'SENDER', researcherId: null, reason: null, at: new Date(Date.UTC(2026, 8, 21)) }];
    const shed = await write(`#doc_${COMMITMENT}`);
    expect([unknown.code, awaiting.code, shed.code]).toEqual(['NOT_A_RECORD', 'AWAITING_DERIVATION', 'SHED']);
  });
});

describe('A4 :1454-:1457 — the debate takes { document: commitment }', () => {
  it('NOTHING_TO_PROMOTE when CURRENT(d).text is null on a SEALED document (§6 :702-:703)', async () => {
    const source = await sourceOf('services/openDebate.ts');
    expect(source).toContain('NOTHING_TO_PROMOTE');
  });

  it('the assessor is handed the rationale, the passage and CURRENT(d)’s text or bytes — NEVER THE OPINION (§6 :705-:708)', async () => {
    const source = await sourceOf('services/openDebate.ts');
    // A model's description of a letterhead is not material for judging whether the
    // researcher's claims about the CONTENT can be checked.
    expect(source).not.toMatch(/assessor[\s\S]{0,400}\bopinion\b/);
  });

  it('THE THREE ARE NEVER RAISED FOR A DOCUMENT — asserted, never assumed', async () => {
    const source = await sourceOf('services/openDebate.ts');
    // THE FLOOR: the list is three, so an empty list cannot pass this vacuously.
    expect(NEVER_RAISED_FOR_A_DOCUMENT).toHaveLength(3);
    for (const code of NEVER_RAISED_FOR_A_DOCUMENT) {
      expect(source).not.toMatch(new RegExp(`document[\\s\\S]{0,200}${code}`));
    }
  });
});

describe('A2 :1339-:1341 — DebateSession gains recordCommitment, and the key MATCHES THE KIND', () => {
  // THE DIRECT PARALLEL of Evidence_one_record_key's three arms, which `standing.test.ts`
  // carries as RECOMPUTABLE(e)'s third arm. The debate's record key has the same shape and
  // the same invariant, and it was missing from this suite — REVIEW's finding, R74 chunk 2.
  //
  // RED UNTIL 28 ADDS THE COLUMN AND 33 WRITES IT: the schema half is step 28's (plan
  // :138-:139, "DebateSession.recordCommitment"), the writer is step 33's (plan :247).

  it('the column exists on DebateSession — step 28’s schema (plan :138-:139)', async () => {
    await gate();
    const model = modelBody(schemaText(), 'DebateSession');
    // THE FLOOR: the model was found at all, so a renamed model cannot pass this vacuously.
    expect(model).toContain('recordFileHash');
    expect(model).toContain('recordCommitment');
  });

  it('EXACTLY ONE of recordSnapshotId · recordDiffId · recordCommitment is set, matching the record’s kind', async () => {
    await gate();
    const model = modelBody(schemaText(), 'DebateSession');
    const arms = ['recordSnapshotId', 'recordDiffId', 'recordCommitment'].filter((arm) => model.includes(arm));
    // Three arms, as Evidence's three are — and the CHECK that holds "exactly one" lives in
    // the migration, per evidence A2 :1935-:1936's precedent for Evidence_one_record_key.
    expect(arms).toHaveLength(3);
  });

  it('recordFileHash IS THE COMMITMENT for a document debate (A2 :1341)', async () => {
    const source = await sourceOf('services/openDebate.ts');
    // The debate computes its record's name at open, before any Evidence row exists
    // (evidence A2 :960). For a document that name is the COMMITMENT, never the DOC_ID.
    expect(source).toMatch(/recordFileHash[\s\S]{0,300}commitment/);
  });
});

describe('A4 :1452-:1461 — promotion writes the FIRST Evidence row of kind DOCUMENT, and NO CHAIN WRITE', () => {
  it('promote_from_debate creates it with fileHash = commitment and affirmed = CURRENT(d) (§6 :712-:716)', async () => {
    const source = await sourceOf('services/promoteFromDebate.ts');
    expect(source).toMatch(/documentCommitment|DOCUMENT/);
  });

  it('NO CHAIN WRITE AT PROMOTION — the document was committed at RECEIPT (§6 :715-:716)', async () => {
    const source = await sourceOf('services/promoteFromDebate.ts');
    expect(source).not.toMatch(/registerEvidenceHash|submit\(/);
  });
});

describe('A4 :1458 — decide_gap: `citedName` MAY BE A COMMITMENT THE HEAD MENTIONS', () => {
  // The fourteenth amended arm, and the one this suite had missed — REVIEW's finding,
  // R74 chunk 2. Thesis A4 :1492 already refuses NOT_CITED when CITED names a record the
  // head does not mention; what the document design adds is that the NAME may be a
  // COMMITMENT (plan :252-:253), which is how an arrival closes: `decide_gap CITED`, then
  // ANSWERED derived (§6 :717-:719).

  it('a commitment is accepted as `citedName` when the head mentions it', async () => {
    const source = await sourceOf('services/decideGap.ts');
    expect(source).toMatch(/commitment|DOCUMENT/);
  });

  it('NOT_CITED still refuses a commitment the head does NOT mention — thesis A4’s refusal, one spelling', async () => {
    const source = await sourceOf('services/decideGap.ts');
    expect(source).toContain('NOT_CITED');
  });

  it('the gap moves to CITED and the arrival is ANSWERED BY DERIVATION, never by a stored flag (§5 :606-:607)', async () => {
    const source = await sourceOf('services/decideGap.ts');
    // ANSWERED is derived from the mentions (A3 :1375), so nothing here writes it.
    expect(source).not.toMatch(/answered\s*[:=]\s*true/i);
  });
});

describe('A4 :1459-:1470 — the reads and the gate the document layer amends', () => {
  it('publish_thesis writes a PassageVerdict per quoted span and `documentsOpened` (A4 :1459-:1461)', async () => {
    const source = await sourceOf('services/publishThesis.ts');
    expect(source).toMatch(/PassageVerdict|documentsOpened/);
  });

  it('list_findings gains the `documents` register, OPENED ONLY — nothing unopened, for anyone (§9 :1034)', async () => {
    const source = await sourceOf('services/listFindings.ts');
    expect(source).toMatch(/documents/);
  });

  it('resolve_record by commitment answers §7’s block, or NOT_PUBLIC (A4 :1466-:1467)', async () => {
    const source = await sourceOf('services/resolveRecord.ts');
    expect(source).toMatch(/NOT_PUBLIC/);
  });

  it('check_on_chain_status asked about a commitment answers about ITS ENTRY (A4 :1468-:1469)', async () => {
    const source = await sourceOf('services/checkOnChainStatus.ts');
    expect(source).toMatch(/commitment/i);
  });
});

describe('A4 :1462-:1464 — list_thesis_reviews: ARRIVED’s shape and FLAGGED’s SHED arm. STEP 32/35’S.', () => {
  it('ARRIVED carries { arrivalId, gapId | null, documents, receivedAt, commands }', async () => {
    const answer = await sourceOf('services/thesisReviews.ts');
    expect(answer).toMatch(/ARRIVED/);
  });

  it('FLAGGED gains the SHED arm’s text, BY CAUSE (§8 :936-:937)', async () => {
    const answer = await sourceOf('services/thesisReviews.ts');
    expect(answer).toMatch(/SHED/);
  });
});
