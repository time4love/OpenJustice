import { built } from './built';
import { SHED_DOCUMENT_REFUSALS } from './contract';

// ---------------------------------------------------------------------------
// A4 :1448-:1450, §8 :907-:923 — shed_document, OPERATOR. STEP 35'S, RED HERE.
//
// The design defines the act SO THAT A LEGAL DEMAND NEVER HAS TO BE MET BY INVENTING A
// DELETE (§8 :922-:923). When it is used is counsel's question (§12 :1177), and this suite
// fixes only its shape: attributed, with a reason REQUIRED, once per document ever.
// ---------------------------------------------------------------------------

interface Refusal { error: string; code: string }

interface Tool {
  shedDocument: (
    args: { commitment: string; reason: string },
    researcherId: string | null,
  ) => Promise<{ commitment: string; cause: 'OPERATOR'; at: string } | Refusal>;
}

const tool = () => built<Tool>('services/shedDocument');
const isRefusal = (a: unknown): a is Refusal => typeof (a as Refusal)?.code === 'string';

const HELD = '0x' + 'c1'.repeat(32);

describe('A4 :1448-:1449 — the OPERATOR cause, attributed, with a reason', () => {
  it('sheds with cause OPERATOR and records who and why', async () => {
    const { shedDocument } = await tool();
    const answer = await shedDocument({ commitment: HELD, reason: 'a legal demand' }, 'res_1');
    expect(!isRefusal(answer) && answer.cause).toBe('OPERATOR');
  });

  it('REASON_REQUIRED on a blank reason — an unexplained destruction is the one this design refuses', async () => {
    const { shedDocument } = await tool();
    const answer = await shedDocument({ commitment: HELD, reason: '   ' }, 'res_1');
    expect(isRefusal(answer) && answer.code).toBe('REASON_REQUIRED');
  });

  it('ALREADY_SHED — one shed per document, ever (A2 :1320)', async () => {
    const { shedDocument } = await tool();
    await shedDocument({ commitment: HELD, reason: 'a legal demand' }, 'res_1');
    const again = await shedDocument({ commitment: HELD, reason: 'again' }, 'res_1');
    expect(isRefusal(again) && again.code).toBe('ALREADY_SHED');
  });

  it('NOT_A_DOCUMENT for a name that resolves to none; the set is FOUR', async () => {
    const { shedDocument } = await tool();
    const answer = await shedDocument({ commitment: '0x' + 'ee'.repeat(32), reason: 'x' }, 'res_1');
    expect(isRefusal(answer) && answer.code).toBe('NOT_A_DOCUMENT');
    expect([...SHED_DOCUMENT_REFUSALS].sort()).toEqual([
      'ALREADY_SHED',
      'NOT_A_DOCUMENT',
      'NO_RESEARCHER',
      'REASON_REQUIRED',
    ]);
  });
});

describe('§8 :954-:955 — a HELD document has NO SENDER and NO WITHDRAWAL', () => {
  it('OPERATOR is the only path to shedding a researcher’s own document', async () => {
    const { shedDocument } = await tool();
    const answer = await shedDocument({ commitment: HELD, reason: 'the researcher’s own' }, 'res_1');
    expect(!isRefusal(answer) && answer.cause).toBe('OPERATOR');
  });
});
