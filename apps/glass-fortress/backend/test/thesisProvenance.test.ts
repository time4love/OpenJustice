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

interface ProjectedRound {
  sequence: number;
  type: string;
  content: Record<string, unknown> | null;
  malformed: boolean;
  researcherId: string;
}

beforeEach(() => {
  resetDouble();
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
    const rounds = (await read())['rounds'] as ProjectedRound[];
    expect(rounds.map((r) => [r.sequence, r.type])).toEqual([
      [1, 'PROPOSED'],
      [2, 'ASSESSED'],
      [3, 'CHOSEN'],
    ]);
  });

  it('2 · the verdicts come back as STRUCTURE, never as a JSON string the caller must parse', async () => {
    seed();
    const rounds = (await read())['rounds'] as ProjectedRound[];
    const assessed = rounds.find((r) => r.type === 'ASSESSED');
    const contradictions = assessed?.content?.['contradictions'] as { quoteVerified: unknown; phraseVerified: unknown }[];
    expect(typeof assessed?.content).toBe('object');
    expect(contradictions.map((c) => [c.quoteVerified, c.phraseVerified])).toEqual([[false, 'ABSENT']]);
  });

  // ABSENT IS A FACT; MALFORMED IS A DEFECT; AND BETWEEN THEM IS NOTHING THE
  // DESIGN NAMES. A malformed round returned as `{}` would read as an assessment
  // that found no contradictions — the strongest possible false negative from the
  // one register the researcher is told to defer to.
  it('3 · a malformed stored content is reported AS MALFORMED, never as absent or empty', async () => {
    seed({ rounds: [round(1, 'PROPOSED', 'not an object at all')] });
    const rounds = (await read())['rounds'] as ProjectedRound[];
    expect(rounds.map((r) => [r.malformed, r.content])).toEqual([[true, null]]);
  });

  it('4 · a well-formed round is NOT flagged malformed, and an EMPTY object is well-formed', async () => {
    seed({ rounds: [round(1, 'PROPOSED', {}), round(2, 'ASSESSED', ASSESSED_CONTENT)] });
    const rounds = (await read())['rounds'] as ProjectedRound[];
    expect(rounds.map((r) => r.malformed)).toEqual([false, false]);
    expect(rounds.at(0)?.content).toEqual({});
  });

  it('5 · the thesis it attaches to — the id when attached, null when the framing stands alone (A2 :1297)', async () => {
    seed();
    expect((await read())['thesisId']).toBe('thesis-1');
    seed({ thesisId: null });
    expect((await read())['thesisId']).toBeNull();
  });

  it('6 · every round is ATTRIBUTED to the researcher who wrote it, and the read writes nothing', async () => {
    seed();
    const answer = await read();
    const rounds = answer['rounds'] as ProjectedRound[];
    expect(rounds.map((r) => r.researcherId)).toEqual([AUTHOR, AUTHOR, OTHER]);
    expect(answer['researcherId']).toBe(AUTHOR);
    expect(written).toEqual([]);
  });
});
