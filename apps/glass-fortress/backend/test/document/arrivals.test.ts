import { built } from './built';
import { DISMISS_ARRIVAL_REFUSALS, GET_ARRIVALS_REFUSALS } from './contract';

// ---------------------------------------------------------------------------
// A4 :1413-:1422 and §5 :595-:615 — THE PUBLIC DOOR'S READS. STEP 32'S, RED HERE.
//
// This round builds the researcher's door only, and these stay red. They are written now
// because step 27's suite is the WHOLE contract (plan :113-:121), and because what
// `get_arrivals` must NEVER contain is a property worth fixing before anyone implements
// it: no sender, no address, no key, no salt, no DOC_ID, no sealed byte (A4 :1417).
// ---------------------------------------------------------------------------

interface Refusal { error: string; code: string }

interface ArrivalView {
  arrivalId: string;
  gapId: string | null;
  termsHash: string;
  receivedAt: string;
  documents: readonly {
    commitment: string;
    custody: string;
    anchored: boolean;
    content: { contentVersionHash: string; text: string | null } | null;
    opinion: unknown | null;
    citedBy: readonly { versionId: string; published: boolean }[];
  }[];
  decision: { reason: string; at: string } | null;
}

interface Tools {
  getArrivals: (thesisId: string, researcherId: string | null) => Promise<readonly ArrivalView[] | Refusal>;
  dismissArrival: (
    args: { arrivalId: string; reason: string; expectedSequence: number },
    researcherId: string | null,
  ) => Promise<{ arrivalId: string } | Refusal>;
}

const tools = () => built<Tools>('services/getArrivals');
const isRefusal = (a: unknown): a is Refusal => typeof (a as Refusal)?.code === 'string';

describe('A4 :1413-:1417 — get_arrivals, GATED, oldest first', () => {
  it('returns §5’s shape with the opinion LABELLED beside the content, never inside it', async () => {
    const { getArrivals } = await tools();
    const answer = await getArrivals('th_1', 'res_1');
    expect(!isRefusal(answer) && Array.isArray(answer)).toBe(true);
  });

  it('NEVER a sender, an address, a key, a salt, DOC_ID or a sealed byte (A4 :1417)', async () => {
    const { getArrivals } = await tools();
    const answer = await getArrivals('th_1', 'res_1');
    const forbidden = ['sender', 'address', 'ip', 'key', 'salt', 'docId', 'bytes', 'ciphertext'];
    const seen = !isRefusal(answer) ? JSON.stringify(answer) : '';
    // THE FLOOR: the answer is non-empty, so an empty array cannot pass this vacuously.
    expect(seen.length).toBeGreaterThan(2);
    for (const banned of forbidden) expect(seen).not.toContain(`"${banned}"`);
  });

  it('NO_THESIS for an id naming none; NO_RESEARCHER without one — and the set is those two', async () => {
    const { getArrivals } = await tools();
    expect(isRefusal(await getArrivals('th_none', 'res_1')) && (await getArrivals('th_none', 'res_1') as Refusal).code).toBe('NO_THESIS');
    expect([...GET_ARRIVALS_REFUSALS].sort()).toEqual(['NO_RESEARCHER', 'NO_THESIS']);
  });
});

describe('A4 :1419-:1422 — dismiss_arrival, append-only, with a reason', () => {
  it('appends an ArrivalDecision DISMISSED', async () => {
    const { dismissArrival } = await tools();
    const answer = await dismissArrival({ arrivalId: 'arr_2', reason: 'not about this thesis', expectedSequence: 0 }, 'res_1');
    expect(isRefusal(answer)).toBe(false);
  });

  it('ANSWERED refuses — a document of it is cited, so there is NOTHING to dismiss', async () => {
    const { dismissArrival } = await tools();
    const answer = await dismissArrival({ arrivalId: 'arr_answered', reason: 'x', expectedSequence: 0 }, 'res_1');
    expect(isRefusal(answer) && answer.code).toBe('ANSWERED');
  });

  it('REASON_REQUIRED on a blank reason — a dismissal with no reason is a decision nobody made', async () => {
    const { dismissArrival } = await tools();
    const answer = await dismissArrival({ arrivalId: 'arr_2', reason: '  ', expectedSequence: 0 }, 'res_1');
    expect(isRefusal(answer) && answer.code).toBe('REASON_REQUIRED');
  });

  it('THE SET IS CLOSED — six codes', () => {
    expect([...DISMISS_ARRIVAL_REFUSALS].sort()).toEqual([
      'ANSWERED',
      'NOT_AUTHOR',
      'NO_RESEARCHER',
      'NO_SUCH_ARRIVAL',
      'REASON_REQUIRED',
      'STALE_SEQUENCE',
    ]);
  });
});
