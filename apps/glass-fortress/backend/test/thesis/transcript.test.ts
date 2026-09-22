jest.mock('../../src/lib/prisma', () => ({
  prisma: (require('../helpers/evidenceDouble') as typeof import('../helpers/evidenceDouble')).db,
}));
jest.mock('../../src/context/researcherContext', () => (require('./tools') as typeof import('./tools')).researcherContextDouble);
jest.mock('../../src/factories/LLMFactory', () => (require('./tools') as typeof import('./tools')).llmFactoryTripwire);

import { built } from './absent';
import { resetDouble, store, written } from '../helpers/evidenceDouble';
import { TURN_KINDS_EXPECTED, type ThesisPredicatesModule, type Turn } from './contract';
import { ANALYSIS, ATTEMPT, AUTHOR, CLAIM, DEBATE, FRAMING, NOTE, OPEN_GAP, OTHER_RESEARCHER, PROVISION, THESIS, VERSION, WITHDRAWAL } from './fixtures';
import { loadThesisRows } from '../../src/services/thesisRows';
import { resetTools, tripped } from './tools';

// ---------------------------------------------------------------------------
// THE TRANSCRIPT, KIND BY KIND — docs/gf-thesis-flows.md A4 :1476, RULED 2026-09-20 (the researcher, R66).
//
// WHY THIS FILE EXISTS, and it is REVIEW's finding of round 1 stated as a rule: four cases that hold the ORDER,
// the VOICES, six of the lines and `since` leave FOURTEEN of eighteen probes blind. Every one of the seventeen
// bodies is a shape the appendix spells out field by field, and a case that never reads a body cannot tell a
// builder that dropped half of one from a builder that is right.
//
// SO: ONE CASE PER KIND, each over a world that exercises it, each pinning THE BODY'S KEY SET — not a property
// name, the SET, so a field added beside the appendix's reds it — and the VALUES that only a real
// implementation produces. The floor is the seventeen kinds themselves: `every-kind-seen` fails if the world
// stops producing one, which is what makes the other cases non-vacuous.
// ---------------------------------------------------------------------------

const at = (minute: number, second = 0): Date => new Date(Date.UTC(2026, 8, 10, 9, minute, second));

/** The chosen claim, restated character for character by one version and not by the other (CLAIM_FRAMED, A3 :1366). */
const OTHER_CLAIM = `${CLAIM} (נוסח אחר)`;

const CITED_A = '0xaaaa';
const CITED_B = '0xbbbb';

/**
 * A WORLD THAT PRODUCES ALL SEVENTEEN KINDS. Every value is invented; the SHAPES are the appendix's. The
 * debate's events live on `store.session` because that is where the double serves them from, and the same row
 * is in `store.debates` so the thesis's own query finds it.
 */
