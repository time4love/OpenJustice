// ---------------------------------------------------------------------------
// Level 5 labels — the SurvivalVerdict enum <-> the frontend message catalogues.
//
// Every diff card renders its verdict through `buildSurvivalLabels`, which asks
// for eleven keys under `forensics`. A key missing from a catalogue renders as
// the raw key — so the chip on a refuted diff would read
// "survivalContradicted", and the reader would learn nothing.
//
// Same boundary, same reasoning as provenanceLabelParity and reportLabelParity:
// no compiler crosses from a TSX call to a JSON catalogue, and the frontend has
// no test runner of its own, so this lives here.
//
// It also pins the DISPLAY states to the Prisma enum. `SurvivalDisplayState` is
// the enum's three members plus UNCHECKED and STALE — the two states in which
// there is no current answer — and it is hand-written in two places (backend
// view helper, frontend component). A verdict added to the enum and forgotten in
// either is a state that renders as nothing at all.
// ---------------------------------------------------------------------------

import { SurvivalVerdict } from '@prisma/client';
import en from '../../frontend/messages/en.json';
import he from '../../frontend/messages/he.json';
import type { SurvivalDisplayState } from '../src/services/auditDiffSurvival';

const CATALOGS: [locale: string, messages: typeof en | typeof he][] = [
  ['en', en],
  ['he', he],
];

/** The keys `buildSurvivalLabels` looks up. Kept in one list so both arms agree. */
const CHIP_KEYS = [
  'survivalUnchecked',
  'survivalStale',
  'survivalSurvives',
  'survivalContradicted',
  'survivalUncheckable',
];

const NOTE_KEYS = [
  'survivalUncheckedNote',
  'survivalStaleNote',
  'survivalContradictedNote',
  'survivalUncheckableNote',
];

const ALL_KEYS = [...CHIP_KEYS, ...NOTE_KEYS, 'survivalNotPromotable'];

describe('Level 5 labels exist in both catalogues', () => {
  it.each(CATALOGS)('%s defines every key the chip asks for', (_locale, messages) => {
    const forensics = messages.forensics as unknown as Record<string, unknown>;

    for (const key of ALL_KEYS) {
      expect(typeof forensics[key]).toBe('string');
      expect((forensics[key] as string).trim().length).toBeGreaterThan(0);
    }
  });

  it.each(CATALOGS)('%s says something different for each state', (_locale, messages) => {
    const forensics = messages.forensics as unknown as Record<string, string>;
    const chips = CHIP_KEYS.map((k) => forensics[k]);

    // Two states sharing a label is the failure this level exists to prevent,
    // wearing different words: an unchecked diff must not read like a passing
    // one, and a copy-paste that gave them the same string would do exactly that.
    expect(new Set(chips).size).toBe(CHIP_KEYS.length);
  });

  it.each(CATALOGS)('%s never labels UNCHECKED with the passing word', (_locale, messages) => {
    const forensics = messages.forensics as unknown as Record<string, string>;

    expect(forensics['survivalUnchecked']).not.toBe(forensics['survivalSurvives']);
    // The note has to say it in words too, because the chip is a label and
    // people act on the sentence. Both catalogues assert the same fact about
    // their own language rather than a shared English phrase.
    expect(forensics['survivalUncheckedNote'].length).toBeGreaterThan(40);
  });
});

describe('the display states cover the stored enum', () => {
  it('every SurvivalVerdict is a display state, and has a chip key', () => {
    // Compile-time: a new enum member that is not a display state fails to
    // assign here, before it can reach a card as a blank chip.
    const asDisplay: Record<SurvivalVerdict, SurvivalDisplayState> = {
      SURVIVES: 'SURVIVES',
      CONTRADICTED: 'CONTRADICTED',
      UNCHECKABLE: 'UNCHECKABLE',
    };

    for (const verdict of Object.values(SurvivalVerdict)) {
      expect(asDisplay[verdict]).toBe(verdict);
      // ...and a label to render it with.
      const key = `survival${verdict.charAt(0)}${verdict.slice(1).toLowerCase()}`;
      expect(CHIP_KEYS).toContain(key);
    }
  });

  it('adds exactly two states the enum does not have, and they are the absent ones', () => {
    // UNCHECKED and STALE are not verdicts — they are the states in which there
    // is no current verdict. They exist in the display layer precisely so those
    // cannot be rendered as one.
    const display: SurvivalDisplayState[] = [
      'UNCHECKED',
      'STALE',
      'SURVIVES',
      'CONTRADICTED',
      'UNCHECKABLE',
    ];
    const stored = Object.values(SurvivalVerdict) as string[];
    expect(display.filter((s) => !stored.includes(s)).sort()).toEqual(['STALE', 'UNCHECKED']);
    expect(display.length).toBe(CHIP_KEYS.length);
  });
});
