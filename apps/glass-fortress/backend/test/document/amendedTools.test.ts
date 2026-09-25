jest.mock('../../src/lib/prisma', () => ({
  prisma: (require('../helpers/evidenceDouble') as typeof import('../helpers/evidenceDouble')).db,
}));
jest.mock('../../src/context/researcherContext', () => (require('../thesis/tools') as typeof import('../thesis/tools')).researcherContextDouble);
jest.mock('../../src/factories/LLMFactory', () => (require('../thesis/tools') as typeof import('../thesis/tools')).llmFactoryTripwire);
// THE DEBATE'S ASSESSOR, MOCKED AT ITS BOUNDARY (document step 33 chunk 4, declared): the debate's cases below call
// `open_debate` itself, and the factory above is a tripwire — so the class answers, and the model id the writer records
// is a double's. No case spends a model call.
const mockAssess = jest.fn();
jest.mock('../../src/services/promotionAssessor', () => ({
  ...jest.requireActual<object>('../../src/services/promotionAssessor'),
  PromotionAssessor: class {
    assess = mockAssess;
  },
  PROMOTION_ASSESSOR_MODEL: () => 'double:FORENSIC_PROMOTION',
}));
// THE CHAIN, DOUBLED AND COUNTING (document step 33 chunk 5, declared): both modules that reach the registry are jest's
// automock, every export a recording double, so the promotion case below observes ZERO calls rather than reading a file.
jest.mock('../../src/services/Web3Service');
jest.mock('../../src/services/anchorSnapshots');

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SRC } from '../walk/scan';
import { built } from './built';
import { NEVER_RAISED_FOR_A_DOCUMENT } from './contract';
import { modelBody, schemaText } from './schema';
import { resetDouble, store } from '../helpers/evidenceDouble';
import { AUTHOR } from '../thesis/fixtures';
import { ON_THE_FIXTURE, call, resetTools, seedThesis, textCiting } from '../thesis/tools';
import { COMMITMENT, HELD_BEFORE, HELD_NOW, OTHER_COMMITMENT, RECEIPT, SEALED, documentRow, seedHeld, seedPromoted, versionRow } from './citationWorld';
import { AUTHOR as DEBATE_AUTHOR, THESIS as DEBATE_THESIS, seedDocumentDebate } from './debateWorld';
import { written } from '../helpers/evidenceDouble';
import { openDebateHandler } from '../../src/mcp/tools/openDebate';
import { actAs } from '../thesis/tools';
import { documentSession, SESSION, VERSION as DEBATE_VERSION } from './debateWorld';
import { promoteFromDebateHandler } from '../../src/mcp/tools/promoteFromDebate';
import { decideGapHandler } from '../../src/mcp/tools/decideGap';
import * as anchorSnapshots from '../../src/services/anchorSnapshots';
import { Web3Service } from '../../src/services/Web3Service';
import { answered } from '../../src/services/documentPredicates';
import { flaggedFor } from '../../src/services/evidencePredicates';

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
  // BEHAVIOURAL SINCE DOCUMENT STEP 33 CHUNK 4 (R81 Entry 15; the sketch's (e), declared): `open_debate` is CALLED over
  // the evidence double's document world (`debateWorld.ts`), where these three cases once read `services/openDebate.ts`
  // for a word. Titles kept.
  const SENTINEL = 'OPINION-SENTINEL';
  const openOn = async (): Promise<{ code?: string }> => {
    actAs(DEBATE_AUTHOR);
    return JSON.parse(
      await openDebateHandler({ thesisId: DEBATE_THESIS, record: { document: COMMITMENT }, rationale: 'החוזר מורה על כך במפורש.' }),
    ) as { code?: string };
  };

  beforeEach(() => {
    resetDouble();
    resetTools();
    mockAssess.mockReset();
    mockAssess.mockResolvedValue({ hasSubstance: true, substanceGaps: [], verdict: 'SUPPORTS', objection: '', assessment: 'א', assertions: [] });
    seedDocumentDebate();
  });

  it('NOTHING_TO_PROMOTE when CURRENT(d).text is null on a SEALED document (§6 :702-:703)', async () => {
    store.documents = [documentRow(SEALED)];
    store.documentContentVersions = [versionRow(RECEIPT, { derivedFrom: 'AT_RECEIPT', derivedUnder: ['v0'], text: null })];
    expect((await openOn()).code).toBe('NOTHING_TO_PROMOTE');
    expect(mockAssess).not.toHaveBeenCalled();
  });

  it('the assessor is handed the rationale, the passage and CURRENT(d)’s text or bytes — NEVER THE OPINION (§6 :705-:708)', async () => {
    // A model's description of a letterhead is not material for judging whether the
    // researcher's claims about the CONTENT can be checked.
    store.documentContentVersions = store.documentContentVersions.map((v) => ({ ...v, opinions: [{ body: { summary: SENTINEL } }] }));
    await openOn();
    const handed = JSON.stringify(mockAssess.mock.calls.at(0)?.at(0));
    expect(handed).toContain('החוזר מורה על כך במפורש.');
    expect(handed).toContain(`#doc_${COMMITMENT}`);
    expect(handed).not.toContain(SENTINEL);
  });

  it('THE THREE ARE NEVER RAISED FOR A DOCUMENT — asserted, never assumed', async () => {
    // THE FLOOR: the list is three, so an empty list cannot pass this vacuously.
    expect(NEVER_RAISED_FOR_A_DOCUMENT).toHaveLength(3);
    const worlds: (() => void)[] = [
      () => undefined,
      () => { store.documents = [documentRow({ mimeType: 'audio/mpeg' })]; store.documentContentVersions = [versionRow(HELD_NOW, { text: null })]; },
      () => { store.documents = [documentRow(SEALED)]; store.documentContentVersions = [versionRow(RECEIPT, { derivedFrom: 'AT_RECEIPT', derivedUnder: ['v0'], text: null })]; },
      () => { store.documentContentVersions = [versionRow(HELD_BEFORE, { derivedUnder: ['v0'] })]; },
    ];
    for (const arrange of worlds) {
      resetDouble();
      seedDocumentDebate();
      arrange();
      const { code } = await openOn();
      expect(NEVER_RAISED_FOR_A_DOCUMENT as readonly (string | undefined)[]).not.toContain(code);
    }
  });
});

