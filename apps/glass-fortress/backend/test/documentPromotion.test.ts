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
import { flaggedFor, movedBetween } from '../src/services/evidencePredicates';
import { COMMITMENT, HELD_BEFORE, HELD_NOW, OTHER_COMMITMENT, RECEIPT, SEALED, TITLE, documentRow, versionRow } from './document/citationWorld';
import { CURRENT_EXTRACTOR } from '../src/lib/documentExtractor';
import { segments } from '../src/lib/claimSurvival';
import { AUTHOR, CURRENT_TEXT, SESSION, THESIS, VERSION, documentSession, seedDocumentDebate } from './document/debateWorld';
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
    store.documentContentVersions = [versionRow(RECEIPT, { derivedFrom: 'AT_RECEIPT', extractorVersion: 'v0-the-receipt-extractor' })];
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

// ---------------------------------------------------------------------------
// #594 — THE REVIEW OVER A DOCUMENT ROW, document step 34 chunk 5a. DECLARED EDIT of :205–:295, which held R82 Entry 8's
// loud guard ("the re-affirmation is step 34's") and the WATCH on FLAGGED; this step BUILDS what they guarded:
//
//   document flows §3 :348   `CURRENT_EXTRACTOR` moves → CURRENT moves → NEEDS_REVIEW → evidence Flow E3, unchanged
//   A3 :1372                 CITATION_CURRENT(m) · NEEDS_REVIEW(e) are evidence A3's, over CURRENT(d)
//   evidence A4 :1146        as CONFORMED (R85 Q-D; R86 Q-R1): the entry's `record` is { commitment, title }; its cause is
//                            { kind: 'EXTRACTOR', record, from: affirmed's extractorVersion, to: CURRENT_EXTRACTOR, at: the
//                            (CURRENT(d), CURRENT_EXTRACTOR) derivation row's moment }
//   E3 :532–:545             REAFFIRM moves affirmed and re-pins nothing; WITHDRAW with a reason, nothing removed
//   thesis :1523             as CONFORMED: a FLAGGED DOCUMENT mention's material carries the same record and cause
//
// Every world is one §3 :348 creates: the affirmed version derived under an older extractor, CURRENT(d) under today's.
// The :208–:212 comment that stood here said "any content arm for documents [is] step 35's" — CORRECTED: the content arm
// (CITATION_CURRENT over CURRENT(d)) is step 34's; only SHED (A3 :1382) is step 35's.
// ---------------------------------------------------------------------------

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

/** The DOCUMENT mention `debateWorld`'s head carries, as `citationsOf` selects it — on HEAD, and PUBLISHED when asked. */
const docMention = (pin: string, published: boolean): Row => ({
  id: 'mention-doc',
  versionId: VERSION,
  kind: 'DOCUMENT',
  name: COMMITMENT,
  contentVersionHash: pin,
  debateSessionId: null,
  debateSession: null,
  thesisVersion: { id: VERSION, thesisId: THESIS, isPublished: published ? { id: THESIS } : null },
});

/** The moment `versionRow` stamps on a version's producer row — CURRENT(d)'s derivation under today's extractor. */
const DERIVED = new Date(Date.UTC(2026, 8, 20));
const units = (text: string | null): { text: string }[] => (text === null ? [] : segments(text).map((t) => ({ text: t })));
const COMMANDS = [
  `review_evidence fileHash=${COMMITMENT} decision=REAFFIRM expectedSequence=0`,
  `review_evidence fileHash=${COMMITMENT} decision=WITHDRAW reason=… expectedSequence=0`,
];
const review = (decision: 'REAFFIRM' | 'WITHDRAW', reason?: string, fileHash = COMMITMENT) =>
  reviewEvidence({ fileHash, decision, reason: decision === 'WITHDRAW' ? (reason ?? 'אינו תומך בטענה') : undefined, expectedSequence: 0 }, AUTHOR);

afterEach(() => {
  jest.restoreAllMocks();
});

