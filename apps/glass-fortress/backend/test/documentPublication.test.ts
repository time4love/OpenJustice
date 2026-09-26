jest.mock('../src/lib/prisma', () => ({
  prisma: (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).db,
}));
jest.mock('../src/context/researcherContext', () => (require('./thesis/tools') as typeof import('./thesis/tools')).researcherContextDouble);
jest.mock('../src/factories/LLMFactory', () => (require('./thesis/tools') as typeof import('./thesis/tools')).llmFactoryTripwire);

import { checkPublicationReadinessHandler } from '../src/mcp/tools/checkPublicationReadiness';
import { publishThesisHandler } from '../src/mcp/tools/publishThesis';
import * as anchorDocuments from '../src/services/anchorDocuments';
import * as documentStanding from '../src/services/documentStanding';
import * as evidencePredicates from '../src/services/evidencePredicates';
import * as publicationAssessor from '../src/services/publicationAssessor';
import * as publicationEvaluation from '../src/services/publicationEvaluation';
import { evaluatePublication, publishabilityOf, rowsOf, type PublicationEvaluation, type ThesisCheck } from '../src/services/publicationEvaluation';
import type { RegistryWindow } from '../src/services/anchorSnapshots';
import { resetDouble, store, written, writtenViaTx } from './helpers/evidenceDouble';
import { AUTHOR, THESIS, VERSION } from './thesis/fixtures';
import { PASSING, seedPublishable } from './thesis/gateWorld';
import { commitment as commitmentOf } from '../src/lib/documentIdentity';
import { HELD_BEFORE, HELD_NOW } from './document/citationWorld';
import { mentionRow } from './thesis/rows';
import { ASSESSED, asked, COMMITMENT, DOC_MENTION, QUOTE, seedCitingDocument } from './document/publicationWorld';
import { actAs, answerOf, call, resetTools } from './thesis/tools';

// ---------------------------------------------------------------------------
// DOCUMENT STEP 34, CHUNK 1 — Q1 AND THE FALLEN ARM. docs/gf-document-flows.md A6 :1529–:1534; plan :272–:274; the
// researcher's Q1 (`R84-review-state.md` Entry 3): "publish_thesis and check_publication_readiness ask VERIFIED(d) through
// documentStanding.verifiedOf and hand it to evaluatePublication; a caller that does not ask gets evaluable: false, never
// verified: false."
//
// THE WORLD IS THE THESIS GATE'S (`test/thesis/gateWorld.ts`, read, never edited) with its head citing ONE document and
// nothing else: HELD, promoted and affirmed at CURRENT(d), argued on this thesis. Nothing here stubs the evidence half —
// rows 5–10 are the REAL `publishableEvidence` over the double, which is the point: the DOCUMENT arm is what is under
// test. The gate world's diff citation is dropped because its record is modelled for the gate's STUBBED evidence half
// (`test/thesis/gate.test.ts` :107) and not for VERIFIED's read of its captures.
// ---------------------------------------------------------------------------

const rowOf = (rows: readonly ThesisCheck[], id: string): ThesisCheck => {
  // Compared as a STRING: a gate with no such row fails THIS case by name, never the file at compile time.
  const found = rows.find((r) => String(r.id) === id);
  if (found === undefined) throw new Error(`the gate rendered no ${id} row`);
  return found;
};

/** The DOCUMENT mention's conjunct `id`, read off the one evaluation's evidence half. */
function conjunctOf(e: PublicationEvaluation, id: string): { verdict: string; reason: string | null; detail: string | null } {
  const report = e.report.mentions.find((m) => m.examined.mentionId === DOC_MENTION);
  const conjunct = report?.conjuncts.find((c) => c.id === id);
  if (conjunct === undefined) throw new Error(`no ${id} conjunct for the document mention`);
  return conjunct;
}

const failedOn = (row: ThesisCheck): unknown[] => row.failures.filter((f) => (f as { mentionId?: string }).mentionId === DOC_MENTION);

