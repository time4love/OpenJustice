jest.mock('../../src/lib/prisma', () => ({
  prisma: (require('../helpers/evidenceDouble') as typeof import('../helpers/evidenceDouble')).db,
}));

import * as evidencePredicates from '../../src/services/evidencePredicates';
import { AFTER, BEFORE, CAPTURE_NAME, CURRENT_VERSION, DIFF_NAME, DIFF_ROW } from '../helpers/corpusFixture';
import { resetDouble, store, written } from '../helpers/evidenceDouble';
import { built } from './absent';
import type { CitedMention, DebateRef, FingerprintInput, ReviewEntry, ThesisPredicatesModule, ThesisVersionRow } from './contract';
import {
  ANALYSIS,
  ATTEMPT,
  AUTHOR,
  CLAIM,
  DEBATE,
  FRAMING,
  MENTION,
  NEXT_VERSION,
  NOTE,
  OTHER_RESEARCHER,
  PROVISION,
  ROUNDS,
  THESIS,
  TRAJECTORY_ID,
  TRAJECTORY_MENTION,
  TRAJECTORY_VERSION,
  VERSION,
  WITHDRAWAL,
} from './fixtures';
import {
  CHOSEN,
  CONJUNCTS_ALONE,
  CURRENCIES,
  EVIDENCE_FAILS,
  EVIDENCE_NOT_EVALUABLE,
  EVIDENCE_PASSES,
  GAP_ID,
  MENTION_ROW,
  PASSING,
  analysis,
  at,
  capture,
  defined,
  diffRecord,
  gap,
  round,
  seedPublishable,
  trajectoriesAre,
} from './gateWorld';
import { mentionRow } from './rows';

// ---------------------------------------------------------------------------
// A3's DERIVATIONS — docs/gf-thesis-flows.md A3, the R40 sketch §2.
//
// RED BY DESIGN: every case reaches `services/thesisPredicates` through `built`,
// naming the exports IT needs, so each fails BY NAME on the step that owes the
// EARLIEST of them (`built`'s rule, ruled at 7.2) — CLAIM_FRAMED at 19, UNARGUED
// and HISTORY at 20, FINGERPRINT and the gap list at 22, TRAJECTORY_CURRENT at 23,
// REVIEWS at 24.
//
// PUBLISHABLE(v) IS STEP 23's, AND ITS CASES NAME STEP 22 — both true (L3). Each
// of them also asks for `fingerprint` and `CRITIC_PROMPT_VERSION`, step 22's, to
// seed the CURRENT analysis the version must carry; so until step 22 lands the red
// line names 22, the earliest export the case needs, and from 22 until 23 the
// module exists without `publishableVersion` and the loader's line becomes "does
// not export publishableVersion (thesis step 23)". A case naming 23 while 22 is
// unbuilt would name a step that cannot turn it green.
//
// EVERY CASE CALLS THE ONE SYMBOL where A3 composes a predicate another module
// owns — `argued` (UNARGUED), `currentVersionOf` (FINGERPRINT),
// `publishableEvidence` (PUBLISHABLE(v)), `flagged` (REVIEWS' FLAGGED arm) and the
// trajectory service's `resolveTrajectoryCitations` (REVIEWS' STALE_TRAJECTORY
// arm). That they are CALLS is each builder step's to prove, by breaking the
// symbol at its source; step 17 cannot, because every case reddens on the loader
// before it reaches one.
//
// THREE NOTES BIND THIS FILE (the sketch's round-3 note):
//   L1  PUBLISHABLE(v) over a NON-EVALUABLE evidence half asserts only that the
//       version is not publishable — never HOW the report says so (§9's §2b).
//   L5  every fixture row has a distinct `createdAt`; a tie inside one transaction
//       is step 20's question and is never asserted.
//   L6  the evidence half is asserted as a VALUE the predicate composes, and its
//       call by the version id — never as a count of calls.
//
// THE DATABASE-BACKED THREE — PUBLISHABLE(v), HISTORY, REVIEWS — stand on the
// shared double. Its mention rows carry BOTH today's columns (`thesisVersionId`,
// `type`, `refId`) and A2's target (`versionId`, `kind`, `name`), because the
// double's evidence-layer delegates filter by today's names until step 18 renames
// them; the step that builds each of the three reads the double as it then is.
// ---------------------------------------------------------------------------

type P = ThesisPredicatesModule;
const predicates = (...names: (keyof P)[]): Promise<P> =>
  built<P>('services/thesisPredicates', names);

