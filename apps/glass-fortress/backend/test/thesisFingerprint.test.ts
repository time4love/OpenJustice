jest.mock('../src/lib/prisma', () => ({
  prisma: (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).db,
}));

import { decisionsAtPublication, fingerprint, gapList, theCall, type FingerprintInput } from '../src/services/thesisPredicates';
import { DIFF_NAME } from './helpers/corpusFixture';
import { OPEN_GAP, THESIS, VERSION } from './thesis/fixtures';
import { diffRecord, gap } from './thesis/gateWorld';

// ---------------------------------------------------------------------------
// FINGERPRINT'S LAYOUT AND THE CALL'S FILTER — what `test/thesis/derivations.test.ts` cannot see.
// docs/gf-thesis-flows.md A3 :1376–:1378, :1404–:1406 as amended 2026-09-14; the R48 sketch §c1, §e, §6-R26.
//
// IN THE UNIT PROJECT, which gates. Each case holds a property the acceptance cases are satisfiable without:
//
//   the trajectory ids SORTED   the acceptance case changes the SET of ids, never only their order
//   the section COUNTS          no acceptance input moves a value from one section to another
//   the publication filter      every acceptance decision sits on the published VERSION, so no filter passes too
//   the chain's hole            the acceptance worlds hold every version they name
//   a malformed appeal          the CHECK makes a CALLED row with no call item impossible; the predicate says so
// ---------------------------------------------------------------------------

const input = (over: Partial<FingerprintInput> = {}): FingerprintInput => ({
  contentHash: VERSION.contentHash,
  evidence: [],
  trajectoryIds: [],
  gaps: [],
  promptVersion: 'critic-v1',
  ...over,
});

const defined = (over: Partial<FingerprintInput>): string => {
  const f = fingerprint(input(over));
  if (!f.defined) throw new Error(`undefined over the case's input: ${f.name}`);
  return f.fingerprint;
};

describe('FINGERPRINT — the layout stated in thesisPredicates.ts', () => {
  it('does NOT move with the ORDER trajectory ids are given in — they are sorted by the layout, not by the caller', () => {
    expect(defined({ trajectoryIds: ['clx9trajectory00000000002', 'clx9trajectory00000000001'] })).toBe(
      defined({ trajectoryIds: ['clx9trajectory00000000001', 'clx9trajectory00000000002'] }),
    );
  });

  it('a value moved from one SECTION to another moves it — the counts, not the formats, separate the sections (R26)', () => {
    // A cited capture whose CURRENT hash is H, and no trajectory — against no capture and a trajectory whose id is H.
    // Joined without the counts both are `contentHash ‖ H ‖ promptVersion`.
    const H = 'clx9trajectory00000000001';
    const asRecord = defined({ evidence: [{ name: DIFF_NAME, record: { kind: 'CAPTURE', capture: { textHash: H, textExtractionVersion: 'v3' } } }] });
    const asTrajectory = defined({ trajectoryIds: [H] });
    expect(asRecord).not.toBe(asTrajectory);
  });

  it('is `0x` and 64 lowercase hex, and every record defined gives a defined fingerprint', () => {
    expect(defined({ evidence: [{ name: DIFF_NAME, record: diffRecord() }] })).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe('THE_CALL — the decisions decided at or before the publication (the researcher, 2026-09-14)', () => {
  const V1 = { id: 'version-1', parentVersionId: null };
  const V2 = { id: 'version-2', parentVersionId: 'version-1' };
  const V3 = { id: 'version-3', parentVersionId: 'version-2' };
  const CALL_ITEM = { whatIsNeeded: 'פרוטוקול', whoWouldHaveSeenIt: 'חברי הצוות', unit: 'אגף', window: '2022-08' };

  it("keeps the published version's decisions and its ANCESTORS', and drops one decided on a LATER version", () => {
    const decided = [
      gap(1, 'OPEN', { id: 'on-v1', versionId: V1.id }),
      gap(2, 'CALLED', { id: 'on-v2', versionId: V2.id, callItem: CALL_ITEM }),
      gap(3, 'DISMISSED', { id: 'on-v3', versionId: V3.id, reason: 'לא רלוונטי' }),
    ];
    expect(decisionsAtPublication(decided, [V1, V2, V3], V2.id).map((d) => d.id)).toEqual(['on-v1', 'on-v2']);
    // And so the call a later DISMISSAL would have removed is still the published version's call.
    const list = gapList(decisionsAtPublication(decided, [V1, V2, V3], V2.id), THESIS.id, []);
    expect(theCall(true, list)).toEqual([CALL_ITEM]);
  });

  it('a chain with a HOLE throws — an ancestor silently skipped would drop its decisions', () => {
    expect(() => decisionsAtPublication([{ ...OPEN_GAP }], [V2, V3], V3.id)).toThrow('version-1');
  });

  it('a CALLED decision with no call item THROWS — malformed under the CHECK, never an empty appeal', () => {
    const list = gapList([gap(1, 'CALLED', { callItem: null })], THESIS.id, []);
    expect(() => theCall(true, list)).toThrow('callItem');
  });
});