describe('A2 :1339-:1341 — DebateSession gains recordCommitment, and the key MATCHES THE KIND', () => {
  // THE DIRECT PARALLEL of Evidence_one_record_key's three arms, which `standing.test.ts`
  // carries as RECOMPUTABLE(e)'s third arm. The debate's record key has the same shape and
  // the same invariant, and it was missing from this suite — REVIEW's finding, R74 chunk 2.
  //
  // THE TWO SCHEMA CASES ARE KEPT (the sketch's (e), declared): the CHECK that holds "exactly one" lives in the
  // migration, which a behavioural case cannot see — so each gains a BEHAVIOURAL TWIN, the writer observed.

  const created = async (): Promise<Record<string, unknown> | undefined> => {
    resetDouble();
    resetTools();
    mockAssess.mockReset();
    mockAssess.mockResolvedValue({ hasSubstance: true, substanceGaps: [], verdict: 'SUPPORTS', objection: '', assessment: 'א', assertions: [] });
    seedDocumentDebate();
    actAs(DEBATE_AUTHOR);
    await openDebateHandler({ thesisId: DEBATE_THESIS, record: { document: COMMITMENT }, rationale: 'r' });
    return written.find((w) => w.model === 'debateSession' && w.op === 'create')?.data;
  };

  it('the column exists on DebateSession — step 28’s schema (plan :138-:139)', async () => {
    await gate();
    const model = modelBody(schemaText(), 'DebateSession');
    // THE FLOOR: the model was found at all, so a renamed model cannot pass this vacuously.
    expect(model).toContain('recordFileHash');
    expect(model).toContain('recordCommitment');
  });

  it('the column is WRITTEN — open_debate over a document sets recordCommitment (its behavioural twin, plan :247)', async () => {
    expect((await created())?.['recordCommitment']).toBe(COMMITMENT);
  });

  it('EXACTLY ONE of recordSnapshotId · recordDiffId · recordCommitment is set, matching the record’s kind', async () => {
    await gate();
    const model = modelBody(schemaText(), 'DebateSession');
    const arms = ['recordSnapshotId', 'recordDiffId', 'recordCommitment'].filter((arm) => model.includes(arm));
    // Three arms, as Evidence's three are — and the CHECK that holds "exactly one" lives in
    // the migration, per evidence A2 :1935-:1936's precedent for Evidence_one_record_key.
    expect(arms).toHaveLength(3);
  });

  it('EXACTLY ONE is WRITTEN for a document — recordCommitment, and the other two null (its behavioural twin)', async () => {
    const row = await created();
    expect([row?.['recordSnapshotId'], row?.['recordDiffId'], row?.['recordCommitment']]).toEqual([null, null, COMMITMENT]);
  });

  it('recordFileHash IS THE COMMITMENT for a document debate (A2 :1341)', async () => {
    // The debate computes its record's name at open, before any Evidence row exists
    // (evidence A2 :960). For a document that name is the COMMITMENT, never the DOC_ID.
    const row = await created();
    expect(row?.['recordFileHash']).toBe(COMMITMENT);
    expect(row?.['recordFileHash']).not.toBe(documentRow()['docId']);
  });
});

