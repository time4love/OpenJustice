const mockResearcherId = jest.fn<string | null, []>();
jest.mock('../src/context/researcherContext', () => ({ getResearcherId: mockResearcherId }));

// THE CHAIN, DOUBLED AND COUNTING (plan :252; §6 :715–:716): both modules that can reach the registry are replaced by
// jest's automock — every export a recording double — so a promotion that reached either, by any import, is counted.
jest.mock('../src/services/Web3Service');
jest.mock('../src/services/anchorSnapshots');

jest.mock('../src/lib/prisma', () => ({
  prisma: (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).db,
}));

import * as anchorSnapshots from '../src/services/anchorSnapshots';
import { Web3Service } from '../src/services/Web3Service';
import { decideGapHandler } from '../src/mcp/tools/decideGap';
import { state } from '../src/mcp/tools/openDebate';
import { promoteFromDebateHandler } from '../src/mcp/tools/promoteFromDebate';
import { answered } from '../src/services/documentPredicates';
import { movedFrom, recordRowOf } from '../src/services/evidenceReviews';
import { flaggedFor } from '../src/services/evidencePredicates';
import { COMMITMENT, HELD_BEFORE, HELD_NOW, OTHER_COMMITMENT, RECEIPT, SEALED, documentRow, versionRow } from './document/citationWorld';
import { AUTHOR, SESSION, THESIS, VERSION, documentSession, seedDocumentDebate } from './document/debateWorld';
import { resetDouble, store, written, type Row } from './helpers/evidenceDouble';
import { listEvidenceReviews } from '../src/services/evidenceReviews';
import { reviewEvidence } from '../src/services/reviewEvidence';
import * as thesisPredicates from '../src/services/thesisPredicates';
import { listThesisReviews } from '../src/services/thesisReviews';
import { AUTHOR as THESIS_AUTHOR, MENTION, THESIS as FIXTURE_THESIS, VERSION as FIXTURE_VERSION } from './thesis/fixtures';
import { mentionRow } from './thesis/rows';
import { AS_PUBLISHED, seedThesis } from './thesis/tools';

// ---------------------------------------------------------------------------
// PROMOTION OF A DOCUMENT, AND THE GAP IT ANSWERS — document plan step 33 :250–:253; document flows §6 :711–:719, A3
// :1375; evidence A4 :1132–:1142.
//
// "E1's transaction: the Evidence row created iff none for this document — kind DOCUMENT, documentCommitment, fileHash =
// commitment, affirmed = CURRENT(d).hash — else joined; the head's mention gains debateSessionId; STALE_PIN as T3. NO
// CHAIN WRITE: the document was committed at receipt (§4), and promotion anchors nothing." Then `decide_gap CITED` on the
// commitment, and the arrival ANSWERED by derivation.
//
// IN THE GATING `unit` PROJECT, over the evidence double (the `document` project gates nothing until step 36).
// ---------------------------------------------------------------------------

/** Every recording double of both chain modules, and how many calls each has taken. */
function chainCalls(): number {
  const web3 = Web3Service as unknown as jest.Mock;
  const methods = Object.getOwnPropertyNames(Web3Service.prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => (Web3Service.prototype as unknown as Record<string, jest.Mock>)[name]);
  const snapshots = Object.values(anchorSnapshots).filter((value): value is jest.Mock => jest.isMockFunction(value));
  // THE FLOOR: the doubles exist, so a module that exported nothing mockable could not pass by counting nothing.
  expect(methods.length).toBeGreaterThan(0);
  expect(snapshots.length).toBeGreaterThan(0);
  return web3.mock.calls.length + [...methods, ...snapshots].reduce((sum, fn) => sum + fn.mock.calls.length, 0);
}

/** An argued document debate, cleared: SUBSTANCE, SUPPORTS, the head citing CURRENT(d). */
function cleared(over: Row = {}): void {
  resetDouble();
  jest.clearAllMocks();
  mockResearcherId.mockReturnValue(AUTHOR);
  seedDocumentDebate();
  store.session = documentSession({
    hasSubstance: true,
    verdict: 'SUPPORTS',
    events: [{ id: 'event-1', type: 'RATIONALE_SUBMITTED', content: 'החוזר מורה על כך במפורש.', createdAt: new Date() }],
    ...over,
  });
}

beforeEach(() => cleared());

const promote = async (): Promise<Row> => JSON.parse(await promoteFromDebateHandler({ sessionId: SESSION })) as Row;
const writes = (model: string, op: string): Row[] => written.filter((w) => w.model === model && w.op === op).map((w) => w.data);