describe('#594 B12 — list_evidence_reviews over a promoted DOCUMENT whose CURRENT(d) moved (§3 :348; evidence A4 :1146 as CONFORMED)', () => {
  it('affirmed = CURRENT(d) owes NOTHING — in neither list (document A3 :1372, NEEDS_REVIEW CALLED)', async () => {
    store.evidenceRows = [promotedAt(HELD_NOW)];
    expect(await listEvidenceReviews()).toEqual({ owed: 0, reviews: [], notEvaluable: [] });
  });

  it('B12 one CONTENT_MOVED entry: the record by commitment and title, old beside new as SEGMENTS, what moved, why, who cites it, the two commands', async () => {
    store.evidenceRows = [promotedAt(HELD_BEFORE)];
    store.mentions = [docMention(HELD_BEFORE, true)];
    const list = await listEvidenceReviews();
    // THE FLOOR: one owed, so the entry below is a subject and not an absence.
    expect(list.owed).toBe(1);
    expect(list.notEvaluable).toEqual([]);
    const affirmed = units('נוסח ישן');
    const current = units(CURRENT_TEXT);
    expect(list.reviews).toEqual([
      {
        kind: 'CONTENT_MOVED',
        fileHash: COMMITMENT,
        record: { commitment: COMMITMENT, title: TITLE },
        owedSince: DERIVED,
        decisionSequence: 0,
        affirmed: { hash: HELD_BEFORE, chunks: affirmed },
        current: { hash: HELD_NOW, chunks: current },
        moved: movedBetween(affirmed, current),
        cause: [{ kind: 'EXTRACTOR', record: { commitment: COMMITMENT, title: TITLE }, from: 'v0-an-older-extractor', to: CURRENT_EXTRACTOR, at: DERIVED }],
        citedBy: [{ thesisId: THESIS, versionId: VERSION, published: true, argument: null }],
        narrowed: null,
        commands: COMMANDS,
      },
    ]);
    // Something did move — so `moved` above is not satisfied by two empty lists.
    expect(list.reviews.at(0)?.moved.entered.length).toBeGreaterThan(0);
  });

  it('B12b a BYTES-ONLY side reads `chunks: []` — a photograph a new OCR now reads: nothing affirmed as text, everything entered', async () => {
    store.documentContentVersions = [
      versionRow(COMMITMENT, { extractorVersion: 'v0-an-older-extractor', text: null }),
      versionRow(HELD_NOW, { text: CURRENT_TEXT }),
    ];
    store.evidenceRows = [promotedAt(COMMITMENT)];
    store.mentions = [docMention(COMMITMENT, true)];
    const entry = (await listEvidenceReviews()).reviews.at(0);
    expect(entry?.affirmed).toEqual({ hash: COMMITMENT, chunks: [] });
    expect(entry?.current).toEqual({ hash: HELD_NOW, chunks: units(CURRENT_TEXT) });
    expect(entry?.moved).toEqual({ entered: units(CURRENT_TEXT), left: [] });
  });

  // A→B→A — REPRODUCED by REVIEW (R86 Entry 2) and RULED (Q-R1, Entry 4; evidence A4 :1146 as CONFORMED): the affirmed
  // version B is a NEWER text than CURRENT(d), which is the OLDER text A that today's extractor reproduced. The version's
  // own `extractorVersion` and `derivedAt` name A's first derivation — the past; the moment CURRENT moved is the moment
  // today's extractor was recorded on A.
  function aba(reachedAt: Date | null): void {
    store.documentContentVersions = [
      versionRow(HELD_NOW, {
        text: CURRENT_TEXT,
        extractorVersion: 'v0-the-first-extractor',
        derivedAt: new Date(Date.UTC(2026, 8, 10)),
        derivations: [
          { extractorVersion: 'v0-the-first-extractor', at: new Date(Date.UTC(2026, 8, 10)) },
          { extractorVersion: CURRENT_EXTRACTOR, at: reachedAt },
        ],
      }),
      versionRow(HELD_BEFORE, { text: 'נוסח ישן', extractorVersion: 'v1-the-middle-extractor', derivedAt: new Date(Date.UTC(2026, 8, 15)) }),
    ];
    store.evidenceRows = [promotedAt(HELD_BEFORE)];
    store.mentions = [docMention(HELD_BEFORE, true)];
  }

  it('B12c A→B→A: `to` is CURRENT_EXTRACTOR and `at` / owedSince the moment it was RECORDED on CURRENT(d) — never CURRENT(d)’s own first derivation', async () => {
    const reached = new Date(Date.UTC(2026, 8, 25, 12));
    aba(reached);
    const entry = (await listEvidenceReviews()).reviews.at(0);
    expect(entry?.cause).toEqual([
      { kind: 'EXTRACTOR', record: { commitment: COMMITMENT, title: TITLE }, from: 'v1-the-middle-extractor', to: CURRENT_EXTRACTOR, at: reached },
    ]);
    expect(entry?.owedSince).toEqual(reached);
  });

  it('B12c the guard: a NULL moment on the (CURRENT(d), CURRENT_EXTRACTOR) row is a world no clause creates for a MOVED entry (R86 Entry 4) — LOUD, never a date', async () => {
    aba(null);
    await expect(listEvidenceReviews()).rejects.toThrow(/moment[\s\S]*not recorded[\s\S]*Q-R1/);
  });

  it('movedFrom over a DOCUMENT row answers the material — the pin beside CURRENT(d), what moved, why (the thesis list’s read, one function)', async () => {
    store.evidenceRows = [promotedAt(HELD_NOW)];
    const row = await recordRowOf(COMMITMENT);
    if (row === null) throw new Error('the promoted row did not load');
    const material = await movedFrom(row, HELD_BEFORE);
    expect(material?.from).toEqual({ hash: HELD_BEFORE, chunks: units('נוסח ישן') });
    expect(material?.current).toEqual({ hash: HELD_NOW, chunks: units(CURRENT_TEXT) });
    expect(material?.movedAt).toEqual(DERIVED);
    // UNMOVED: from IS CURRENT(d) — nothing moved, no cause, no moment.
    expect(await movedFrom(row, HELD_NOW)).toMatchObject({ cause: [], movedAt: null, moved: { entered: [], left: [] } });
    // A pin the document never held is null — each caller names it in its own words.
    expect(await movedFrom(row, OTHER_COMMITMENT)).toBeNull();
  });
});