beforeEach(() => {
  resetDouble();
  resetTools();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('N5 — Q1: a caller that does NOT ask is NOT EVALUABLE, never `verified: false` (evidencePredicates :552–:563, one level up)', () => {
  it('the version is not evaluable, reason CHAIN_NOT_ASKED, naming the document mention — and the fold refuses it (fails CLOSED)', async () => {
    await seedCitingDocument();
    const e = await evaluatePublication(VERSION.id, PASSING);

    expect(e.report.evaluable).toBe(false);
    expect(!e.report.evaluable && e.report.reason).toBe('CHAIN_NOT_ASKED');
    expect(!e.report.evaluable && e.report.notEvaluable.map((m) => m.mentionId)).toEqual([DOC_MENTION]);
    // NEVER a verified FAIL: row 5 names no failure on the document — it says it did not ask.
    expect(conjunctOf(e, 'VERIFIED')).toMatchObject({ verdict: 'EXAMINED_NONE', reason: 'CHAIN_NOT_ASKED' });
    expect(failedOn(rowOf(rowsOf(e), 'EVIDENCE_VERIFIED'))).toEqual([]);
    // LOW-b: the default FAILS CLOSED at the fold — not publishable, and no evidence row is the reason why.
    expect(publishabilityOf(e).publishable).toBe(false);
  });

  it('THE FLIP — the same world ASKED and verified is evaluable, and row 5 PASSES the document: not-asking alone decides it', async () => {
    await seedCitingDocument();
    const e = await evaluatePublication(VERSION.id, PASSING, asked({ verified: true }));

    expect(e.report.evaluable).toBe(true);
    expect(conjunctOf(e, 'VERIFIED')).toMatchObject({ verdict: 'PASS', reason: null });
    expect(e.report.mentions.map((m) => m.examined.mentionId)).toContain(DOC_MENTION);
  });
});

describe('N6 — Q1: ASKED and not verified FAILS row 5 and refuses — the arm that used to pass non-binding (plan :274)', () => {
  it('EVIDENCE_VERIFIED FAILS naming the document mention, NOT_VERIFIED, and the fold lists the row', async () => {
    await seedCitingDocument();
    const e = await evaluatePublication(VERSION.id, PASSING, asked({ verified: false }));

    expect(conjunctOf(e, 'VERIFIED')).toMatchObject({ verdict: 'FAIL', reason: 'NOT_VERIFIED' });
    expect(failedOn(rowOf(rowsOf(e), 'EVIDENCE_VERIFIED'))).toEqual([expect.objectContaining({ fileHash: COMMITMENT })]);
    expect(publishabilityOf(e).failed).toContain('EVIDENCE_VERIFIED');
  });
});

describe('N7 — Q1 (ii): an UNREADABLE chain is a FAIL that NAMES THE OUTAGE, never "not verified"', () => {
  it('row 5 FAILS with CHAIN_UNREADABLE and the outage in its detail', async () => {
    await seedCitingDocument();
    const e = await evaluatePublication(VERSION.id, PASSING, asked({ unread: 'the RPC timed out after 10s' }));

    const verified = conjunctOf(e, 'VERIFIED');
    expect([verified.verdict, verified.reason]).toEqual(['FAIL', 'CHAIN_UNREADABLE']);
    expect(verified.detail).toContain('the RPC timed out after 10s');
    expect(verified.detail).not.toMatch(/not verified/i);
  });

  it('publish_thesis REFUSES naming the outage — the researcher reads why, and nothing is published', async () => {
    await seedCitingDocument();
    jest.spyOn(documentStanding, 'documentVerificationOf').mockResolvedValue(asked({ unread: 'the RPC timed out after 10s' }));
    jest.spyOn(publicationAssessor, 'assess').mockResolvedValue(ASSESSED);
    actAs(AUTHOR);
    const out = JSON.parse(await publishThesisHandler({ thesisId: THESIS.id, rationale: 'הטיעון' })) as { code?: string; error?: string };

    expect(out.code).toBe('NOT_PUBLISHABLE');
    expect(out.error).toContain('EVIDENCE_VERIFIED');
    expect(out.error).toContain('the RPC timed out after 10s');
    expect(out.error).toContain('This is an outage, not a verdict');
    expect(out.error).not.toMatch(/not verified|VERIFIED\(d\) is false/i);
  });
});

describe('the DOCUMENT arm of rows 3, 6, 9 and 10 (A6 :1530–:1534)', () => {
  it('row 6 FAILS a stale pin naming both hashes; a SEALED pin at its AT_RECEIPT version is always current (A6 :1530)', async () => {
    await seedCitingDocument({ pin: HELD_BEFORE });
    const stale = await evaluatePublication(VERSION.id, PASSING, asked({ verified: true }));
    expect(conjunctOf(stale, 'CITATION_CURRENT')).toMatchObject({ verdict: 'FAIL', reason: 'NOT_CITATION_CURRENT' });
    expect(conjunctOf(stale, 'CITATION_CURRENT').detail).toContain(HELD_BEFORE);
    expect(conjunctOf(stale, 'CITATION_CURRENT').detail).toContain(HELD_NOW);

    resetDouble();
    await seedCitingDocument({ sealed: true });
    const sealed = await evaluatePublication(VERSION.id, PASSING, asked({ verified: true }));
    expect(conjunctOf(sealed, 'CITATION_CURRENT').verdict).toBe('PASS');
  });

  it('row 9 PASSES a derived document, and row 10 (check 17) EXAMINED NONE — NOT_DIFF_DERIVED, never a pass (A6 :1533)', async () => {
    await seedCitingDocument();
    const e = await evaluatePublication(VERSION.id, PASSING, asked({ verified: true }));
    expect(conjunctOf(e, 'DERIVED').verdict).toBe('PASS');
    expect(conjunctOf(e, 'INPUT_SOUND')).toMatchObject({ verdict: 'EXAMINED_NONE', reason: 'NOT_DIFF_DERIVED' });
  });

  it('row 3 CITES_EVIDENCE is satisfied by a DOCUMENT mention ALONE, and names it (A6 :1534)', async () => {
    await seedCitingDocument();
    const row = rowOf(rowsOf(await evaluatePublication(VERSION.id, PASSING, asked({ verified: true }))), 'CITES_EVIDENCE');
    expect([row.verdict, row.examined]).toEqual(['PASS', [{ name: COMMITMENT }]]);
  });
});

describe('N8 — Q1: the two tools ASK, with exactly the head’s cited documents', () => {
  it('check_publication_readiness (no rationale — no paid call) asks for the HEAD and hands the answer in', async () => {
    await seedCitingDocument();
    const answer = asked({ verified: true });
    const ask = jest.spyOn(documentStanding, 'documentVerificationOf').mockResolvedValue(answer);
    const evaluate = jest.spyOn(publicationEvaluation, 'evaluatePublication');
    await checkPublicationReadinessHandler({ thesisId: THESIS.id });

    expect(ask.mock.calls).toEqual([[VERSION.id]]);
    expect(evaluate.mock.calls.at(0)?.[2]).toBe(answer);
  });

  it('publish_thesis asks too — for the same head, BEFORE the paid draw and outside any transaction (M3)', async () => {
    await seedCitingDocument();
    const answer = asked({ verified: true });
    const ask = jest.spyOn(documentStanding, 'documentVerificationOf').mockResolvedValue(answer);
    const evaluate = jest.spyOn(publicationEvaluation, 'evaluatePublication');
    const draw = jest.spyOn(publicationAssessor, 'assess').mockResolvedValue(ASSESSED);
    actAs(AUTHOR);
    await publishThesisHandler({ thesisId: THESIS.id, rationale: 'הטיעון' });

    expect(ask.mock.calls).toEqual([[VERSION.id]]);
    expect(evaluate.mock.calls.at(0)?.[2]).toBe(answer);
    // THE ORDER: the free read before the paid one — a chain or bucket that throws must never cost a draw.
    const [asking, drawing] = [ask.mock.invocationCallOrder.at(0), draw.mock.invocationCallOrder.at(0)];
    expect(asking !== undefined && drawing !== undefined && asking < drawing).toBe(true);
  });

  it('M3 — the ask THROWS (a bucket or chain failure): the draw is never made and NOTHING is written (thesis A2 :1141)', async () => {
    await seedCitingDocument();
    jest.spyOn(documentStanding, 'documentVerificationOf').mockRejectedValue(new Error('the bucket could not be read'));
    const draw = jest.spyOn(publicationAssessor, 'assess').mockResolvedValue(ASSESSED);
    actAs(AUTHOR);
    await expect(publishThesisHandler({ thesisId: THESIS.id, rationale: 'הטיעון', publicInterestStatement: 'עניין ציבורי חדש' })).rejects.toThrow(
      'the bucket could not be read',
    );

    expect(draw).not.toHaveBeenCalled();
    expect(written).toEqual([]);
  });

  it('the one ask reads the chain for EXACTLY the version’s cited documents, and answers per commitment', async () => {
    await seedCitingDocument();
    // A SECOND VERSION citing ANOTHER document — held, so a read of "every version's documents" would ask for it too (M6).
    const other = commitmentOf(`0x${'d2'.repeat(32)}`, Buffer.alloc(32));
    store.documents = [...store.documents, { ...store.documents.at(0), docId: `0x${'d2'.repeat(32)}`, bytes: `0x${'d2'.repeat(32)}`, commitment: other }];
    store.mentions = [
      ...store.mentions,
      mentionRow({ id: 'mention-other', versionId: 'version-2', kind: 'DOCUMENT', name: other, contentVersionHash: HELD_NOW, debateSessionId: null }, false),
    ];
    const read = jest.spyOn(anchorDocuments, 'standingsOf').mockResolvedValue(new Map([[COMMITMENT, { unread: 'the RPC timed out' }]]));
    const answer = await documentStanding.documentVerificationOf(VERSION.id);

    expect(read.mock.calls.at(0)?.[1].map((d) => d.commitment)).toEqual([COMMITMENT]);
    expect(answer.asked && [...answer.byCommitment]).toEqual([[COMMITMENT, { unread: 'the RPC timed out' }]]);
  });

  it('a version citing NO document never reaches the chain — ASKED and empty, nothing to ask', async () => {
    await seedPublishable();
    const read = jest.spyOn(anchorDocuments, 'standingsOf');
    const answer = await documentStanding.documentVerificationOf(VERSION.id);

    expect(read).not.toHaveBeenCalled();
    expect(answer.asked && answer.byCommitment.size).toBe(0);
  });
});

describe('M4 — RECOMPUTABLE(e)’s third arm: a DOCUMENT row whose name is not commitment(docId, salt) FAILS VERIFIED (document A3 :1364–:1365)', () => {
  /** The same world, the Document's salt changed: its row still says COMMITMENT, and the bytes-and-salt no longer reproduce it. */
  async function seedMisnamed(): Promise<void> {
    await seedCitingDocument();
    store.documents = store.documents.map((d) => ({ ...d, salt: Buffer.alloc(32, 7) }));
  }

  it('ASKED and verified: VERIFIED still FAILS, NOT_VERIFIED, naming the commitment — the chain cannot vouch for a misnamed row', async () => {
    await seedMisnamed();
    const verified = conjunctOf(await evaluatePublication(VERSION.id, PASSING, asked({ verified: true })), 'VERIFIED');
    expect([verified.verdict, verified.reason]).toEqual(['FAIL', 'NOT_VERIFIED']);
    expect(verified.detail).toContain(COMMITMENT);
  });

  it('NOT ASKED: the same FAIL — a malformed row is refused whether or not the chain was read', async () => {
    await seedMisnamed();
    const e = await evaluatePublication(VERSION.id, PASSING);
    expect(conjunctOf(e, 'VERIFIED')).toMatchObject({ verdict: 'FAIL', reason: 'NOT_VERIFIED' });
    expect(e.report.evaluable).toBe(true);
  });
});

describe('M5 — a registry that cannot be reached: standingsOf NAMES the outage; anchoredOf reads it as owed (§4 :447)', () => {
  const DOWN = { registrar: () => Promise.reject(new Error('the RPC refused the connection')) } as unknown as RegistryWindow;
  const DOCUMENTS = [
    { commitment: COMMITMENT, docId: `0x${'d1'.repeat(32)}`, held: true },
    { commitment: HELD_BEFORE, docId: `0x${'d2'.repeat(32)}`, held: true },
  ];

  it('every document asked is { unread } carrying the message — never anchored: false', async () => {
    const answers = await anchorDocuments.standingsOf(DOWN, DOCUMENTS);
    expect([...answers.keys()]).toEqual([COMMITMENT, HELD_BEFORE]);
    for (const answer of answers.values()) {
      expect('unread' in answer && answer.unread).toContain('the RPC refused the connection');
    }
  });

  it('anchoredOf over the same window answers OWED for each — the every-other-read view (§4 :447)', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const answers = await anchorDocuments.anchoredOf(DOWN, DOCUMENTS);
    expect([...answers]).toEqual([
      [COMMITMENT, { anchored: false, by: null }],
      [HELD_BEFORE, { anchored: false, by: null }],
    ]);
  });
});

describe('LOW-d — the working view shows an UNREAD chain as verified: false (§4 :447), never a refusal of the read', () => {
  it('get_thesis_context answers the cited document verified: false when the chain could not be read', async () => {
    await seedCitingDocument();
    // The working view names its author by handle (A4 :1476), so the author's row is seeded — the gate world has none.
    store.researchers = [{ id: AUTHOR, handle: 'חוקר_א' }];
    jest.spyOn(documentStanding, 'verifiedOf').mockResolvedValue(new Map([[COMMITMENT, { unread: 'the RPC timed out' }]]));
    const answer = answerOf(await call('get_thesis_context', { thesisId: THESIS.id }, AUTHOR)) as {
      head: { mentions: { kind: string; name: string; verified?: boolean }[] };
    };
    const document = answer.head.mentions.find((m) => m.kind === 'DOCUMENT');
    expect(document).toMatchObject({ name: COMMITMENT, verified: false });
  });
});

describe('Q12 — verified()’s DOCUMENT arm is a LOUD GUARD: no reader reaches it, and none is answered a word for it', () => {
  it('verified() over a DOCUMENT row THROWS, naming why it is unreachable — never evaluable: false with a reason', async () => {
    await seedCitingDocument();
    await expect(evidencePredicates.verified(COMMITMENT)).rejects.toThrow(/DOCUMENT row[\s\S]*resolveRecord[\s\S]*verifiedDocumentRow/);
  });

});

/** A second HELD document, named by the commitment its row reproduces, whose computed text is `text`. */
function seedOtherDocument(text: string): string {
  const other = commitmentOf(`0x${'d2'.repeat(32)}`, Buffer.alloc(32));
  store.documents = [...store.documents, { ...store.documents.at(0), docId: `0x${'d2'.repeat(32)}`, bytes: `0x${'d2'.repeat(32)}`, commitment: other }];
  store.documentContentVersions = [
    ...store.documentContentVersions,
    { ...store.documentContentVersions.at(-1), id: 'dcv-other', commitment: other, text },
  ];
  store.mentions = [
    ...store.mentions,
    mentionRow({ id: 'mention-other', versionId: VERSION.id, kind: 'DOCUMENT', name: other, contentVersionHash: HELD_NOW, debateSessionId: null }, false),
  ];
  return other;
}

describe('CHECK 19 — every quoted span of a paragraph carrying #doc_, by the ONE verdict rule (A6 :1536; A2 :1315)', () => {
  const row19 = async (): Promise<ThesisCheck> => rowOf(rowsOf(await evaluatePublication(VERSION.id, PASSING, asked({ verified: true }))), 'DOCUMENT_QUOTES_PRESENT');

  it('N11 — a span SHORTER than 12 characters is examined: no floor, "every quoted span" (S6)', async () => {
    await seedCitingDocument({ quotes: ['המחושב', 'חסר'] });
    const check = await row19();
    expect(check.examined).toEqual([{ name: COMMITMENT, spans: [{ span: 'המחושב', verdict: 'PRESENT' }, { span: 'חסר', verdict: 'ABSENT' }] }]);
    expect(check.failures).toEqual([expect.objectContaining({ name: COMMITMENT, span: 'חסר' })]);
  });

  it('#590, TO THE LETTER — a paragraph citing TWO documents checks each span against EACH: a quote from one reads ABSENT in the other', async () => {
    await seedCitingDocument();
    const other = commitmentOf(`0x${'d2'.repeat(32)}`, Buffer.alloc(32));
    store.documents = [...store.documents, { ...store.documents.at(0), docId: `0x${'d2'.repeat(32)}`, bytes: `0x${'d2'.repeat(32)}`, commitment: other }];
    store.documentContentVersions = [
      ...store.documentContentVersions,
      { ...store.documentContentVersions.at(-1), id: 'dcv-other', commitment: other, text: 'מסמך אחר לגמרי' },
    ];
    store.mentions = [
      ...store.mentions,
      mentionRow({ id: 'mention-other', versionId: VERSION.id, kind: 'DOCUMENT', name: other, contentVersionHash: HELD_NOW, debateSessionId: null }, false),
    ];
    store.versions = [{ ...VERSION, text: `הקוד קובע "${QUOTE}" #doc_${COMMITMENT} #doc_${other}.` }];
    const check = await row19();
    expect(check.failures).toEqual([expect.objectContaining({ name: other, span: QUOTE })]);
  });

  it('M11 — a span quoted with the Hebrew GERSHAYIM ״…״ that the document lacks FAILS row 19, named', async () => {
    await seedCitingDocument();
    store.versions = [{ ...VERSION, text: `הקוד קובע ״חסר בקוד לגמרי״ #doc_${COMMITMENT}.` }];
    const check = await row19();
    expect(check.verdict).toBe('FAIL');
    expect(check.failures).toEqual([expect.objectContaining({ name: COMMITMENT, span: 'חסר בקוד לגמרי' })]);
  });

  it('the same span twice in the paragraph is ONE subject — one verdict per (mention, span)', async () => {
    await seedCitingDocument({ quotes: [QUOTE, QUOTE] });
    expect((await row19()).examined).toEqual([{ name: COMMITMENT, spans: [{ span: QUOTE, verdict: 'PRESENT' }] }]);
  });
});

describe('N12 — publish_thesis writes PassageVerdict per (mention, span) in the PUBLISHED arm, and answers documentsOpened (A4 :1459–:1461)', () => {
  /** A head the gate passes — the fold stubbed, since the gate's own rows are held above and in the thesis suite. */
  async function publishWith(publishable: boolean): Promise<Record<string, unknown>> {
    jest.spyOn(documentStanding, 'documentVerificationOf').mockResolvedValue(asked({ verified: true }));
    jest.spyOn(publicationEvaluation, 'publishabilityOf').mockReturnValue({ publishable, failed: publishable ? [] : ['ANALYSIS_CURRENT'] });
    jest.spyOn(publicationAssessor, 'assess').mockResolvedValue(ASSESSED);
    actAs(AUTHOR);
    return JSON.parse(await publishThesisHandler({ thesisId: THESIS.id, rationale: 'הטיעון', publicInterestStatement: 'עניין ציבורי' })) as Record<string, unknown>;
  }
  const opening = (thesisId: string, value: string, day: number) => ({
    id: `opening-${thesisId}`, thesisId, commitment: COMMITMENT, sequence: 1, opening: value, researcherId: AUTHOR, createdAt: new Date(Date.UTC(2026, 8, day)),
  });

  it('PUBLISHED: one verdict row per (mention, span), written THROUGH the transaction, and the document it opened named', async () => {
    await seedCitingDocument({ quotes: [QUOTE, 'חסר'] });
    store.documentOpeningDecisions = [opening(THESIS.id, 'CONTENT', 20)];
    const out = await publishWith(true);

    const verdicts = written.filter((w) => w.model === 'passageVerdict').map((w) => w.data);
    expect(verdicts).toEqual([
      { versionId: VERSION.id, mentionId: DOC_MENTION, phrase: QUOTE, verdict: 'PRESENT' },
      { versionId: VERSION.id, mentionId: DOC_MENTION, phrase: 'חסר', verdict: 'ABSENT' },
    ]);
    expect(writtenViaTx.filter((w) => w.model === 'passageVerdict')).toHaveLength(2);
    expect(out['documentsOpened']).toEqual([COMMITMENT]);
  });

  it('M12 — a version citing TWO documents, each quoted in its paragraph: verdict rows for BOTH mentions, one per (mention, span)', async () => {
    await seedCitingDocument();
    const other = seedOtherDocument('מסמך אחר ובו משפט שני');
    store.versions = [{ ...VERSION, text: `הקוד קובע "${QUOTE}" #doc_${COMMITMENT}.\n\nוהמסמך השני "משפט שני" #doc_${other}.` }];
    store.documentOpeningDecisions = [opening(THESIS.id, 'CONTENT', 20)];
    await publishWith(true);

    const verdicts = written.filter((w) => w.model === 'passageVerdict').map((w) => w.data);
    expect(verdicts).toEqual([
      { versionId: VERSION.id, mentionId: DOC_MENTION, phrase: QUOTE, verdict: 'PRESENT' },
      { versionId: VERSION.id, mentionId: 'mention-other', phrase: 'משפט שני', verdict: 'PRESENT' },
    ]);
  });

  it('REFUSED: the attempt is written and NO verdict — a refused version published nothing to attest', async () => {
    await seedCitingDocument();
    store.documentOpeningDecisions = [opening(THESIS.id, 'CONTENT', 20)];
    const out = await publishWith(false);
    expect(out['code']).toBe('NOT_PUBLISHABLE');
    expect(written.filter((w) => w.model === 'passageVerdict')).toEqual([]);
    expect(written.filter((w) => w.model === 'publicationAttempt')).toHaveLength(1);
  });

  it('a document ALREADY opened by another thesis’s publication is not in documentsOpened — it was public before', async () => {
    await seedCitingDocument();
    store.documentOpeningDecisions = [opening(THESIS.id, 'CONTENT', 20), opening('thesis-other', 'PASSAGE', 18)];
    store.mentions = [
      ...store.mentions,
      mentionRow({ id: 'mention-elsewhere', versionId: 'version-other', kind: 'DOCUMENT', name: COMMITMENT, contentVersionHash: HELD_NOW, debateSessionId: null }, true, null, 'thesis-other'),
    ];
    store.attempts = [{ id: 'attempt-other', thesisId: 'thesis-other', versionId: 'version-other', outcome: 'PUBLISHED', createdAt: new Date(Date.UTC(2026, 8, 19)) }];
    const out = await publishWith(true);
    expect(out['documentsOpened']).toEqual([]);
  });
});

describe('Q15 — every cited document’s TITLE is handed to the publication assessor, and a name in it FAILS row 16 (A6 :1537; thesis :757)', () => {
  it('the assessor is handed the title; its list names the person; row 16 FAILS and names the title it examined', async () => {
    await seedCitingDocument();
    const TITLE = 'מכתב של יוסי כהן למשרד';
    store.documents = store.documents.map((d) => ({ ...d, title: TITLE }));
    jest.spyOn(documentStanding, 'documentVerificationOf').mockResolvedValue(asked({ verified: true }));
    // THE MODEL AT ITS BOUNDARY: `assess`, the one draw the suite stubs — it answers as a model reading the title would.
    const draw = jest.spyOn(publicationAssessor, 'assess').mockResolvedValue({
      ...ASSESSED,
      names: [{ name: 'יוסי כהן', where: 'TITLE', quote: TITLE }],
    });
    const out = JSON.parse(await checkPublicationReadinessHandler({ thesisId: THESIS.id, rationale: 'הטיעון' })) as {
      checks: ThesisCheck[];
    };

    expect(draw.mock.calls.at(0)?.[0].titles).toEqual([TITLE]);
    const row = rowOf(out.checks, 'NAMES_NO_PERSON');
    expect(row.verdict).toBe('FAIL');
    expect(row.examined).toEqual(expect.arrayContaining([{ title: TITLE }]));
    expect(row.failures).toEqual([{ name: 'יוסי כהן' }]);
  });

  // LOW-m (R84 Entry 16), under Q-R2 (a) — REVIEW's suppression, R86 Entry 3: a cited document with NO title is named NOT
  // EXAMINED by row 16, never folded into a clean list (A6 :1537: "the check examines every `#doc_` mention's title and
  // names the one it examined"). The assessor's material is UNCHANGED — there is no title to hand it — so no prompt moves
  // (Q-P). Its world: an untitled document is a SEALED one (the CHECK `Document_title_required_when_held`), which step 32's
  // door creates; the suite plants sealed documents already (Q3).
  it('B16 an UNTITLED cited document: the assessor is handed no title, and row 16 names it NOT EXAMINED — examined, not dropped; the row does not fail on it', async () => {
    await seedCitingDocument({ sealed: true });
    store.documents = store.documents.map((d) => ({ ...d, title: null }));
    jest.spyOn(documentStanding, 'documentVerificationOf').mockResolvedValue(asked({ verified: true }));
    const draw = jest.spyOn(publicationAssessor, 'assess').mockResolvedValue(ASSESSED);
    const out = JSON.parse(await checkPublicationReadinessHandler({ thesisId: THESIS.id, rationale: 'הטיעון' })) as {
      checks: ThesisCheck[];
    };

    expect(draw.mock.calls.at(0)?.[0].titles).toEqual([]);
    const row = rowOf(out.checks, 'NAMES_NO_PERSON');
    expect(row.examined).toEqual([{ commitment: COMMITMENT, title: null, examined: false }]);
    // A null title publishes no words (§7 :848), so there is nothing to name a person in — NOT EXAMINED, and not a failure.
    expect(row.verdict).toBe('PASS');
    expect(row.failures).toEqual([]);
  });
});