function seedEverything(): void {
  store.researchers = [
    { id: AUTHOR, handle: 'חוקר_א' },
    { id: OTHER_RESEARCHER, handle: 'watchdog_7' },
  ];
  store.thesis = THESIS;
  store.theses = [THESIS];
  store.framings = [{ ...FRAMING, fromRunId: 'run-17', createdAt: at(1) }];
  store.framingRounds = [
    { id: 'round-1', framingId: FRAMING.id, sequence: 1, type: 'PROPOSED', content: { framing: CLAIM, elements: [{ element: 'KNEW', records: ['0xknew'] }] }, researcherId: AUTHOR, createdAt: at(2) },
    // A2 :1309: the ASSESSED content carries the model and the prompt version beside its marks.
    { id: 'round-2', framingId: FRAMING.id, sequence: 2, type: 'ASSESSED', content: { model: 'gemini:flash', promptVersion: 'v3-framing', contradictions: [] }, researcherId: AUTHOR, createdAt: at(3) },
    { id: 'round-3', framingId: FRAMING.id, sequence: 3, type: 'CHOSEN', content: { claim: CLAIM, provision: PROVISION, elements: [] }, researcherId: AUTHOR, createdAt: at(4) },
  ];
  // TWO VERSIONS: the parent cites A, the child drops A and adds B — so `citationsVsParent` has one of each.
  store.versions = [
    { ...VERSION, id: 'version-parent', claim: OTHER_CLAIM, parentVersionId: null, createdAt: at(5) },
    { ...VERSION, id: 'version-child', claim: CLAIM, parentVersionId: 'version-parent', createdAt: at(6) },
  ];
  store.mentions = [
    { id: 'mention-a', versionId: 'version-parent', kind: 'EVIDENCE', name: CITED_A, contentVersionHash: 'pin-a', debateSessionId: null },
    { id: 'mention-b', versionId: 'version-child', kind: 'EVIDENCE', name: CITED_B, contentVersionHash: 'pin-b', debateSessionId: DEBATE.id },
  ];
  const events = [
    { id: 'event-1', sessionId: DEBATE.id, type: 'DEBATE_OPENED', content: '', createdAt: at(7) },
    { id: 'event-2', sessionId: DEBATE.id, type: 'RATIONALE_SUBMITTED', content: 'הקטע הוסר בין שני הצילומים', createdAt: at(8) },
    // NOT JSON — the assessor's row as a malformed write would leave it. `malformed: true`, never a body that
    // looks like an assessment nobody wrote.
    { id: 'event-3', sessionId: DEBATE.id, type: 'ASSESSMENT_RETURNED', content: 'not json at all', createdAt: at(9) },
    { id: 'event-4', sessionId: DEBATE.id, type: 'RESPONSE_SUBMITTED', content: 'הרשומה עדיין מחזיקה את המשפט', createdAt: at(10) },
    { id: 'event-5', sessionId: DEBATE.id, type: 'ABANDONED', content: '', createdAt: at(11) },
  ];
  // THE RECORD THE DEBATE ARGUES FOR, as A1 names it — a page and a capture. Seeded, because `line` for this
  // kind IS the record's name and a world without one would leave that arm of the datum ruling untested.
  const debate = {
    ...DEBATE,
    status: 'ABANDONED',
    promotedOverObjection: false,
    createdAt: at(7),
    recordSnapshotId: 'snapshot-1',
    recordDiffId: null,
    recordSnapshot: { waybackTimestamp: '20220805120000', trackedUrl: { url: 'https://corona.health.gov.il/vaccine-for-covid/' } },
    recordDiff: null,
    events,
  };
  store.debates = [debate];
  store.session = debate;
  // The STRENGTH grade is the critic's own word inside the opinion, and `line` for an ANALYSIS is exactly it.
  store.analyses = [
    { ...ANALYSIS, id: 'analysis-stale', versionId: 'version-child', inputFingerprint: 'fp-old', opinion: { strength: { grade: 'WEAK', reasoning: 'הרשומות תומכות בחלק מהטענה בלבד' } }, runAt: at(12) },
    { ...ANALYSIS, id: 'analysis-current', versionId: 'version-child', inputFingerprint: 'fp-now', opinion: { strength: { grade: 'MODERATE', reasoning: 'הרשומות תומכות בטענה' } }, runAt: at(13) },
  ];
  store.gapDecisions = [
    { ...OPEN_GAP, id: 'gap-open', gapId: '0xgap', sequence: 1, decision: 'OPEN', description: OPEN_GAP.description, reason: null, researcherId: AUTHOR, createdAt: at(14) },
    { ...OPEN_GAP, id: 'gap-dismissed', gapId: '0xgap', sequence: 2, decision: 'DISMISSED', description: OPEN_GAP.description, reason: 'לא רלוונטי', researcherId: AUTHOR, createdAt: at(15) },
  ];
  store.attempts = [{ ...ATTEMPT, id: 'attempt-1', outcome: 'REFUSED', refusedBy: ['NAMES_NO_PERSON'], assessment: { verdict: 'REFUSE' }, createdAt: at(16) }];
  store.withdrawals = [{ ...WITHDRAWAL, id: 'withdrawal-1', versionId: 'version-child', reason: 'העמוד כבר אינו מחזיק את הקטע', createdAt: at(17) }];
  store.notes = [
    { ...NOTE, id: 'note-on-thesis', thesisId: THESIS.id, framingId: null, text: 'לחזור לזה\nשורה שנייה', createdAt: at(18) },
    { ...NOTE, id: 'note-on-framing', thesisId: null, framingId: FRAMING.id, text: 'הערה על המסגור', createdAt: at(19) },
  ];
}