describe('A4 :1452-:1461 — promotion writes the FIRST Evidence row of kind DOCUMENT, and NO CHAIN WRITE', () => {
  // BEHAVIOURAL SINCE DOCUMENT STEP 33 CHUNK 5 (declared): these read `services/promoteFromDebate.ts` for a word, and
  // the first passed on an interim guard's word `DOCUMENT` — a FALSE GREEN (R82 Entry 3). `promote_from_debate` is now
  // CALLED over `debateWorld.ts`'s cleared debate. Titles kept.
  const promoteCleared = async (): Promise<Record<string, unknown>> => {
    resetDouble();
    resetTools();
    seedDocumentDebate();
    store.session = documentSession({ hasSubstance: true, verdict: 'SUPPORTS', events: [{ id: 'e1', type: 'RATIONALE_SUBMITTED', content: 'r', createdAt: new Date() }] });
    actAs(DEBATE_AUTHOR);
    return JSON.parse(await promoteFromDebateHandler({ sessionId: SESSION })) as Record<string, unknown>;
  };

  it('promote_from_debate creates it with fileHash = commitment and affirmed = CURRENT(d) (§6 :712-:716)', async () => {
    const out = await promoteCleared();
    expect([out['fileHash'], out['affirmedContentVersionHash'], out['created']]).toEqual([COMMITMENT, HELD_NOW, true]);
    const row = written.find((w) => w.model === 'evidence' && w.op === 'create')?.data;
    expect(row).toMatchObject({ kind: 'DOCUMENT', documentCommitment: COMMITMENT, fileHash: COMMITMENT, snapshotId: null, urlVersionDiffId: null, affirmedContentVersionHash: HELD_NOW });
  });

  it('NO CHAIN WRITE AT PROMOTION — the document was committed at RECEIPT (§6 :715-:716)', async () => {
    jest.clearAllMocks();
    await promoteCleared();
    const methods = Object.getOwnPropertyNames(Web3Service.prototype)
      .filter((name) => name !== 'constructor')
      .map((name) => (Web3Service.prototype as unknown as Record<string, jest.Mock>)[name]);
    const snapshots = Object.values(anchorSnapshots).filter((value): value is jest.Mock => jest.isMockFunction(value));
    // THE FLOOR: the doubles exist; and they COUNT — the control below is seen.
    expect([methods.length > 0, snapshots.length > 0]).toEqual([true, true]);
    const calls = (): number =>
      (Web3Service as unknown as jest.Mock).mock.calls.length + [...methods, ...snapshots].reduce((sum, fn) => sum + fn.mock.calls.length, 0);
    expect(calls()).toBe(0);
    await anchorSnapshots.countUnanchoredSnapshots();
    expect(calls()).toBe(1);
  });
});

