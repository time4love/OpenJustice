import { CalibrationDecisionType } from '@prisma/client';
import {
  deriveEras,
  eraForDate,
  CONFIRM_AFTER_CLEAN,
  type FoldableDecision,
  type DatedEra,
} from '../src/lib/calibrationFold';

const D = (type: CalibrationDecisionType, selectors: string[] = [], snapshotId: string | null = null): FoldableDecision =>
  ({ type, selectors, snapshotId });

const OPENED = D(CalibrationDecisionType.RUN_OPENED);
// EVERY DECISION CARRIES THE FULL SELECTOR SET, as the schema requires: "the
// selectors in force AFTER this decision, stored in full rather than as a delta".
// A fixture that left them empty on anything but a correction would not look like
// the rows this fold actually reads.
const SHOWN = (id: string, selectors: string[] = []) =>
  D(CalibrationDecisionType.CAPTURE_SHOWN, selectors, id);
const ACCEPTED = (id: string, selectors: string[] = []) =>
  D(CalibrationDecisionType.CAPTURE_ACCEPTED, selectors, id);
const CORRECTED = (selectors: string[], id: string) =>
  D(CalibrationDecisionType.RULESET_CORRECTED, selectors, id);
const BOUNDARY = (selectors: string[], id: string) =>
  D(CalibrationDecisionType.ERA_BOUNDARY, selectors, id);

describe('deriveEras — an era is a fold over the log, never a row', () => {
  it('a run with no boundary is one era, and it names no start', () => {
    // The first era extends BACKWARDS: there was no redesign before the earliest
    // capture, so the era covering it has no start to name.
    const eras = deriveEras([OPENED, SHOWN('a'), CORRECTED(['.ad'], 'a'), ACCEPTED('a', ['.ad'])]);
    expect(eras).toHaveLength(1);
    expect(eras[0]?.startsAtSnapshotId).toBeNull();
    expect(eras[0]?.selectors).toEqual(['.ad']);
  });

  // THE BOUNDARY OPENS THE ERA IT NAMES, rather than closing the one before. The
  // researcher answers "redesign" while looking at a capture, and the answer is
  // about THAT capture — it is the first one the old rules do not describe.
  it('a boundary starts a new era at the capture it names', () => {
    const eras = deriveEras([
      OPENED,
      SHOWN('a'),
      CORRECTED(['.ad'], 'a'),
      ACCEPTED('a', ['.ad']),
      BOUNDARY(['.ad'], 'b'),
      CORRECTED(['.ad', '.share'], 'b'),
      ACCEPTED('b', ['.ad', '.share']),
    ]);
    expect(eras).toHaveLength(2);
    expect(eras[0]?.startsAtSnapshotId).toBeNull();
    expect(eras[0]?.selectors).toEqual(['.ad']);
    expect(eras[1]?.startsAtSnapshotId).toBe('b');
    expect(eras[1]?.selectors).toEqual(['.ad', '.share']);
  });

  // THE PROPERTY THE UNION COULD NOT HAVE. A streak is evidence that ONE ruleset
  // generalises, so it cannot run across a redesign — the captures on either side
  // are described by different rules and say nothing about each other.
  it('does not carry a streak across a boundary', () => {
    const clean = [SHOWN('a'), ACCEPTED('a'), SHOWN('b'), ACCEPTED('b'), SHOWN('c'), ACCEPTED('c')];
    const eras = deriveEras([OPENED, CORRECTED(['.ad'], 'a'), ...clean, BOUNDARY(['.ad'], 'd'), SHOWN('d'), ACCEPTED('d')]);
    expect(eras[0]?.trailingClean).toBe(3);
    expect(eras[0]?.confirmed).toBe(true);
    // One clean capture in era 2 — the three before it belong to another ruleset.
    expect(eras[1]?.trailingClean).toBe(1);
    expect(eras[1]?.confirmed).toBe(false);
  });

  it('a correction inside an era resets that era’s streak and no other', () => {
    const eras = deriveEras([
      OPENED,
      SHOWN('a'), ACCEPTED('a'),
      SHOWN('b'), ACCEPTED('b'),
      SHOWN('c'), ACCEPTED('c'),
      BOUNDARY([], 'd'),
      SHOWN('d'), CORRECTED(['.x'], 'd'), ACCEPTED('d'),
    ]);
    expect(eras[0]?.trailingClean).toBe(CONFIRM_AFTER_CLEAN);
    // The capture needed a correction, so it is judged and DIRTY: it is evidence
    // the rules were wrong here, not evidence they hold.
    expect(eras[1]?.trailingClean).toBe(0);
  });

  it('confirms exactly at the streak, not before', () => {
    const run = (n: number) =>
      deriveEras([OPENED, ...Array.from({ length: n }, (_, i) => [SHOWN(`s${String(i)}`), ACCEPTED(`s${String(i)}`)]).flat()]);
    expect(run(CONFIRM_AFTER_CLEAN - 1)[0]?.confirmed).toBe(false);
    expect(run(CONFIRM_AFTER_CLEAN)[0]?.confirmed).toBe(true);
  });
});

describe('eraForDate — selection is a date range, and nothing else', () => {
  const eras: DatedEra[] = [
    { index: 0, startsAtSnapshotId: null, startDate: null, selectors: ['.a'], trailingClean: 3, confirmed: true },
    { index: 1, startsAtSnapshotId: 'b', startDate: '2022-05-23', selectors: ['.b'], trailingClean: 3, confirmed: true },
    { index: 2, startsAtSnapshotId: 'c', startDate: '2025-03-26', selectors: ['.c'], trailingClean: 0, confirmed: false },
  ];

  it('picks the latest era that had started by that date', () => {
    expect(eraForDate(eras, '2023-01-01')?.index).toBe(1);
    expect(eraForDate(eras, '2026-01-01')?.index).toBe(2);
  });

  it('the first era extends backwards, so no capture is uncovered', () => {
    expect(eraForDate(eras, '2010-01-01')?.index).toBe(0);
  });

  it('an era covers its own start date', () => {
    // The boundary capture is the FIRST capture of the new era, not the last of
    // the old one — so the era must claim the date it starts on.
    expect(eraForDate(eras, '2022-05-23')?.index).toBe(1);
  });

  it('the day before a boundary belongs to the previous era', () => {
    expect(eraForDate(eras, '2022-05-22')?.index).toBe(0);
  });
});