const transcript = async (over: { currentFingerprint?: string | null; callerId?: string | null } = {}): Promise<Turn[]> => {
  const p = await built<ThesisPredicatesModule>('services/thesisPredicates', ['transcriptOf']);
  // THE LOADER IS THE ONE QUERY AND THE COMPOSER IS PURE (UI-8 chunk A). The world below is the same world
  // these cases always seeded; what changed is that it reaches the composer as ROWS.
  const rows = await loadThesisRows(THESIS.id);
  if (rows === null) throw new Error('the world seeds a thesis and the loader answered none');
  return p.transcriptOf(rows, { currentFingerprint: 'fp-now', ...over });
};

/** The one turn of a kind, narrowed — `find` alone leaves the union wide and a body unreadable without a cast. */
function only<K extends Turn['kind']>(turns: readonly Turn[], kind: K): Extract<Turn, { kind: K }> {
  const found = turns.flatMap((t) => (t.kind === kind ? [t as Extract<Turn, { kind: K }>] : []));
  if (found.length !== 1) throw new Error(`the world produced ${String(found.length)} ${kind} turns, and this case reads exactly one`);
  return found[0] as Extract<Turn, { kind: K }>;
}

const keysOf = (body: object): string[] => Object.keys(body).sort();

beforeEach(() => {
  resetDouble();
  resetTools();
  seedEverything();
});