describe('#594 B13 / B14 — review_evidence on a MOVED document (E3 :532–:545)', () => {
  it('B13 REAFFIRM moves `affirmed` to CURRENT(d) — ONE decision naming both hashes, NO mention re-pinned — and the published citation STAYS flagged (E3 :535–:538)', async () => {
    store.evidence = promotedAt(HELD_BEFORE);
    const out = await review('REAFFIRM');
    expect('code' in out ? out.code : null).toBeNull();
    expect(written.filter((w) => w.model === 'evidenceDecision').map((w) => w.data)).toEqual([
      expect.objectContaining({ fileHash: COMMITMENT, type: 'REAFFIRM', fromVersionHash: HELD_BEFORE, toVersionHash: HELD_NOW }),
    ]);
    expect(written.filter((w) => w.model === 'evidence').map((w) => w.data)).toEqual([{ affirmedContentVersionHash: HELD_NOW }]);
    expect(written.filter((w) => w.model === 'thesisMention')).toEqual([]);

    // AFTER THE ACT: the row as written. The review list owes nothing; the published mention still pins the old version,
    // so CITATION_CURRENT is false and FLAGGED holds until the author re-pins by a new version (E3 :535–:538).
    store.evidence = null;
    store.evidenceRows = [promotedAt(HELD_NOW)];
    store.mentions = [docMention(HELD_BEFORE, true)];
    expect((await listEvidenceReviews()).owed).toBe(0);
    expect((await flaggedFor(['mention-doc'])).get('mention-doc')).toMatchObject({ flagged: true, reasons: ['NOT_CITATION_CURRENT'] });
  });

  it('B14 WITHDRAW of a moved document: a blank reason is REASON_REQUIRED; with one, WITHDRAWN and nothing removed — FLAGGED names both reasons', async () => {
    store.evidence = promotedAt(HELD_BEFORE);
    const blank = await review('WITHDRAW', '   ');
    expect('code' in blank ? blank.code : null).toBe('REASON_REQUIRED');
    expect(written).toEqual([]);

    const out = await review('WITHDRAW', 'הגרסה החדשה אינה תומכת בטענה');
    expect('code' in out ? out.code : null).toBeNull();
    expect(written.filter((w) => w.model === 'evidenceDecision').map((w) => w.data)).toEqual([
      expect.objectContaining({ fileHash: COMMITMENT, type: 'WITHDRAW', reason: 'הגרסה החדשה אינה תומכת בטענה' }),
    ]);
    expect(written.filter((w) => w.model === 'evidence').map((w) => w.data)).toEqual([{ status: 'WITHDRAWN' }]);
    // Nothing is removed: every write is a create or an update (E3 :541–:542, "nothing deleted").
    expect(written.filter((w) => /^delete/.test(w.op))).toEqual([]);

    store.evidence = null;
    store.evidenceRows = [{ ...promotedAt(HELD_BEFORE), status: 'WITHDRAWN' }];
    store.mentions = [docMention(HELD_BEFORE, true)];
    expect((await flaggedFor(['mention-doc'])).get('mention-doc')).toMatchObject({ flagged: true, reasons: ['WITHDRAWN', 'NOT_CITATION_CURRENT'] });
  });

  it('REAFFIRM of a CURRENT document is NOTHING_TO_REVIEW; WITHDRAW of one is written — "unchanged over kind DOCUMENT" (A4 :1470)', async () => {
    store.evidence = promotedAt(HELD_NOW);
    const reaffirm = await review('REAFFIRM');
    expect('code' in reaffirm ? reaffirm.code : null).toBe('NOTHING_TO_REVIEW');
    expect('error' in reaffirm ? reaffirm.error : '').toContain(HELD_NOW);
    const withdraw = await review('WITHDRAW');
    expect('code' in withdraw ? withdraw.code : null).toBeNull();
    expect(written.find((w) => w.model === 'evidenceDecision')?.data).toMatchObject({ fileHash: COMMITMENT, type: 'WITHDRAW' });
  });

  it('an UNPROMOTED document is NOT_PROMOTED — a corpus record nobody selected, never "names nothing the corpus holds"', async () => {
    const refused = await review('REAFFIRM');
    expect('code' in refused ? refused.code : null).toBe('NOT_PROMOTED');
    const unknown = await review('REAFFIRM', undefined, OTHER_COMMITMENT);
    expect('code' in unknown ? unknown.code : null).toBe('NOT_A_RECORD');
  });
});