describe('promote_from_debate over a document — the first Evidence row of kind DOCUMENT (§6 :712–:716)', () => {
  it('creates it: kind DOCUMENT, documentCommitment, fileHash = commitment, no capture or diff key, affirmed = CURRENT(d)', async () => {
    const out = await promote();
    expect(out).toEqual({
      fileHash: COMMITMENT,
      status: 'PROMOTED',
      affirmedContentVersionHash: HELD_NOW,
      created: true,
      promotedOverObjection: false,
    });
    const [row] = writes('evidence', 'create');
    expect(row).toEqual({
      fileHash: COMMITMENT,
      kind: 'DOCUMENT',
      snapshotId: null,
      urlVersionDiffId: null,
      documentCommitment: COMMITMENT,
      status: 'PROMOTED',
      affirmedContentVersionHash: HELD_NOW,
      promotedById: AUTHOR,
      promotedAt: expect.any(Date) as unknown,
    });
    // The public name, never the DOC_ID (§6 :669).
    expect(JSON.stringify(row)).not.toContain(String(documentRow()['docId']));
  });

  it('a SEALED document is promoted at its AT_RECEIPT version — CURRENT(d), forever (A3 :1370)', async () => {
    store.documents = [documentRow(SEALED)];
    store.documentContentVersions = [versionRow(RECEIPT, { derivedFrom: 'AT_RECEIPT', derivedUnder: ['v0-the-receipt-extractor'] })];
    store.mentions = [{ ...store.mentions[0], contentVersionHash: RECEIPT }];
    expect((await promote())['affirmedContentVersionHash']).toBe(RECEIPT);
    expect(writes('evidence', 'create').at(0)?.['affirmedContentVersionHash']).toBe(RECEIPT);
  });

  it('the debate closes PROMOTED with the row, the head’s mention gains debateSessionId, and the event is recorded', async () => {
    await promote();
    expect(writes('debateSession', 'update').at(0)).toMatchObject({ status: 'PROMOTED', evidenceId: 'ev-1', promotedOverObjection: false, openKey: null });
    expect(written.filter((w) => w.model === 'thesisMention' && w.op === 'update')).toEqual([
      { model: 'thesisMention', op: 'update', data: { debateSessionId: SESSION } },
    ]);
    expect(writes('debateEvent', 'create').at(0)).toMatchObject({ sessionId: SESSION, type: 'PROMOTED', refId: 'ev-1' });
  });

  it('JOINED, not created, when an Evidence row already holds the commitment — a second thesis’s argument', async () => {
    store.evidenceRows = [
      { id: 'ev-existing', fileHash: COMMITMENT, kind: 'DOCUMENT', documentCommitment: COMMITMENT, status: 'PROMOTED', affirmedContentVersionHash: HELD_NOW },
    ];
    const out = await promote();
    expect([out['created'], out['affirmedContentVersionHash']]).toEqual([false, HELD_NOW]);
    expect(writes('evidence', 'create')).toEqual([]);
    expect(writes('debateSession', 'update').at(0)).toMatchObject({ evidenceId: 'ev-existing' });
  });

  it('STALE_PIN — the head pins a version that is no longer CURRENT(d): refused, nothing written (T3)', async () => {
    store.mentions = [{ ...store.mentions[0], contentVersionHash: HELD_BEFORE }];
    expect((await promote())['code']).toBe('STALE_PIN');
    expect(written).toEqual([]);
  });

  it('every refusal of open_debate is re-checked at this moment — a document SHED since the argument refuses SHED', async () => {
    store.documents = [documentRow({ bytes: null })];
    store.sheds = [{ commitment: COMMITMENT, cause: 'SENDER', researcherId: null, reason: null, at: new Date(Date.UTC(2026, 8, 21)) }];
    expect((await promote())['code']).toBe('SHED');
    expect(written).toEqual([]);
  });

  it('the thread closes as itself — DEBATE_CLOSED PROMOTED in the platform’s voice (thesis A4 :1476)', async () => {
    await promote();
    const closed = (await state(SESSION)).turns.find((turn) => turn.kind === 'DEBATE_CLOSED');
    expect(closed).toMatchObject({ kind: 'DEBATE_CLOSED', by: { voice: 'PLATFORM' }, body: { outcome: 'PROMOTED' } });
  });
});

describe('NO CHAIN WRITE AT PROMOTION — the document was committed at RECEIPT (§6 :715–:716; plan :252)', () => {
  it('a created promotion and a joined one make ZERO calls on either chain module', async () => {
    await promote();
    cleared();
    store.evidenceRows = [{ id: 'ev-existing', fileHash: COMMITMENT, kind: 'DOCUMENT', documentCommitment: COMMITMENT, status: 'PROMOTED', affirmedContentVersionHash: HELD_NOW }];
    await promote();
    expect(chainCalls()).toBe(0);
  });

  it('THE CONTROL: the double COUNTS — a call it is handed is seen, so zero above is an observation and not a blind', async () => {
    await anchorSnapshots.countUnanchoredSnapshots();
    new Web3Service();
    expect(chainCalls()).toBe(2);
  });
});