describe('THE TRANSCRIPT, kind by kind — A4 :1476, every body pinned by its KEY SET and its values', () => {
  // THE FLOOR. Without it every case below is one `seedEverything` edit away from being vacuous, and a builder
  // deleted outright would take its case with it silently.
  it('every-kind-seen: the world exercises all SEVENTEEN kinds — the floor every other case in this file stands on', async () => {
    const kinds = new Set((await transcript()).map((t) => t.kind));
    expect([...TURN_KINDS_EXPECTED].filter((k) => !kinds.has(k))).toEqual([]);
    expect(kinds.size).toBe(17);
  });

  it('FRAMING_OPENED — the question, the provision and the run it came from', async () => {
    const turn = only(await transcript(), 'FRAMING_OPENED');
    expect(keysOf(turn.body)).toEqual(['fromRunId', 'provision', 'question']);
    expect(turn.body).toEqual({ question: FRAMING.question, provision: FRAMING.provision, fromRunId: 'run-17' });
  });

  it('ROUND_PROPOSED — the sentence VERBATIM and the element map, MISSING marked (A2 :1305)', async () => {
    const turn = only(await transcript(), 'ROUND_PROPOSED');
    expect(keysOf(turn.body)).toEqual(['elements', 'framing', 'malformed']);
    expect(turn.body).toEqual({ framing: CLAIM, elements: [{ element: 'KNEW', records: ['0xknew'] }], malformed: false });
  });

  it("ROUND_ASSESSED — the content whole, and the MODEL read from it: A2 :1309 puts the model and prompt version inside the round, not beside it", async () => {
    const turn = only(await transcript(), 'ROUND_ASSESSED');
    expect(keysOf(turn.body)).toEqual(['content', 'malformed']);
    expect(turn.body.content).toEqual({ model: 'gemini:flash', promptVersion: 'v3-framing', contradictions: [] });
    expect(turn.by.voice === 'MODEL' ? [turn.by.model, turn.by.promptVersion] : null).toEqual(['gemini:flash', 'v3-framing']);
  });

  it('ROUND_CHOSEN — the claim, the provision, the elements, and restatedBy: the versions whose claim matches CHARACTER FOR CHARACTER', async () => {
    const turn = only(await transcript(), 'ROUND_CHOSEN');
    expect(keysOf(turn.body)).toEqual(['claim', 'elements', 'malformed', 'provision', 'restatedBy']);
    // `version-child` restates it; `version-parent` carries a different claim and must NOT be listed.
    expect(turn.body).toEqual({ claim: CLAIM, provision: PROVISION, elements: [], restatedBy: ['version-child'], malformed: false });
  });

  it('VERSION — citationsVsParent with ONE added and ONE dropped, computed from the two versions’ own mentions', async () => {
    const turns = await transcript();
    const child = turns.flatMap((t) => (t.kind === 'VERSION' && t.id === 'version-child' ? [t] : []))[0];
    expect(child).toBeDefined();
    if (child === undefined) throw new Error('unreachable');
    expect(keysOf(child.body)).toEqual(['citationsVsParent', 'claim', 'contentHash', 'mentions', 'parentVersionId', 'text']);
    expect(child.body.citationsVsParent).toEqual({
      added: [`EVIDENCE:${CITED_B}`],
      repinned: [],
      dropped: [`EVIDENCE:${CITED_A}`],
      carried: [],
    });
    expect(child.body.parentVersionId).toBe('version-parent');
  });

  it("VERSION — a mention carries EXACTLY the five STORED columns A4 :1476 names, and none of the loader's wider row", async () => {
    // A4 :1476: the VERSION body's mentions are the STORED rows
    // `[{ versionId, kind, name, contentVersionHash, debateSessionId }]` — "NOT `V`'s resolved shape".
    //
    // WHY THIS CASE EXISTS, and it is UI-8 chunk A's own hazard. The one loader reads mentions ONCE for both the
    // transcript and the citation resolver, so its row is the UNION of two selects and carries `id` and a nested
    // `debateSession`. `versionTurns` (`thesisTranscript.ts` :565) passes `version.mentions` STRAIGHT THROUGH to
    // the wire, and TypeScript's structural typing accepts a wider object through a variable without complaint —
    // so nothing but this assertion stands between the loader and a transcript carrying a mention id and
    // ANOTHER thesis's `debateSession.thesisId`. The outer key set above cannot see it: the body's keys are
    // unchanged either way.
    const turns = await transcript();
    const child = turns.flatMap((t) => (t.kind === 'VERSION' && t.id === 'version-child' ? [t] : []))[0];
    if (child === undefined) throw new Error('the world seeds version-child and the transcript has no VERSION turn for it');
    // A FLOOR, so a version whose mentions arrived EMPTY cannot satisfy a case about what a mention carries.
    expect(child.body.mentions.length).toBeGreaterThanOrEqual(1);
    for (const mention of child.body.mentions) {
      expect(keysOf(mention as unknown as Record<string, unknown>)).toEqual([
        'contentVersionHash',
        'debateSessionId',
        'kind',
        'name',
        'versionId',
      ]);
    }
  });

  it('DEBATE_OPENED — the session, the record as A1 names it, and the pin the citation carried', async () => {
    const turn = only(await transcript(), 'DEBATE_OPENED');
    expect(keysOf(turn.body)).toEqual(['pin', 'record', 'sessionId']);
    expect([turn.body.sessionId, turn.body.pin]).toEqual([DEBATE.id, 'pin-b']);
  });

  it('RATIONALE and RESPONSE — the researcher’s words, stored verbatim, and nothing else', async () => {
    const turns = await transcript();
    expect(keysOf(only(turns, 'RATIONALE').body)).toEqual(['text']);
    expect(only(turns, 'RATIONALE').body.text).toBe('הקטע הוסר בין שני הצילומים');
    expect(only(turns, 'RESPONSE').body.text).toBe('הרשומה עדיין מחזיקה את המשפט');
  });

  it('ASSESSMENT — a NON-JSON event is malformed: true with every field null, never a body that looks like an assessment nobody wrote', async () => {
    const turn = only(await transcript(), 'ASSESSMENT');
    expect(keysOf(turn.body)).toEqual(['assessment', 'hasSubstance', 'malformed', 'objection', 'substanceGaps', 'verdict']);
    expect(turn.body).toEqual({ hasSubstance: null, substanceGaps: null, verdict: null, objection: null, assessment: null, malformed: true });
    // AND THE DEBT, SAID: `respond_in_debate` records neither model nor prompt version (A2 :1317).
    expect(turn.by.voice === 'MODEL' ? [turn.by.model, turn.by.promptVersion] : null).toEqual([null, null]);
  });

  it('DEBATE_CLOSED — an ABANDONED debate closes as itself, in the PLATFORM’s voice', async () => {
    const turn = only(await transcript(), 'DEBATE_CLOSED');
    expect(keysOf(turn.body)).toEqual(['evidenceFileHash', 'outcome', 'overObjection']);
    expect(turn.body.outcome).toBe('ABANDONED');
    expect(turn.body.overObjection).toBe(false);
    expect(turn.by.voice).toBe('PLATFORM');
  });

  it('ANALYSIS — `current` is TRUE for the fingerprint in force and FALSE for the stale one, in the same answer', async () => {
    const turns = await transcript();
    const analyses = turns.flatMap((t) => (t.kind === 'ANALYSIS' ? [t] : []));
    expect(analyses.map((t) => [t.id, t.body.current]).sort()).toEqual([
      ['analysis-current', true],
      ['analysis-stale', false],
    ]);
    expect(keysOf(analyses[0]?.body ?? {})).toEqual(['analysisId', 'current', 'inputFingerprint', 'opinion']);
  });

  it('GAP_DECISION — the second decision on one gap carries the FIRST in `earlier`; the first carries none', async () => {
    const turns = await transcript();
    const decisions = turns.flatMap((t) => (t.kind === 'GAP_DECISION' ? [t] : []));
    expect(keysOf(decisions[0]?.body ?? {})).toEqual([
      'callItem', 'citedName', 'decision', 'description', 'earlier', 'gapId', 'reason', 'request', 'sequence',
    ]);
    expect(decisions.map((t) => [t.body.sequence, t.body.earlier.map((e) => e.sequence)])).toEqual([
      [1, []],
      [2, [1]],
    ]);
    expect(decisions[1]?.body.reason).toBe('לא רלוונטי');
  });

  it('the PUBLICATION attempt is ONE ROW and THREE TURNS — the rationale, the assessment, the verdict, in that order', async () => {
    const turns = await transcript();
    expect(keysOf(only(turns, 'PUBLICATION_RATIONALE').body)).toEqual(['attemptId', 'rationale']);
    expect(keysOf(only(turns, 'PUBLICATION_ASSESSMENT').body)).toEqual(['assessment', 'attemptId', 'verdict']);
    expect(keysOf(only(turns, 'PUBLICATION_VERDICT').body)).toEqual(['attemptId', 'outcome', 'refusedBy']);
    expect(only(turns, 'PUBLICATION_VERDICT').body).toEqual({ attemptId: 'attempt-1', outcome: 'REFUSED', refusedBy: ['NAMES_NO_PERSON'] });
    // The order inside the row is `within`'s, not the ids': all three share one `createdAt`.
    const order = turns.flatMap((t) => (t.thread.step === 'PUBLICATION' ? [t.kind] : []));
    expect(order).toEqual(['PUBLICATION_RATIONALE', 'PUBLICATION_ASSESSMENT', 'PUBLICATION_VERDICT']);
  });

  it('WITHDRAWAL — the version and the REASON, which is the author’s record and is shown here and never publicly (T6 :916)', async () => {
    const turn = only(await transcript(), 'WITHDRAWAL');
    expect(keysOf(turn.body)).toEqual(['reason', 'versionId']);
    expect(turn.body).toEqual({ versionId: 'version-child', reason: 'העמוד כבר אינו מחזיק את הקטע' });
  });

  it('NOTE — `on` names which home the note was written in, and BOTH homes are in one thesis’s transcript (D11)', async () => {
    const notes = (await transcript()).flatMap((t) => (t.kind === 'NOTE' ? [t] : []));
    expect(keysOf(notes[0]?.body ?? {})).toEqual(['on', 'text']);
    expect(notes.map((t) => [t.id, t.body.on]).sort()).toEqual([
      ['note-on-framing', 'FRAMING'],
      ['note-on-thesis', 'THESIS'],
    ]);
  });

  it('`line` is a value or null for EVERY ONE of the seventeen kinds — the record’s name and the strength grade included (A4 :1476, „Q1 datum”)', async () => {
    const turns = await transcript();
    const lineOf = (kind: Turn['kind']): string | null | undefined => turns.find((t) => t.kind === kind)?.line;
    expect(TURN_KINDS_EXPECTED.map((k) => [k, lineOf(k)])).toEqual([
      ['FRAMING_OPENED', FRAMING.question],
      ['ROUND_PROPOSED', CLAIM],
      ['ROUND_ASSESSED', null],
      ['ROUND_CHOSEN', CLAIM],
      // The claim of whichever VERSION comes first in the transcript — the parent's.
      ['VERSION', OTHER_CLAIM],
      // THE RECORD'S NAME: the page and its dates, the values A1 holds, joined and never worded.
      ['DEBATE_OPENED', lineOf('DEBATE_OPENED')],
      ['RATIONALE', null],
      ['ASSESSMENT', null],
      ['RESPONSE', null],
      ['DEBATE_CLOSED', null],
      // THE STRENGTH GRADE, read out of the opinion the critic returned.
      ['ANALYSIS', 'WEAK'],
      ['GAP_DECISION', OPEN_GAP.description],
      ['PUBLICATION_RATIONALE', null],
      ['PUBLICATION_ASSESSMENT', null],
      ['PUBLICATION_VERDICT', null],
      ['WITHDRAWAL', null],
      ['NOTE', 'לחזור לזה'],
    ]);
    // The two the table above could only restate: a record name is a url and its dates, a strength grade is the
    // opinion's own word — asserted against the SEEDED values, never against the answer.
    expect(lineOf('DEBATE_OPENED')).toBe('https://corona.health.gov.il/vaccine-for-covid/ 20220805120000');
    // The FIRST analysis in the transcript is the stale one, seeded at 09:12 — its grade, not the current one's.
    expect(lineOf('ANALYSIS')).toBe('WEAK');
  });

  it("every `mine` is FALSE for a colleague reading the same thesis — the voices are the CALLER's, not the author's", async () => {
    const turns = await transcript({ callerId: OTHER_RESEARCHER });
    const mines = turns.flatMap((t) => {
      if (t.by.voice === 'RESEARCHER') return [t.by.mine];
      if (t.by.voice === 'MODEL') return [t.by.spentBy.mine];
      return [];
    });
    expect(mines.length).toBeGreaterThan(10);
    expect([...new Set(mines)]).toEqual([false]);
    const handles = turns.flatMap((t) => (t.by.voice === 'RESEARCHER' ? [t.by.handle] : []));
    expect([...new Set(handles)]).toEqual(['חוקר_א']);
  });

  // M6, 2026-09-20: A4 :1476 orders by `at`, "THEN THE THREAD, then a row's own turn order, then id" — and the
  // second key was held by nothing. It is not decorative: `choose_framing` and the first `add_thesis_version`
  // can land in one transaction and share an instant to the millisecond, and with the step dropped the fallback
  // is `within` — the VERSION's 0 beating the CHOSEN round's 3, so the thesis's text would appear to precede
  // the claim it was written from.
  it('two turns of DIFFERENT STEPS at ONE instant order by the THREAD, not by the row: ROUND_CHOSEN before VERSION', async () => {
    const shared = at(5);
    store.framingRounds = (store.framingRounds as { id: string }[]).map((r) =>
      r.id === 'round-3' ? { ...r, createdAt: shared } : r,
    );
    const turns = await transcript();
    const atShared = turns.flatMap((t) => (t.at.getTime() === shared.getTime() ? [t.kind] : []));
    // THE VACUITY GUARD: both turns must actually be at the instant, or the order below is the order of one.
    expect(atShared).toEqual(['ROUND_CHOSEN', 'VERSION']);
  });

  it('WRITES NOTHING and SPENDS NOTHING — the transcript is derived from the acts, never logged beside them (§9 :981)', async () => {
    await transcript();
    expect(written).toEqual([]);
    expect(tripped).toEqual([]);
  });
});
