import { built } from './built';
import type { ArrivalDecisionRow, ArrivalRow } from './contract';
import { intakeArrival, researcherArrival } from './fixtures';

// ---------------------------------------------------------------------------
// §5 :606-:615, A2 :1278-:1294, A3 :1375-:1376 — THE ARRIVAL.
//
// THIS ROUND BUILDS THE RESEARCHER'S DOOR ONLY. The INTAKE arrivals below are RED and
// stay red: `get_arrivals`, `dismiss_arrival` and ARRIVED are step 32's, and the suite
// names them because plan :113-:121 writes step 27 to the WHOLE contract. No sealed code
// path is built to make any of them green.
//
// WHAT BINDS THIS ROUND is the CHECK shape: `researcherId` REQUIRED iff RESEARCHER,
// `thesisId` and `termsHash` REQUIRED iff INTAKE (A2 :1280-:1284) — and the reason the
// intake arm has no researcher is that the door CANNOT SAY WHO (§5 :532).
// ---------------------------------------------------------------------------

interface Arrivals {
  answered: (arrival: ArrivalRow, citedCommitments: readonly string[], documents: readonly string[]) => boolean;
  arrived: (
    arrivals: readonly ArrivalRow[],
    decisions: readonly ArrivalDecisionRow[],
    cited: readonly string[],
    documentsOf: (arrivalId: string) => readonly string[],
  ) => readonly ArrivalRow[];
}

const arrivals = (only: readonly string[]) => built<Arrivals>('services/documentPredicates', only);

describe('A2 :1280-:1284 — the Arrival CHECKs, which are invariants and not conventions', () => {
  it('a RESEARCHER arrival carries researcherId and NEITHER thesisId NOR termsHash', () => {
    const arrival = researcherArrival();
    expect(arrival.researcherId).not.toBeNull();
    expect(arrival.thesisId).toBeNull();
    expect(arrival.termsHash).toBeNull();
  });

  it('an INTAKE arrival carries thesisId and termsHash and NO researcherId — the door cannot say who (§5 :532)', () => {
    const arrival = intakeArrival();
    expect(arrival.thesisId).not.toBeNull();
    expect(arrival.termsHash).not.toBeNull();
    expect(arrival.researcherId).toBeNull();
  });

  it('NO COLUMN for an address, an account, a name or a contact — held by `no-sender-identity` (A7 :1567-:1569)', () => {
    const forbidden = ['address', 'ip', 'account', 'name', 'contact', 'email'];
    for (const arrival of [researcherArrival(), intakeArrival()]) {
      const keys = Object.keys(arrival).map((k) => k.toLowerCase());
      // THE FLOOR: the row has keys at all, so an empty object cannot pass this.
      expect(keys.length).toBeGreaterThan(4);
      for (const banned of forbidden) expect(keys).not.toContain(banned);
    }
  });
});

describe('A3 :1375 — ANSWERED(a), derived from the mentions and NEVER stored', () => {
  it('true when ANY document of the arrival is cited by HEAD or PUBLISHED', async () => {
    const { answered } = await arrivals(['answered']);
    expect(answered(intakeArrival(), ['0xc1'], ['0xc1', '0xc2'])).toBe(true);
  });

  it('false when none of its documents is cited — an arrival nobody used is not answered', async () => {
    const { answered } = await arrivals(['answered']);
    expect(answered(intakeArrival(), ['0xzz'], ['0xc1', '0xc2'])).toBe(false);
  });

  it('an arrival with NO documents is not answered — and the floor is that it examined the list', async () => {
    const { answered } = await arrivals(['answered']);
    expect(answered(intakeArrival(), ['0xc1'], [])).toBe(false);
  });
});

describe('A3 :1376 — ARRIVED(t): INTAKE arrivals with no decision and NOT answered — step 32’s, red here', () => {
  it('lists an intake arrival that is neither dismissed nor answered', async () => {
    const { arrived } = await arrivals(['arrived']);
    const arrival = intakeArrival();
    expect(arrived([arrival], [], [], () => ['0xc1'])).toEqual([arrival]);
  });

  it('EXCLUDES a RESEARCHER arrival — ARRIVED is the public door’s list and a researcher’s is not one', async () => {
    const { arrived } = await arrivals(['arrived']);
    expect(arrived([researcherArrival()], [], [], () => ['0xc1'])).toEqual([]);
  });

  it('EXCLUDES one a decision dismissed, and one whose document is cited (§5 :606-:610)', async () => {
    const { arrived } = await arrivals(['arrived']);
    const arrival = intakeArrival();
    const decision: ArrivalDecisionRow = {
      id: 'ad_1',
      arrivalId: arrival.id,
      sequence: 1,
      decision: 'DISMISSED',
      reason: 'not about this thesis',
      researcherId: 'res_1',
      createdAt: new Date('2026-09-21T00:00:00.000Z'),
    };
    expect(arrived([arrival], [decision], [], () => ['0xc1'])).toEqual([]);
    expect(arrived([arrival], [], ['0xc1'], () => ['0xc1'])).toEqual([]);
  });
});