describe('decide_gap CITED on a commitment the head mentions; ANSWERED derived, never stored (§6 :717–:719; A3 :1375)', () => {
  const GAP = { gapId: '0xgap-doc', sequence: 1, decision: 'OPEN', description: 'אין מסמך המראה מה ידע המשרד', citedName: null };
  const seedGap = (): void => {
    store.theses = [{ id: THESIS, createdById: AUTHOR, headVersionId: VERSION, publishedVersionId: null }];
    store.gapDecisions = [{ ...GAP, id: 'gap-1', thesisId: THESIS, researcherId: AUTHOR, reason: null, request: null, callItem: null, createdAt: new Date() }];
  };
  const decide = async (citedName: string): Promise<Row> =>
    JSON.parse(
      await decideGapHandler({ thesisId: THESIS, gapId: GAP.gapId, expectedSequence: 1, decision: 'CITED', citedName }),
    ) as Row;

  it('CITED with citedName = the commitment is written — the gap moves to CITED naming the document', async () => {
    seedGap();
    const out = await decide(COMMITMENT);
    expect(out['code']).toBeUndefined();
    expect(writes('thesisGapDecision', 'create').at(0)).toMatchObject({ gapId: GAP.gapId, decision: 'CITED', citedName: COMMITMENT });
  });

  it('NOT_CITED for a commitment the head does not mention — and the wording names #doc_ (F3)', async () => {
    seedGap();
    const out = await decide(OTHER_COMMITMENT);
    expect(out['code']).toBe('NOT_CITED');
    expect(String(out['error'])).toContain('#doc_');
    expect(writes('thesisGapDecision', 'create')).toEqual([]);
  });

  it('the arrival is ANSWERED BY DERIVATION from HEAD’s mentions — nothing about the arrival is written', async () => {
    seedGap();
    await decide(COMMITMENT);
    // No arrival table, flag or column moved: the decision is the gap's, and ANSWERED is read from the citation.
    expect(written.map((w) => w.model).filter((model) => /arrival/i.test(model))).toEqual([]);
    const headCites = store.mentions.filter((m) => m['versionId'] === VERSION && m['kind'] === 'DOCUMENT').map((m) => String(m['name']));
    const arrival = { thesisId: THESIS };
    expect(answered(arrival, headCites, [COMMITMENT, OTHER_COMMITMENT])).toBe(true);
    expect(answered(arrival, headCites, [OTHER_COMMITMENT])).toBe(false);
    // The researcher's door carries no thesis (A2 :1280–:1284): no HEAD to be cited by.
    expect(answered({ thesisId: null }, headCites, [COMMITMENT])).toBe(false);
  });
});

describe('WATCH (R81 Entry 22) — FLAGGED and flaggedReview over a DOCUMENT Evidence row', () => {
  const PROMOTED_ROW = { fileHash: COMMITMENT, kind: 'DOCUMENT', documentCommitment: COMMITMENT, status: 'PROMOTED', affirmedContentVersionHash: HELD_NOW, snapshot: null, urlVersionDiff: null };

  // A DOCUMENT mention on a PUBLISHED version is UNREACHABLE until step 34: check 18 refuses publishing a `#doc_` head
  // (plan :255). These two cases hold what FLAGGED and its review will meet then, so the day it becomes reachable is
  // not the day it is first read. What they hold: a moved CURRENT(d) is NOT a flag reason today (the pin here is an
  // older version, and the row stays unflagged) — FLAGGED's SHED arm and any content arm for documents are step 35's —
  // and the one reason a document CAN raise, WITHDRAWN, reaches `flaggedReview`, whose `movedFrom` throws below.
  it('FLAGGED’s content arm is not evaluated for a document — a PROMOTED row on a PUBLISHED mention is unflagged, by WITHDRAWN alone', async () => {
    store.mentions = [{ id: 'mention-doc', name: COMMITMENT, contentVersionHash: HELD_BEFORE, thesisVersion: { isPublished: { id: 'pub' } } }];
    store.evidenceRows = [PROMOTED_ROW];
    expect((await flaggedFor(['mention-doc'])).get('mention-doc')).toMatchObject({ flagged: false, reasons: [] });
    store.evidenceRows = [{ ...PROMOTED_ROW, status: 'WITHDRAWN' }];
    expect((await flaggedFor(['mention-doc'])).get('mention-doc')).toMatchObject({ flagged: true, reasons: ['WITHDRAWN'] });
  });

  it('movedFrom over a DOCUMENT row THROWS by name — loud, never a silent null a review would report as a malformed pin', async () => {
    store.evidenceRows = [PROMOTED_ROW];
    const row = await recordRowOf(COMMITMENT);
    if (row === null) throw new Error('the promoted row did not load');
    // The one guard (R82 Entry 8): it names the rule it stands in for, and the step that builds the review.
    await expect(movedFrom(row, HELD_NOW)).rejects.toThrow(/document flows §3 :348[\s\S]*document step 34/);
  });
});

