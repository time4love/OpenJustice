jest.mock('../src/lib/prisma', () => ({
  prisma: (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).db,
}));

import { getFramingHandler } from '../src/mcp/tools/getFraming';
import { resetDouble, store, written } from './helpers/evidenceDouble';

// ---------------------------------------------------------------------------
// THE FRAMING'S PROVENANCE, READ BACK — thesis step 19.
//
// PLAN §5's `thesisProvenance` ROW, REWRITTEN: "step 19/23: framing rounds and
// publication attempts are their own rows, read by `get_framing` and the
// history." STEP 19 WRITES THE FRAMING HALF; step 23 extends this file with
// `PublicationAttempt`. The predecessor went with the code it tested at evidence
// step 11a, so this is the successor on clean ground (refactor plan §4 rule 3 as
// amended :521–:525).
//
// WHAT MIGRATED AS AN ASSERTION about the new contract (refactor plan §4,
// "migrating assertions, not files"): the assessment comes back PARSED rather
// than as a JSON string; a malformed one is reported AS MALFORMED, never as
// absent or empty; and every actor is named.
//
// WHAT WENT: the old file's `actors` group — "a session with no researcher is
// unknown, never a blank name". `FramingRound.researcherId` is REQUIRED (schema
// :754), so there is no nameless round left to render.
//
// IN THE UNIT PROJECT, which is the only run that gates (step 18's record §7).
// ---------------------------------------------------------------------------

const FRAMING_ID = 'framing-1';
const AUTHOR = 'researcher-author';
const OTHER = 'researcher-other';

const at = (minute: number): Date => new Date(Date.UTC(2026, 8, 12, 9, minute));

const round = (sequence: number, type: string, content: unknown, researcherId = AUTHOR) => ({
  id: `round-${String(sequence)}`,
  framingId: FRAMING_ID,
  sequence,
  type,
  content,
  researcherId,
  createdAt: at(sequence),
});

const ASSESSED_CONTENT = {
  contradictions: [
    { researcherClaim: 'טענת החוקר', quoteVerified: false, whatEvidenceShows: 'מה שהראיה מראה', record: '[1]', phraseVerified: 'ABSENT', phraseVerifiedReason: null },
  ],
  elements: [{ element: 'DUTY_HOLDER', filled: false, records: [] }],
  candidateFramings: [],
  unverifiedAssumptions: [],
  recommendedFraming: 'מסגור מומלץ',
  reasoning: 'הנמקה',
  model: 'gemini:flash',
  promptVersion: 'v1-provision-elements-verbatim-claim',
};

function seed(over: { thesisId?: string | null; rounds?: unknown[] } = {}): void {
  store.framings = [
    {
      id: FRAMING_ID,
      question: 'האם הציבור קיבל את המידע בזמן אמת?',
      provision: 'NUREMBERG_1',
      researcherId: AUTHOR,
      thesisId: over.thesisId === undefined ? 'thesis-1' : over.thesisId,
      fromRunId: null,
      clusterIndex: null,
      createdAt: at(0),
    },
  ];
  store.framingRounds = (over.rounds ?? [
    round(1, 'PROPOSED', { framing: 'המסגור המוצע', elements: [] }),
    round(2, 'ASSESSED', ASSESSED_CONTENT),
    round(3, 'CHOSEN', { claim: 'הטענה', provision: 'NUREMBERG_1', elements: [] }, OTHER),
  ]) as typeof store.framingRounds;
}

const read = async (): Promise<Record<string, unknown>> =>
  JSON.parse(await getFramingHandler({ framingId: FRAMING_ID })) as Record<string, unknown>;

/**
 * A TURN of the framing thread — A4 :1459 as RULED 2026-09-20 (the researcher, R66). `rounds` and
 * `researcherId` are RETIRED with the builder (as `get_debate`'s `events` were, evidence :1123), so these six
 * cases read the same facts off the TURNS that carry them: refactor plan §4 rule 1, a case asserting a retired
 * concept is rewritten in the commit that retires it. Not one of the six properties below changed meaning —
 * the sequence order, the parsed structure, malformed, the attachment and the attribution are all still here.
 */
interface FramingTurn {
  kind: string;
  id: string;
  by: { voice: string; handle?: string; mine?: boolean };
  body: Record<string, unknown>;
}