describe('#594 B15 — FLAGGED over a published DOCUMENT mention: CITATION_CURRENT over CURRENT(d) (A3 :1372; only SHED, :1382, is step 35’s)', () => {
  it('B15 a published mention pinning an older version is NOT_CITATION_CURRENT; THE FLOOR — one pinning CURRENT(d) is unflagged', async () => {
    store.evidenceRows = [promotedAt(HELD_NOW)];
    store.mentions = [docMention(HELD_BEFORE, true)];
    expect((await flaggedFor(['mention-doc'])).get('mention-doc')).toMatchObject({ flagged: true, reasons: ['NOT_CITATION_CURRENT'] });
    store.mentions = [docMention(HELD_NOW, true)];
    expect((await flaggedFor(['mention-doc'])).get('mention-doc')).toMatchObject({ flagged: false, reasons: [] });
  });

  it('B15 CURRENT(d) AWAITING — no version under today’s extractor — flags AWAITING_DERIVATION, the capture’s word; an UNPUBLISHED mention is never flagged', async () => {
    store.documentContentVersions = [versionRow(HELD_BEFORE, { extractorVersion: 'v0-an-older-extractor', text: 'נוסח ישן' })];
    store.evidenceRows = [promotedAt(HELD_BEFORE)];
    store.mentions = [docMention(HELD_BEFORE, true)];
    expect((await flaggedFor(['mention-doc'])).get('mention-doc')).toMatchObject({ flagged: true, reasons: ['AWAITING_DERIVATION'] });
    store.mentions = [docMention(HELD_BEFORE, false)];
    expect((await flaggedFor(['mention-doc'])).get('mention-doc')).toMatchObject({ flagged: false, reasons: [] });
  });
});

