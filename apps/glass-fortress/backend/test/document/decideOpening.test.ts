import { built } from './built';
import { DECIDE_OPENING_REFUSALS, type Opening } from './contract';

// ---------------------------------------------------------------------------
// A4 :1443-:1446, §7 :797-:809 — decide_opening. STEP 34'S.
//
// OPENING ONLY WIDENS: a decision narrower than OPENED(d) is refused CANNOT_NARROW, and a
// later version that drops the citation changes nothing — what the public has read, it has
// read (§7 :797-:801). The one act that REMOVES public content is not the platform's and
// is §8's: a sender withdrawing what they gave.
//
// IT IS IN FORCE FROM THE NEXT `publish_thesis`, never from the decision itself (A4 :1444).
// ---------------------------------------------------------------------------

interface Refusal { error: string; code: string }

interface Tool {
  decideOpening: (
    args: { thesisId: string; commitment: string; opening: Opening; expectedSequence: number },
    researcherId: string | null,
  ) => Promise<{ opening: Opening; sequence: number; inForceFrom: 'publish_thesis' } | Refusal>;
}

const tool = () => built<Tool>('services/decideOpening');
const isRefusal = (a: unknown): a is Refusal => typeof (a as Refusal)?.code === 'string';

const CITED = '0x' + 'c1'.repeat(32);
const SEALED = '0x' + 'c2'.repeat(32);

describe('A4 :1443-:1444 — decide_opening appends a decision, in force from the next publication', () => {
  it('records the opening and says it takes effect at publish_thesis, not now', async () => {
    const { decideOpening } = await tool();
    const answer = await decideOpening({ thesisId: 'th_1', commitment: CITED, opening: 'CONTENT', expectedSequence: 0 }, 'res_1');
    expect(!isRefusal(answer) && answer.inForceFrom).toBe('publish_thesis');
  });
});

describe('A4 :1445-:1446 — the refusals, closed', () => {
  it('NOT_CITED when the head does not mention it — an opening decides nothing about an uncited document', async () => {
    const { decideOpening } = await tool();
    const answer = await decideOpening({ thesisId: 'th_1', commitment: '0x' + 'ee'.repeat(32), opening: 'PASSAGE', expectedSequence: 0 }, 'res_1');
    expect(isRefusal(answer) && answer.code).toBe('NOT_CITED');
  });

  it('NOT_HELD for BYTES on a SEALED document — which has no bytes anywhere (§7 :787)', async () => {
    const { decideOpening } = await tool();
    const answer = await decideOpening({ thesisId: 'th_1', commitment: SEALED, opening: 'BYTES', expectedSequence: 0 }, 'res_1');
    expect(isRefusal(answer) && answer.code).toBe('NOT_HELD');
  });

  it('CANNOT_NARROW below OPENED(d) — PASSAGE after CONTENT is refused (§7 :797)', async () => {
    const { decideOpening } = await tool();
    await decideOpening({ thesisId: 'th_1', commitment: CITED, opening: 'CONTENT', expectedSequence: 0 }, 'res_1');
    const answer = await decideOpening({ thesisId: 'th_1', commitment: CITED, opening: 'PASSAGE', expectedSequence: 1 }, 'res_1');
    expect(isRefusal(answer) && answer.code).toBe('CANNOT_NARROW');
  });

  it('WIDENING IS ALLOWED — CONTENT after PASSAGE, and BYTES after CONTENT on a held document', async () => {
    const { decideOpening } = await tool();
    await decideOpening({ thesisId: 'th_1', commitment: CITED, opening: 'PASSAGE', expectedSequence: 0 }, 'res_1');
    const wider = await decideOpening({ thesisId: 'th_1', commitment: CITED, opening: 'BYTES', expectedSequence: 1 }, 'res_1');
    expect(isRefusal(wider)).toBe(false);
  });

  it('NOT_AUTHOR, NO_RESEARCHER and STALE_SEQUENCE are in the set, and the set is SIX', () => {
    expect([...DECIDE_OPENING_REFUSALS].sort()).toEqual([
      'CANNOT_NARROW',
      'NOT_AUTHOR',
      'NOT_CITED',
      'NOT_HELD',
      'NO_RESEARCHER',
      'STALE_SEQUENCE',
    ]);
  });
});