describe('A4 :1458 — decide_gap: `citedName` MAY BE A COMMITMENT THE HEAD MENTIONS', () => {
  // The fourteenth amended arm, and the one this suite had missed — REVIEW's finding,
  // R74 chunk 2. Thesis A4 :1492 already refuses NOT_CITED when CITED names a record the
  // head does not mention; what the document design adds is that the NAME may be a
  // COMMITMENT (plan :252-:253), which is how an arrival closes: `decide_gap CITED`, then
  // ANSWERED derived (§6 :717-:719).
  //
  // BEHAVIOURAL SINCE DOCUMENT STEP 33 CHUNK 5 (R81 Entry 15, declared): these read `services/decideGap.ts`, which does
  // not exist (the tool is `mcp/tools/decideGap.ts`). `decide_gap` is now CALLED. Titles kept.
  const GAP_ID = '0xgap-doc';
  const decide = async (citedName: string): Promise<Record<string, unknown>> => {
    resetDouble();
    resetTools();
    seedDocumentDebate();
    store.theses = [{ id: DEBATE_THESIS, createdById: DEBATE_AUTHOR, headVersionId: DEBATE_VERSION, publishedVersionId: null }];
    store.gapDecisions = [
      { id: 'gap-1', gapId: GAP_ID, thesisId: DEBATE_THESIS, sequence: 1, decision: 'OPEN', description: 'd', citedName: null, reason: null, request: null, callItem: null, researcherId: DEBATE_AUTHOR, createdAt: new Date() },
    ];
    actAs(DEBATE_AUTHOR);
    return JSON.parse(
      await decideGapHandler({ thesisId: DEBATE_THESIS, gapId: GAP_ID, expectedSequence: 1, decision: 'CITED', citedName }),
    ) as Record<string, unknown>;
  };

  it('a commitment is accepted as `citedName` when the head mentions it', async () => {
    expect((await decide(COMMITMENT))['code']).toBeUndefined();
    expect(written.find((w) => w.model === 'thesisGapDecision' && w.op === 'create')?.data).toMatchObject({ decision: 'CITED', citedName: COMMITMENT });
  });

  it('NOT_CITED still refuses a commitment the head does NOT mention — thesis A4’s refusal, one spelling', async () => {
    const out = await decide(OTHER_COMMITMENT);
    expect(out['code']).toBe('NOT_CITED');
    expect(String(out['error'])).toContain('#doc_');
  });

  it('the gap moves to CITED and the arrival is ANSWERED BY DERIVATION, never by a stored flag (§5 :606-:607)', async () => {
    await decide(COMMITMENT);
    // ANSWERED is derived from the mentions (A3 :1375), so nothing here writes it.
    expect(written.map((w) => w.model).filter((model) => /arrival/i.test(model))).toEqual([]);
    const headCites = store.mentions.filter((m) => m['kind'] === 'DOCUMENT').map((m) => String(m['name']));
    expect(answered({ thesisId: DEBATE_THESIS }, headCites, [COMMITMENT])).toBe(true);
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

  // BEHAVIOURAL SINCE DOCUMENT STEP 33 (declared; the graded sketch's (e) :259, R82 Entry 6): this read
  // `services/thesisReviews.ts` for the word SHED — a GREEN source scan of a module that has no SHED arm. FLAGGED(m) is
  // now ASKED over the world §8 :934–:937 names: a PUBLISHED version citing a promoted document its sender took back.
  // RED until step 35 builds the arm — and the world is reachable only then, since nothing writes a Shed row before it.
  it('FLAGGED gains the SHED arm’s text, BY CAUSE (§8 :936-:937)', async () => {
    resetDouble();
    store.mentions = [{ id: 'mention-doc', name: COMMITMENT, contentVersionHash: HELD_NOW, thesisVersion: { isPublished: { id: 'pub' } } }];
    store.evidenceRows = [
      { fileHash: COMMITMENT, kind: 'DOCUMENT', documentCommitment: COMMITMENT, status: 'PROMOTED', affirmedContentVersionHash: HELD_NOW, snapshot: null, urlVersionDiff: null },
    ];
    store.documents = [documentRow({ bytes: null })];
    store.sheds = [{ commitment: COMMITMENT, cause: 'SENDER', researcherId: null, reason: null, at: new Date(Date.UTC(2026, 8, 21)) }];
    const report = (await flaggedFor(['mention-doc'])).get('mention-doc');
    expect(report?.flagged).toBe(true);
    expect((report?.reasons ?? []).map(String)).toContain('SHED');
  });
});