const turnsOfAnswer = (answer: Record<string, unknown>): FramingTurn[] => answer['turns'] as FramingTurn[];
/** The ROUND turns alone — the thread's opening is the framing's own row, not a round. */
const roundTurns = (answer: Record<string, unknown>): FramingTurn[] =>
  turnsOfAnswer(answer).filter((t) => t.kind !== 'FRAMING_OPENED');

beforeEach(() => {
  resetDouble();
  // THE HANDLES: a turn names a researcher by handle, and `handleOf` throws on an id with no row.
  store.researchers = [
    { id: AUTHOR, handle: 'חוקר_א' },
    { id: OTHER, handle: 'watchdog_7' },
  ];
});

describe('get_framing — the framing and every round, read back (A4 :1458–:1459)', () => {
  it('1 · every round comes back in SEQUENCE order, whatever order the rows are held in', async () => {
    // Deliberately stored newest-first: `sequence` is what orders a framing, never
    // `createdAt` (rows written in one transaction share now(), interaction A3 :927)
    // and never the store's own order.
    seed({
      rounds: [
        round(3, 'CHOSEN', { claim: 'הטענה', provision: 'NUREMBERG_1', elements: [] }),
        round(1, 'PROPOSED', { framing: 'המסגור המוצע', elements: [] }),
        round(2, 'ASSESSED', ASSESSED_CONTENT),
      ],
    });
    expect(roundTurns(await read()).map((t) => t.kind)).toEqual(['ROUND_PROPOSED', 'ROUND_ASSESSED', 'ROUND_CHOSEN']);
  });

  it('2 · the verdicts come back as STRUCTURE, never as a JSON string the caller must parse', async () => {
    seed();
    const assessed = roundTurns(await read()).find((t) => t.kind === 'ROUND_ASSESSED');
    const content = assessed?.body['content'] as Record<string, unknown>;
    const contradictions = content['contradictions'] as { quoteVerified: unknown; phraseVerified: unknown }[];
    expect(typeof content).toBe('object');
    expect(contradictions.map((c) => [c.quoteVerified, c.phraseVerified])).toEqual([[false, 'ABSENT']]);
  });

  // ABSENT IS A FACT; MALFORMED IS A DEFECT; AND BETWEEN THEM IS NOTHING THE
  // DESIGN NAMES. A malformed round returned as `{}` would read as an assessment
  // that found no contradictions — the strongest possible false negative from the
  // one register the researcher is told to defer to.
  it('3 · a malformed stored content is reported AS MALFORMED, never as absent or empty', async () => {
    seed({ rounds: [round(1, 'PROPOSED', 'not an object at all')] });
    // A PROPOSED turn's body is the FIELDS A2 :1305 names, and with nothing to read they are null beside the
    // flag — never an empty object, which would read as a framing that proposed nothing.
    expect(roundTurns(await read()).map((t) => [t.body['malformed'], t.body['framing'], t.body['elements']])).toEqual([
      [true, null, null],
    ]);
  });

  it('4 · a well-formed round is NOT flagged malformed, and an EMPTY object is well-formed', async () => {
    seed({ rounds: [round(1, 'PROPOSED', {}), round(2, 'ASSESSED', ASSESSED_CONTENT)] });
    const turns = roundTurns(await read());
    expect(turns.map((t) => t.body['malformed'])).toEqual([false, false]);
    // An EMPTY object is well-formed: its fields read null because it holds none, and `malformed` stays false.
    expect([turns.at(0)?.body['framing'], turns.at(0)?.body['elements']]).toEqual([null, null]);
    expect(turns.at(1)?.body['content']).toEqual(ASSESSED_CONTENT);
  });

  it('5 · the thesis it attaches to — the id when attached, null when the framing stands alone (A2 :1297)', async () => {
    seed();
    expect((await read())['thesisId']).toBe('thesis-1');
    seed({ thesisId: null });
    expect((await read())['thesisId']).toBeNull();
  });

  it('6 · every turn is ATTRIBUTED — by HANDLE, never by an id — and the read writes nothing', async () => {
    seed();
    const answer = await read();
    expect(roundTurns(answer).map((t) => (t.by.voice === 'MODEL' ? 'MODEL' : t.by.handle))).toEqual([
      'חוקר_א',
      // The ASSESSED round is the MODEL's voice, and its model is read from the content (A2 :1309).
      'MODEL',
      'watchdog_7',
    ]);
    expect(answer['by']).toEqual({ handle: 'חוקר_א', mine: false });
    expect(JSON.stringify(answer)).not.toContain(AUTHOR);
    expect(written).toEqual([]);
  });
});