describe('#594 B15b — list_thesis_reviews: a FLAGGED DOCUMENT mention’s material (thesis :1523 as CONFORMED)', () => {
  /** The one review's FLAGGED material — a loud failure for any other kind, so a case never reads a material it did not ask for. */
  function flaggedMaterialOf(entry: Awaited<ReturnType<typeof listThesisReviews>>['reviews'][number] | undefined) {
    if (entry?.kind !== 'FLAGGED' || !('cause' in entry.material)) throw new Error(`expected one FLAGGED review, got ${String(entry?.kind)}`);
    return entry.material;
  }

  function flaggedWorld(pin: string, reasons: ('WITHDRAWN' | 'NOT_CITATION_CURRENT')[], status: string): void {
    seedThesis(AS_PUBLISHED);
    store.documents = [documentRow()];
    store.documentContentVersions = [
      versionRow(HELD_BEFORE, { extractorVersion: 'v0-an-older-extractor', text: 'נוסח ישן' }),
      versionRow(HELD_NOW, { text: CURRENT_TEXT }),
    ];
    store.mentions = [mentionRow({ ...MENTION, kind: 'DOCUMENT', name: COMMITMENT, contentVersionHash: pin }, true)];
    store.evidenceRows = [{ ...promotedAt(HELD_NOW), status }];
    if (status === 'WITHDRAWN') {
      store.decisions = [{ id: 'decision-1', fileHash: COMMITMENT, sequence: 1, type: 'WITHDRAW', fromVersionHash: null, toVersionHash: null, reason: 'אינו תומך', researcherId: AUTHOR, createdAt: new Date(Date.UTC(2026, 8, 24)) }];
    }
    jest.spyOn(thesisPredicates, 'reviews').mockResolvedValue([
      { kind: 'FLAGGED', thesisId: FIXTURE_THESIS.id, name: COMMITMENT, versionId: FIXTURE_VERSION.id, mentionId: MENTION.id, reasons, command: 'add_thesis_version …' },
    ]);
  }

  it('B15b NOT_CITATION_CURRENT: the record { commitment, title }, the PIN beside CURRENT(d) as segments, and the document cause', async () => {
    flaggedWorld(HELD_BEFORE, ['NOT_CITATION_CURRENT'], 'PROMOTED');
    const list = await listThesisReviews(THESIS_AUTHOR);
    expect(list.owed).toBe(1);
    const material = flaggedMaterialOf(list.reviews.at(0));
    expect(material.record).toEqual({ commitment: COMMITMENT, title: TITLE });
    expect(material.pin).toEqual({ hash: HELD_BEFORE, chunks: units('נוסח ישן') });
    expect(material.current).toEqual({ hash: HELD_NOW, chunks: units(CURRENT_TEXT) });
    expect(material.cause).toEqual([
      { kind: 'EXTRACTOR', record: { commitment: COMMITMENT, title: TITLE }, from: 'v0-an-older-extractor', to: CURRENT_EXTRACTOR, at: DERIVED },
    ]);
  });

  it('B15b WITHDRAWN on a CURRENT pin: the material answers — nothing moved, no cause (was R82’s loud guard through movedFrom)', async () => {
    flaggedWorld(HELD_NOW, ['WITHDRAWN'], 'WITHDRAWN');
    const material = flaggedMaterialOf((await listThesisReviews(THESIS_AUTHOR)).reviews.at(0));
    expect(material.record).toEqual({ commitment: COMMITMENT, title: TITLE });
    expect(material.cause).toEqual([]);
    expect(material.moved).toEqual({ entered: [], left: [] });
  });
});