beforeEach(() => {
  resetDouble();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// `at`, `round`, `gap`, `analysis`, `diffRecord` and the rest are `test/thesis/gateWorld.ts`'s (7.4).

// ---------------------------------------------------------------------------
// CLAIM_FRAMED(v) — A3 :1366–:1368 · thesis step 19
// ---------------------------------------------------------------------------

const framedInput = (over: Partial<Parameters<P['claimFramed']>[0]> = {}): Parameters<P['claimFramed']>[0] => ({
  version: { thesisId: THESIS.id, claim: CLAIM },
  thesis: { id: THESIS.id, provision: PROVISION },
  framings: [FRAMING],
  rounds: ROUNDS,
  ...over,
});

describe('CLAIM_FRAMED(v) — the claim was chosen after an assessed round, under this provision (thesis step 19)', () => {
  it('a CHOSEN round naming the claim and the provision, preceded by an ASSESSED one, frames it', async () => {
    const p = await predicates('claimFramed');
    expect(p.claimFramed(framedInput())).toBe(true);
  });

  it('a CHOSEN round with no ASSESSED round in the framing does not', async () => {
    const p = await predicates('claimFramed');
    const rounds = [round(1, 'PROPOSED', { framing: CLAIM }), round(2, 'CHOSEN', CHOSEN)];
    expect(p.claimFramed(framedInput({ rounds }))).toBe(false);
  });

  it('an ASSESSED round whose SEQUENCE follows the CHOSEN one does not — by sequence, never createdAt', async () => {
    const p = await predicates('claimFramed');
    const rounds = [round(1, 'PROPOSED', { framing: CLAIM }), round(2, 'CHOSEN', CHOSEN), round(3, 'ASSESSED', {})];
    expect(p.claimFramed(framedInput({ rounds }))).toBe(false);
  });

  it('a claim differing by ONE character is not framed — "a claim reworded after its framing" (T1 :332)', async () => {
    const p = await predicates('claimFramed');
    expect(p.claimFramed(framedInput({ version: { thesisId: THESIS.id, claim: `${CLAIM}.` } }))).toBe(false);
  });

  it('a claim differing only by WHITESPACE is not framed either — "restated verbatim" (T2 :451–:453)', async () => {
    const p = await predicates('claimFramed');
    expect(p.claimFramed(framedInput({ version: { thesisId: THESIS.id, claim: `${CLAIM} ` } }))).toBe(false);
  });

  it("a CHOSEN provision other than the thesis's does not frame it", async () => {
    const p = await predicates('claimFramed');
    expect(p.claimFramed(framedInput({ thesis: { id: THESIS.id, provision: 'NUREMBERG_10' } }))).toBe(false);
  });

  it('a framing attached to ANOTHER thesis frames nothing here', async () => {
    const p = await predicates('claimFramed');
    expect(p.claimFramed(framedInput({ framings: [{ ...FRAMING, thesisId: 'thesis-2' }] }))).toBe(false);
  });

  it('no provision on the thesis and none chosen frames it — the provision is optional (A2)', async () => {
    const p = await predicates('claimFramed');
    const rounds = [round(1, 'ASSESSED', {}), round(2, 'CHOSEN', { claim: CLAIM, provision: null, elements: [] })];
    const input = framedInput({ thesis: { id: THESIS.id, provision: null }, framings: [{ ...FRAMING, provision: null }], rounds });
    expect(p.claimFramed(input)).toBe(true);
  });

  it('a RE-FRAMING on the same thesis frames it, though the first framing chose another claim', async () => {
    const p = await predicates('claimFramed');
    const second = { ...FRAMING, id: 'framing-2', createdAt: at(8, 20) };
    const rounds = [
      round(1, 'ASSESSED', {}),
      round(2, 'CHOSEN', { ...CHOSEN, claim: 'טענה קודמת' }),
      round(1, 'ASSESSED', {}, second.id),
      round(2, 'CHOSEN', CHOSEN, second.id),
    ];
    expect(p.claimFramed(framedInput({ framings: [FRAMING, second], rounds }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// UNARGUED(v) — A3 :1371–:1374 · thesis step 20 · CALLS evidence's `argued`
// ---------------------------------------------------------------------------

// DEBATE is the fixture's — PROMOTED for this record and this thesis — one debate
// for UNARGUED, REVIEWS and HISTORY alike, never a second literal of it.
const cited = (over: Partial<CitedMention> = {}): CitedMention => ({ ...MENTION, debate: DEBATE, ...over });

describe("UNARGUED(v) — the version's EVIDENCE citations nobody has argued for (thesis step 20)", () => {
  it('a citation with no debate is unargued', async () => {
    const p = await predicates('unargued');
    expect(p.unargued({ thesisId: THESIS.id }, [cited({ debate: null })])).toEqual([DIFF_NAME]);
  });

  it('a debate PROMOTED for this record and this thesis argues it', async () => {
    const p = await predicates('unargued');
    expect(p.unargued({ thesisId: THESIS.id }, [cited()])).toEqual([]);
  });

  it('a debate PROMOTED for ANOTHER thesis does not argue it here', async () => {
    const p = await predicates('unargued');
    expect(p.unargued({ thesisId: THESIS.id }, [cited({ debate: { ...DEBATE, thesisId: 'thesis-2' } })])).toEqual([DIFF_NAME]);
  });

  it('a debate PROMOTED for ANOTHER record does not argue it', async () => {
    const p = await predicates('unargued');
    const other = { ...DEBATE, recordFileHash: `0x${'ab'.repeat(32)}` };
    expect(p.unargued({ thesisId: THESIS.id }, [cited({ debate: other })])).toEqual([DIFF_NAME]);
  });

  it('a TRAJECTORY citation is never in the set — UNARGUED is over EVIDENCE mentions', async () => {
    const p = await predicates('unargued');
    const trajectory = cited({ kind: 'TRAJECTORY', name: 'trajectory-1', contentVersionHash: null, debate: null });
    expect(p.unargued({ thesisId: THESIS.id }, [trajectory])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// FINGERPRINT(v) and CURRENT_ANALYSIS(v) — A3 :1376–:1379 · thesis step 22
// · FINGERPRINT CALLS evidence's `currentVersionOf` for every cited record
//
// PROPERTIES, NEVER A VECTOR: A3 states no byte layout for `‖` here, and the
// fingerprint is compared only with itself (sketch §6-10). Step 22 states it.
// ---------------------------------------------------------------------------

const fpInput = (over: Partial<FingerprintInput> = {}): FingerprintInput => ({
  contentHash: VERSION.contentHash,
  evidence: [{ name: DIFF_NAME, record: diffRecord() }],
  trajectoryIds: ['trajectory-1'],
  gaps: [{ gapId: GAP_ID, decision: 'OPEN' }],
  promptVersion: 'critic-v1',
  ...over,
});

describe('FINGERPRINT(v) — the input an analysis was about (thesis step 22)', () => {
  it('is deterministic over the same input', async () => {
    const p = await predicates('fingerprint');
    expect(defined(p.fingerprint(fpInput()))).toBe(defined(p.fingerprint(fpInput())));
  });

  it("moves when a cited record's CURRENT moves", async () => {
    const p = await predicates('fingerprint');
    const moved = { ...CURRENT_VERSION, contentVersionHash: 'content-moved', afterTextHash: 'text-after-v4' };
    const record = diffRecord([CURRENT_VERSION, moved], { ...capture(AFTER), textHash: 'text-after-v4' });
    expect(defined(p.fingerprint(fpInput({ evidence: [{ name: DIFF_NAME, record }] })))).not.toBe(
      defined(p.fingerprint(fpInput())),
    );
  });

  it('moves with a gap decision', async () => {
    const p = await predicates('fingerprint');
    const decided = fpInput({ gaps: [{ gapId: GAP_ID, decision: 'CITED' }] });
    expect(defined(p.fingerprint(decided))).not.toBe(defined(p.fingerprint(fpInput())));
  });

  it("moves with the critic's prompt version", async () => {
    const p = await predicates('fingerprint');
    expect(defined(p.fingerprint(fpInput({ promptVersion: 'critic-v2' })))).not.toBe(defined(p.fingerprint(fpInput())));
  });

  it("moves with the version's contentHash", async () => {
    const p = await predicates('fingerprint');
    expect(defined(p.fingerprint(fpInput({ contentHash: `0x${'00'.repeat(32)}` })))).not.toBe(
      defined(p.fingerprint(fpInput())),
    );
  });

  it('moves when the SET of cited trajectory ids changes — added, removed, replaced (A3 :1377–:1378)', async () => {
    const p = await predicates('fingerprint');
    const base = defined(p.fingerprint(fpInput()));
    for (const trajectoryIds of [['trajectory-1', 'trajectory-2'], [], ['trajectory-9']]) {
      expect(defined(p.fingerprint(fpInput({ trajectoryIds })))).not.toBe(base);
    }
  });

  it('does NOT move with the order EVIDENCE mentions are discovered in — name order is A3\'s', async () => {
    const p = await predicates('fingerprint');
    const captureRecord = { kind: 'CAPTURE' as const, capture: capture(BEFORE) };
    const diff = { name: DIFF_NAME, record: diffRecord() };
    const cap = { name: CAPTURE_NAME, record: captureRecord };
    expect(defined(p.fingerprint(fpInput({ evidence: [diff, cap] })))).toBe(
      defined(p.fingerprint(fpInput({ evidence: [cap, diff] }))),
    );
  });

  it('is UNDEFINED over a cited diff AWAITING_DERIVATION, and names the diff', async () => {
    const p = await predicates('fingerprint');
    const awaiting = fpInput({ evidence: [{ name: DIFF_NAME, record: diffRecord([]) }] });
    expect(p.fingerprint(awaiting)).toEqual({ defined: false, reason: 'AWAITING_DERIVATION', name: DIFF_NAME });
  });
});

describe('CURRENT_ANALYSIS(v) — the analysis whose fingerprint is the version\'s now (thesis step 22)', () => {
  it('is the analysis carrying the current fingerprint', async () => {
    const p = await predicates('currentAnalysis');
    expect(p.currentAnalysis(VERSION.id, [analysis('fp-old'), analysis('fp-now')], 'fp-now')?.inputFingerprint).toBe('fp-now');
  });

  it('is NONE when the only analysis is stale — its fingerprint moved', async () => {
    const p = await predicates('currentAnalysis');
    expect(p.currentAnalysis(VERSION.id, [analysis('fp-old')], 'fp-now')).toBeNull();
  });

  it('is NONE when no analysis was ever run', async () => {
    const p = await predicates('currentAnalysis');
    expect(p.currentAnalysis(VERSION.id, [], 'fp-now')).toBeNull();
  });

  it("is NONE for ANOTHER version's analysis with the same fingerprint", async () => {
    const p = await predicates('currentAnalysis');
    expect(p.currentAnalysis(VERSION.id, [analysis('fp-now', 'version-2')], 'fp-now')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// GAP_IN_FORCE · GAP_LIST · GAPS_DECIDED — A3 :1381–:1384 · thesis step 22
// ---------------------------------------------------------------------------

describe('GAP_IN_FORCE(t, gapId) — the decision with the highest sequence (thesis step 22)', () => {
  it('the later decision is in force', async () => {
    const p = await predicates('gapInForce');
    const inForce = p.gapInForce([gap(1, 'OPEN'), gap(2, 'DISMISSED', { reason: 'לא רלוונטי' })], THESIS.id, GAP_ID);
    expect(inForce?.sequence).toBe(2);
  });

  it('by SEQUENCE, whatever order the rows arrive in', async () => {
    const p = await predicates('gapInForce');
    const rows = [gap(3, 'CONCEDED', { reason: 'נודה בכך' }), gap(1, 'OPEN'), gap(2, 'CITED', { citedName: DIFF_NAME })];
    expect(p.gapInForce(rows, THESIS.id, GAP_ID)?.sequence).toBe(3);
  });

  it("another gap's decisions do not count, and a gap with none has no decision in force", async () => {
    const p = await predicates('gapInForce');
    const rows = [gap(5, 'OPEN', { gapId: '0xother' }), gap(1, 'DISMISSED', { reason: 'לא רלוונטי' })];
    expect(p.gapInForce(rows, THESIS.id, GAP_ID)?.sequence).toBe(1);
    expect(p.gapInForce(rows, THESIS.id, '0xnever-decided')).toBeNull();
  });
});

describe('GAP_LIST(t) — every gap at its decision in force (thesis step 22)', () => {
  it('lists each gap once, at its decision in force', async () => {
    const p = await predicates('gapList');
    const rows = [gap(1, 'OPEN'), gap(2, 'DISMISSED', { reason: 'לא רלוונטי' }), gap(1, 'OPEN', { gapId: '0xsecond' })];
    const list = p.gapList(rows, THESIS.id, [DIFF_NAME]);
    expect(Object.fromEntries(list.map((e) => [e.gapId, e.readsAs]))).toEqual({ [GAP_ID]: 'DISMISSED', '0xsecond': 'OPEN' });
  });

  it('a gap CITED whose citation HEAD no longer mentions reads OPEN', async () => {
    const p = await predicates('gapList');
    const rows = [gap(1, 'CITED', { citedName: DIFF_NAME })];
    expect(p.gapList(rows, THESIS.id, []).map((e) => e.readsAs)).toEqual(['OPEN']);
    expect(p.gapList(rows, THESIS.id, [DIFF_NAME]).map((e) => e.readsAs)).toEqual(['CITED']);
  });
});

describe('GAPS_DECIDED(v) — no gap reads OPEN (thesis step 22)', () => {
  it('every gap decided is decided, and says how many it examined', async () => {
    const p = await predicates('gapList', 'gapsDecided');
    const rows = [gap(1, 'DISMISSED', { reason: 'לא רלוונטי' }), gap(1, 'CONCEDED', { gapId: '0xsecond', reason: 'נודה' })];
    expect(p.gapsDecided(p.gapList(rows, THESIS.id, []))).toEqual({ decided: true, examined: 2 });
  });

  it('one gap OPEN is not decided', async () => {
    const p = await predicates('gapList', 'gapsDecided');
    expect(p.gapsDecided(p.gapList([gap(1, 'OPEN')], THESIS.id, [])).decided).toBe(false);
  });

  it('a gap CITED whose citation left the text is not decided', async () => {
    const p = await predicates('gapList', 'gapsDecided');
    expect(p.gapsDecided(p.gapList([gap(1, 'CITED', { citedName: DIFF_NAME })], THESIS.id, [])).decided).toBe(false);
  });

  it('an EMPTY list is decided, and says it examined ZERO — never nothing', async () => {
    const p = await predicates('gapList', 'gapsDecided');
    expect(p.gapsDecided(p.gapList([], THESIS.id, []))).toEqual({ decided: true, examined: 0 });
  });
});

// ---------------------------------------------------------------------------
// TRAJECTORY_CURRENT(m) — A3 :1386–:1388 · thesis step 23
// ---------------------------------------------------------------------------

describe("TRAJECTORY_CURRENT(m) — the trajectory service's four states, mapped (thesis step 23)", () => {
  it('PINNED_IS_LATEST and RECOMPUTED_AGREES are current; the other two are STALE_TRAJECTORY', async () => {
    const p = await predicates('trajectoryCurrent');
    const mapped = Object.fromEntries(Object.entries(CURRENCIES).map(([state, c]) => [state, p.trajectoryCurrent(c)]));
    expect(mapped).toEqual({
      PINNED_IS_LATEST: true,
      RECOMPUTED_AGREES: true,
      RECOMPUTED_DISAGREES: false,
      NOT_FOLLOWED_BY_LATEST: false,
    });
  });
});

// ---------------------------------------------------------------------------
// THE_CALL(t) · THE_REQUESTS(t) — A3 :1404–:1406 · thesis step 22
// ---------------------------------------------------------------------------

const CALL_ITEM = { whatIsNeeded: 'פרוטוקול הדיון', whoWouldHaveSeenIt: 'חברי הצוות', unit: 'אגף הרפואה', window: '2022-08' };
const REQUEST = { text: 'בקשה', authority: 'משרד הבריאות', legalBasis: 'חוק חופש המידע', addresses: [], restsOn: [DIFF_NAME] };
const APPEALS = [
  gap(1, 'CALLED', { gapId: '0xcalled', callItem: CALL_ITEM }),
  gap(1, 'REQUESTED', { gapId: '0xrequested', request: REQUEST }),
  gap(1, 'DISMISSED', { gapId: '0xdismissed', reason: 'לא רלוונטי' }),
];

describe('THE_CALL(t) and THE_REQUESTS(t) — the two appeals of a PUBLISHED version (thesis step 22)', () => {
  it('nothing published — no call and no request, whatever the gaps say', async () => {
    const p = await predicates('gapList', 'theCall', 'theRequests');
    const list = p.gapList(APPEALS, THESIS.id, []);
    expect([p.theCall(false, list), p.theRequests(false, list)]).toEqual([[], []]);
  });

  it("published — the call is each CALLED gap's call item, and nothing else", async () => {
    const p = await predicates('gapList', 'theCall');
    expect(p.theCall(true, p.gapList(APPEALS, THESIS.id, []))).toEqual([CALL_ITEM]);
  });

  it("published — the requests are each REQUESTED gap's request, and nothing else", async () => {
    const p = await predicates('gapList', 'theRequests');
    expect(p.theRequests(true, p.gapList(APPEALS, THESIS.id, []))).toEqual([REQUEST]);
  });
});

// ---------------------------------------------------------------------------
// PUBLISHABLE(v) — A3 :1390–:1396 · thesis step 23 · CALLS `publishableEvidence`
//
// The evidence half is `publishableEvidence`'s answer, STUBBED at that symbol so
// each thesis conjunct can be held alone. A `publishableVersion` that re-folded
// the evidence half instead of calling it would ignore the stub, and the cases on
// the evidence half would redden — so the stub doubles as the call proof its
// builder owes. The trajectory conjuncts are held at 7.4, where the gate and
// PUBLISHABLE(v) must agree on every fixture; the version here cites none.
//
// EACH STUB IS A REPORT `publishableEvidence` COULD RETURN (7.2 round 2): the
// mention it examined, its six conjuncts, and a `mentionsExamined` that agrees
// with the list. A report whose count contradicts its own list is a malformed
// row — the rule 7.1's round 2 applied to a hash, applied to a report.
//
// WHAT `failed` NAMES FOR A FAILURE OF THE EVIDENCE HALF IS DECLARED 7.4's, NOT
// ASSERTED HERE (7.2 round 1, L2). It is one of A6's rows 5–10, and 7.4's
// `gate.test.ts` holds those rows as `evidenceChecks`' own output and the gate and
// PUBLISHABLE(v) agreeing on every fixture of this file, this one included.
// Asserting the name here would decide where the conjunct-to-check map lives —
// today it is private to `services/evidenceChecks.ts` — and that is the §2b
// question, the researcher's (sketch §9). This file holds that the version is not
// publishable.
// ---------------------------------------------------------------------------

// THE WORLD THESE CASES STAND ON — the evidence half's stub reports, `seedPublishable`
// and `CONJUNCTS_ALONE` — is `test/thesis/gateWorld.ts`'s, moved there at 7.4 so the
// gate's agreement runs over THESE fixtures, never a copy of them. Its fingerprint is
// now seeded over the world's OWN gap decisions: at 7.2 a DISMISSED gap was
// fingerprinted whatever the case seeded, so "a gap reading OPEN" also left the
// analysis stale — two conjuncts false where the case claims one.

describe('PUBLISHABLE(v) — every conjunct, each held alone (thesis step 23)', () => {
  it('every conjunct true is publishable, and the evidence half is asked for THIS version (L6)', async () => {
    const p = await seedPublishable();
    const half = jest.spyOn(evidencePredicates, 'publishableEvidence').mockResolvedValue(EVIDENCE_PASSES);
    expect(await p.publishableVersion(VERSION.id, PASSING)).toEqual({ publishable: true, failed: [] });
    expect(half).toHaveBeenCalledWith(VERSION.id);
  });

  it('the evidence half NOT publishable — a WITHDRAWN record — makes the version not publishable; what `failed` names is 7.4\'s (L2)', async () => {
    const p = await seedPublishable();
    jest.spyOn(evidencePredicates, 'publishableEvidence').mockResolvedValue(EVIDENCE_FAILS);
    expect((await p.publishableVersion(VERSION.id, PASSING)).publishable).toBe(false);
  });

  it('an evidence half that could NOT be graded is not publishable — and nothing is asserted of HOW it says so (L1)', async () => {
    const p = await seedPublishable();
    jest.spyOn(evidencePredicates, 'publishableEvidence').mockResolvedValue(EVIDENCE_NOT_EVALUABLE);
    expect((await p.publishableVersion(VERSION.id, PASSING)).publishable).toBe(false);
  });

  for (const [what, seed, assessment, check] of CONJUNCTS_ALONE) {
    it(`${what} ALONE makes it not publishable, and the report names ${check}`, async () => {
      const p = await seedPublishable(seed);
      jest.spyOn(evidencePredicates, 'publishableEvidence').mockResolvedValue(EVIDENCE_PASSES);
      const report = await p.publishableVersion(VERSION.id, assessment);
      expect(report.publishable).toBe(false);
      expect(report.failed).toEqual([check]);
    });
  }
});

// ---------------------------------------------------------------------------
// HISTORY(t) — A3 :1407 · thesis step 20 · derived, never logged (§9)
// ---------------------------------------------------------------------------

describe('HISTORY(t) — every row naming the thesis, in time order, attributed (thesis step 20)', () => {
  /**
   * ONE THESIS'S STORY, every row at its own instant (L5) — framed, written, a gap
   * decided, a note, the citation argued, criticised, published, withdrawn: the
   * EIGHT kinds of A3 :1407 and §9 :974–:976 (7.2 round 3, M2). The attempt and
   * the withdrawal are the rows §9 moved out of the retired session's log
   * (:1019–:1021). And ONE ROW OF EVERY KIND OF ANOTHER THESIS, so "none of
   * another thesis" holds per kind rather than for notes alone.
   */
  function seedHistory(): void {
    const other = 'thesis-2';
    const otherVersion = 'version-of-thesis-2';
    store.thesis = THESIS;
    store.theses = [THESIS];
    store.framings = [FRAMING, { ...FRAMING, id: 'framing-of-thesis-2', thesisId: other, createdAt: at(9, 5) }];
    store.framingRounds = [
      ...ROUNDS,
      // framing-of-thesis-2's own round (7.2 round 3, L1): without it a HISTORY that
      // read every round in the table, not only its framings' rounds, would pass.
      {
        id: 'round-of-thesis-2',
        framingId: 'framing-of-thesis-2',
        sequence: 1,
        type: 'PROPOSED',
        content: {},
        researcherId: AUTHOR,
        createdAt: at(9, 5, 30),
      },
    ];
    store.versions = [VERSION, { ...VERSION, id: otherVersion, thesisId: other, createdAt: at(9, 6) }];
    store.gapDecisions = [
      gap(1, 'DISMISSED', { reason: 'לא רלוונטי', createdAt: at(9, 12) }),
      gap(1, 'OPEN', { id: 'gap-of-thesis-2', thesisId: other, createdAt: at(9, 7) }),
    ];
    store.notes = [NOTE, { ...NOTE, id: 'note-of-thesis-2', thesisId: other, createdAt: at(9, 14) }];
    store.debates = [DEBATE, { ...DEBATE, id: 'debate-of-thesis-2', thesisId: other, createdAt: at(9, 8) }];
    store.analyses = [ANALYSIS, { ...ANALYSIS, id: 'analysis-of-thesis-2', versionId: otherVersion, runAt: at(9, 9) }];
    store.attempts = [ATTEMPT, { ...ATTEMPT, id: 'attempt-of-thesis-2', thesisId: other, versionId: otherVersion, createdAt: at(9, 10, 30) }];
    store.withdrawals = [
      WITHDRAWAL,
      { ...WITHDRAWAL, id: 'withdrawal-of-thesis-2', thesisId: other, versionId: otherVersion, createdAt: at(9, 14, 50) },
    ];
  }

  it('lists all EIGHT kinds in createdAt order, none of another thesis, each attributed AS A2 RECORDS IT (M2)', async () => {
    const p = await predicates('history');
    seedHistory();
    const entries = await p.history(THESIS.id);
    expect(entries.map((e) => e.id)).toEqual([
      FRAMING.id,
      'round-1',
      'round-2',
      'round-3',
      VERSION.id,
      'gap-1-DISMISSED',
      NOTE.id,
      DEBATE.id,
      ANALYSIS.id,
      ATTEMPT.id,
      WITHDRAWAL.id,
    ]);
    // An act names the researcher who made it; an ANALYSIS names a model — A2 gives
    // it `model · promptVersion · runAt` and no researcher (:1313–:1318), so none is
    // invented. THE DEBATE IS NOT ASSERTED: evidence A2's DebateSession has no
    // researcher column, and whether HISTORY names the thesis's author for it — its
    // only writer under NOT_AUTHOR — or no one is the researcher's to rule (7.2
    // round 3's report, question 1).
    expect(entries.filter((e) => e.id !== DEBATE.id).map((e) => [e.id, e.researcherId])).toEqual([
      [FRAMING.id, AUTHOR],
      ['round-1', AUTHOR],
      ['round-2', AUTHOR],
      ['round-3', AUTHOR],
      [VERSION.id, AUTHOR],
      ['gap-1-DISMISSED', AUTHOR],
      [NOTE.id, AUTHOR],
      [ANALYSIS.id, null],
      [ATTEMPT.id, AUTHOR],
      [WITHDRAWAL.id, AUTHOR],
    ]);
  });

  it('since a date is what happened after it — the date falls BETWEEN two rows, since A3 :1407 states no boundary (L1)', async () => {
    const p = await predicates('history');
    seedHistory();
    // Half a minute after VERSION (09:11) and before the gap decision (09:12). An
    // instant equal to a row's own createdAt would pin a strict-or-inclusive
    // boundary the appendix never states, and step 20 would inherit it as a rule.
    expect((await p.history(THESIS.id, at(9, 11, 30))).map((e) => e.id)).toEqual([
      'gap-1-DISMISSED',
      NOTE.id,
      DEBATE.id,
      ANALYSIS.id,
      ATTEMPT.id,
      WITHDRAWAL.id,
    ]);
  });

  it('WRITES NOTHING — the history is derived from the acts, never logged beside them', async () => {
    const p = await predicates('history');
    seedHistory();
    await p.history(THESIS.id);
    expect(written).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// REVIEWS(researcher) — A3 :1408–:1410 · thesis step 24 · CALLS evidence's
// `flagged` for the FLAGGED arm and the trajectory service's
// `resolveTrajectoryCitations` for the STALE_TRAJECTORY arm. ARRIVED is document
// step 32's and is not asserted absent (sketch §6-9).
//
// EACH ARM ON THE VERSION A3 NAMES FOR IT (7.2 round 2, M1): FLAGGED on PUBLISHED,
// STALE_TRAJECTORY on PUBLISHED and on HEAD, UNARGUED on HEAD. The cases set the
// thesis's two pointers onto different links of the fixture chain VERSION →
// TRAJECTORY_VERSION → NEXT_VERSION, so a REVIEWS that read one version for both
// fails the case about the other — and a version that is NEITHER is seeded with
// something it would owe if it were read, so reading it is a failure too.
// ---------------------------------------------------------------------------

/**
 * A thesis of AUTHOR's whose HEAD and PUBLISHED pointers name links of the fixture
 * chain, the chain held up to HEAD with each version's own citations — VERSION cites
 * the diff, TRAJECTORY_VERSION the trajectory, NEXT_VERSION nothing — and, when a
 * case names one, the cited diff's evidence row in that standing and the debate the
 * diff citation references — on the mention's relation, and as the debate row a
 * lookup by id or by thesis would read (7.2 round 3, M1).
 */
function seedReviews(over: {
  head: ThesisVersionRow;
  published: ThesisVersionRow | null;
  record?: 'PROMOTED' | 'WITHDRAWN';
  debate?: DebateRef & { id: string };
}): void {
  const chain = [VERSION, TRAJECTORY_VERSION, NEXT_VERSION];
  const versions = chain.slice(0, chain.findIndex((v) => v.id === over.head.id) + 1);
  const thesis = {
    ...THESIS,
    headVersionId: over.head.id,
    publishedVersionId: over.published?.id ?? null,
    publishedAt: over.published === null ? null : at(9, 20),
    publishedById: over.published === null ? null : AUTHOR,
  };
  store.thesis = thesis;
  store.theses = [thesis];
  // No `store.version`: the double reads a version BY ID from `store.versions`
  // once it is held, so the one-row field would be a write nothing reads (L3).
  store.versions = versions;
  const debate = over.debate ?? null;
  store.mentions = [MENTION, TRAJECTORY_MENTION]
    .filter((m) => versions.some((v) => v.id === m.versionId))
    .map((m) => mentionRow(m, m.versionId === over.published?.id, m.id === MENTION.id ? debate : null));
  if (debate !== null) {
    store.debates = [{ ...debate }];
    store.session = { ...debate };
  }
  store.evidenceRows =
    over.record === undefined
      ? []
      : [{ fileHash: DIFF_NAME, kind: 'DIFF', status: over.record, snapshot: null, urlVersionDiff: DIFF_ROW }];
}

/** What the list OWES, as (kind, name) — every entry on the thesis, and each with its ONE command (A4 :1523–:1525). */
const owedOnTheThesis = (entries: readonly ReviewEntry[]): [string, string][] => {
  expect(entries.filter((e) => e.thesisId !== THESIS.id || e.command.length === 0)).toEqual([]);
  return entries.map((e) => [e.kind, e.name]);
};

describe('REVIEWS(researcher) — what an author owes, on their own theses (thesis step 24)', () => {
  it('a researcher with no thesis owes nothing — an empty list is an answer', async () => {
    const p = await predicates('reviews');
    expect(await p.reviews(AUTHOR)).toEqual([]);
  });

  it("ANOTHER researcher's thesis never appears on this one's list", async () => {
    const p = await predicates('reviews');
    store.theses = [{ ...THESIS, createdById: OTHER_RESEARCHER }];
    store.versions = [VERSION];
    store.mentions = [MENTION_ROW];
    expect(await p.reviews(AUTHOR)).toEqual([]);
  });

  it('an unargued citation on HEAD is owed as UNARGUED, with one command', async () => {
    const p = await predicates('reviews');
    store.thesis = THESIS;
    store.theses = [THESIS];
    store.versions = [VERSION];
    store.mentions = [MENTION_ROW];
    const entries = await p.reviews(AUTHOR);
    expect(entries).toHaveLength(1);
    expect(entries.at(0)).toMatchObject({ kind: 'UNARGUED', thesisId: THESIS.id, name: DIFF_NAME });
    expect(entries.at(0)?.command.length ?? 0).toBeGreaterThan(0);
  });

  it("HEAD's citation carrying a debate PROMOTED for this record and this thesis owes nothing — UNARGUED fires on ARGUED (M1)", async () => {
    seedReviews({ head: VERSION, published: null, debate: DEBATE });
    // THE FIXTURE, CHECKED BEFORE THE MODULE IS ASKED FOR: evidence's `argued`
    // says this citation IS argued, so the case is red only for the module.
    expect(evidencePredicates.argued({ name: DIFF_NAME, thesisId: THESIS.id, debate: DEBATE })).toBe(true);
    const p = await predicates('reviews');
    expect(await p.reviews(AUTHOR)).toEqual([]);
  });

  it('the same debate PROMOTED for ANOTHER thesis argues nothing here — HEAD owes UNARGUED (M1)', async () => {
    // A3 :1373–:1374: ARGUED needs the debate's record to be m.name AND its thesis
    // to be v's. A debate that exists is not an argument this thesis made.
    const elsewhere = { ...DEBATE, thesisId: 'thesis-2' };
    seedReviews({ head: VERSION, published: null, debate: elsewhere });
    expect(evidencePredicates.argued({ name: DIFF_NAME, thesisId: THESIS.id, debate: elsewhere })).toBe(false);
    const p = await predicates('reviews');
    expect(owedOnTheThesis(await p.reviews(AUTHOR))).toEqual([['UNARGUED', DIFF_NAME]]);
  });

  it("FLAGGED is decided by `flagged`'s ANSWER — stubbed to flag a citation the world does not, it is owed (L2)", async () => {
    // As PUBLISHABLE(v)'s evidence half and the STALE arm's resolver are stubbed
    // AGAINST their world: the record is PROMOTED and current, so a REVIEWS that
    // re-derived the flag from the row would owe nothing, and only one that asks
    // `flagged` and obeys it owes this entry.
    seedReviews({ head: NEXT_VERSION, published: VERSION, record: 'PROMOTED' });
    expect(await evidencePredicates.flagged(MENTION.id)).toMatchObject({ flagged: false });
    jest.spyOn(evidencePredicates, 'flagged').mockResolvedValue({
      flagged: true,
      armsEvaluated: evidencePredicates.FLAG_ARMS_EVALUATED,
      reasons: ['NOT_CITATION_CURRENT'],
    });
    trajectoriesAre(CURRENCIES.RECOMPUTED_AGREES);
    const p = await predicates('reviews');
    expect(owedOnTheThesis(await p.reviews(AUTHOR))).toEqual([['FLAGGED', DIFF_NAME]]);
  });

  it("a PUBLISHED version citing a WITHDRAWN record owes FLAGGED — asked of evidence's `flagged` — with one command (M1)", async () => {
    // HEAD is NEXT_VERSION, citing nothing; PUBLISHED is VERSION, citing the diff;
    // TRAJECTORY_VERSION between them is NEITHER, and its trajectory is stubbed
    // stale — owed only by a REVIEWS that reads a version A3 does not name.
    seedReviews({ head: NEXT_VERSION, published: VERSION, record: 'WITHDRAWN' });
    // THE FIXTURE, CHECKED BEFORE THE MODULE IS ASKED FOR: the one symbol flags this
    // citation on this double, so the case is red for the module's absence and
    // never for its own world. The spy is set after, so it sees only REVIEWS' asks.
    expect(await evidencePredicates.flagged(MENTION.id)).toMatchObject({ flagged: true, reasons: ['WITHDRAWN'] });
    const flag = jest.spyOn(evidencePredicates, 'flagged');
    trajectoriesAre(CURRENCIES.RECOMPUTED_DISAGREES);
    const p = await predicates('reviews');
    expect(owedOnTheThesis(await p.reviews(AUTHOR))).toEqual([['FLAGGED', DIFF_NAME]]);
    expect(flag).toHaveBeenCalledWith(MENTION.id);
  });

  it('the same PUBLISHED citation of a record still PROMOTED and current owes nothing — the arm fires on the flag (M1)', async () => {
    seedReviews({ head: NEXT_VERSION, published: VERSION, record: 'PROMOTED' });
    expect(await evidencePredicates.flagged(MENTION.id)).toMatchObject({ flagged: false, reasons: [] });
    trajectoriesAre(CURRENCIES.RECOMPUTED_DISAGREES);
    const p = await predicates('reviews');
    expect(await p.reviews(AUTHOR)).toEqual([]);
  });

  it('a PUBLISHED trajectory citation the newest pass DISAGREES with owes STALE_TRAJECTORY (M1)', async () => {
    seedReviews({ head: NEXT_VERSION, published: TRAJECTORY_VERSION });
    const resolve = trajectoriesAre(CURRENCIES.RECOMPUTED_DISAGREES);
    const p = await predicates('reviews');
    expect(owedOnTheThesis(await p.reviews(AUTHOR))).toEqual([['STALE_TRAJECTORY', TRAJECTORY_ID]]);
    expect(resolve).toHaveBeenCalledWith(expect.arrayContaining([TRAJECTORY_ID]));
  });

  it("HEAD's trajectory citation the newest pass DISAGREES with owes STALE_TRAJECTORY too — A3 names both (M1)", async () => {
    // VERSION, HEAD's parent, is NEITHER and cites an unargued diff: owed as
    // UNARGUED only by a REVIEWS that read it as the head.
    seedReviews({ head: TRAJECTORY_VERSION, published: null });
    const resolve = trajectoriesAre(CURRENCIES.RECOMPUTED_DISAGREES);
    const p = await predicates('reviews');
    expect(owedOnTheThesis(await p.reviews(AUTHOR))).toEqual([['STALE_TRAJECTORY', TRAJECTORY_ID]]);
    expect(resolve).toHaveBeenCalledWith(expect.arrayContaining([TRAJECTORY_ID]));
  });

  it('a trajectory the newest pass AGREES with owes nothing — the arm fires on the currency, not on the citation (M1)', async () => {
    seedReviews({ head: TRAJECTORY_VERSION, published: null });
    trajectoriesAre(CURRENCIES.RECOMPUTED_AGREES);
    const p = await predicates('reviews');
    expect(await p.reviews(AUTHOR)).toEqual([]);
  });
});