describe('THE REVIEW READS over a promoted DOCUMENT row — true words, and a LOUD guard for a moved one (R82 Entries 6, 8)', () => {
  const GUARD = /document flows §3 :348[\s\S]*document step 34/;
  /** A promoted document whose affirmed version is `affirmed`, over `debateWorld`'s HELD document (CURRENT(d) = HELD_NOW). */
  const promotedAt = (affirmed: string): Row => ({
    id: 'ev-doc',
    fileHash: COMMITMENT,
    kind: 'DOCUMENT',
    documentCommitment: COMMITMENT,
    status: 'PROMOTED',
    affirmedContentVersionHash: affirmed,
    snapshot: null,
    urlVersionDiff: null,
  });
  const review = (decision: 'REAFFIRM' | 'WITHDRAW', fileHash = COMMITMENT) =>
    reviewEvidence({ fileHash, decision, reason: decision === 'WITHDRAW' ? 'אינו תומך בטענה' : undefined, expectedSequence: 0 }, AUTHOR);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('list_evidence_reviews: affirmed = CURRENT(d) owes NOTHING — in neither list (document A3 :1372, NEEDS_REVIEW CALLED)', async () => {
    store.evidenceRows = [promotedAt(HELD_NOW)];
    expect(await listEvidenceReviews()).toEqual({ owed: 0, reviews: [], notEvaluable: [] });
  });

  it('list_evidence_reviews: a MOVED CURRENT(d) refuses LOUDLY, naming §3 :348 and step 34 — never a false word, never skipped', async () => {
    store.evidenceRows = [promotedAt(HELD_BEFORE)];
    await expect(listEvidenceReviews()).rejects.toThrow(GUARD);
  });

  it('review_evidence: REAFFIRM of a CURRENT document is NOTHING_TO_REVIEW; WITHDRAW of one is written — "unchanged over kind DOCUMENT" (A4 :1470)', async () => {
    store.evidence = promotedAt(HELD_NOW);
    const reaffirm = await review('REAFFIRM');
    expect('code' in reaffirm ? reaffirm.code : null).toBe('NOTHING_TO_REVIEW');
    expect('error' in reaffirm ? reaffirm.error : '').toContain(HELD_NOW);
    const withdraw = await review('WITHDRAW');
    expect('code' in withdraw ? withdraw.code : null).toBeNull();
    expect(written.find((w) => w.model === 'evidenceDecision')?.data).toMatchObject({ fileHash: COMMITMENT, type: 'WITHDRAW' });
  });

  it('review_evidence: a MOVED document refuses LOUDLY on either decision — its re-affirmation is step 34’s (R82 Entry 8)', async () => {
    store.evidence = promotedAt(HELD_BEFORE);
    await expect(review('REAFFIRM')).rejects.toThrow(GUARD);
    await expect(review('WITHDRAW')).rejects.toThrow(GUARD);
    expect(written).toEqual([]);
  });

  it('review_evidence: an UNPROMOTED document is NOT_PROMOTED — a corpus record nobody selected, never "names nothing the corpus holds"', async () => {
    const refused = await review('REAFFIRM');
    expect('code' in refused ? refused.code : null).toBe('NOT_PROMOTED');
    const unknown = await review('REAFFIRM', OTHER_COMMITMENT);
    expect('code' in unknown ? unknown.code : null).toBe('NOT_A_RECORD');
  });

  it('flaggedReview: a WITHDRAWN document cited by a PUBLISHED version refuses LOUDLY through movedFrom — reachable at step 34', async () => {
    // The world step 34 makes reachable (check 18 refuses publishing a #doc_ head until then): the published version
    // cites the document, and its promoted row is WITHDRAWN — FLAGGED's one reason a document can raise today.
    seedThesis(AS_PUBLISHED);
    store.mentions = [mentionRow({ ...MENTION, kind: 'DOCUMENT', name: COMMITMENT, contentVersionHash: HELD_NOW }, true)];
    store.evidenceRows = [{ ...promotedAt(HELD_NOW), status: 'WITHDRAWN' }];
    jest.spyOn(thesisPredicates, 'reviews').mockResolvedValue([
      { kind: 'FLAGGED', thesisId: FIXTURE_THESIS.id, name: COMMITMENT, versionId: FIXTURE_VERSION.id, mentionId: MENTION.id, reasons: ['WITHDRAWN'], command: 'add_thesis_version …' },
    ]);
    await expect(listThesisReviews(THESIS_AUTHOR)).rejects.toThrow(GUARD);
  });
});
