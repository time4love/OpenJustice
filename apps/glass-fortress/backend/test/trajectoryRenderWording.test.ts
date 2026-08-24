import { readFileSync } from 'fs';
import { join } from 'path';
import { TRAJECTORY_EXTRACTION_CAVEAT } from '../src/services/trajectoryCitation';

// ---------------------------------------------------------------------------
// What a rendered trajectory citation is allowed to claim
// (docs/gf-trajectory-citation-dev-plan.md §3.3 — the one sentence of that plan
// that had to survive review).
//
// A trajectory is computed over UrlSnapshot.fullText, a Readability extraction
// that discards part of every page — 31% of one measured capture. So a change
// inside a discarded region is invisible, and because Readability's boundaries
// follow page structure, a flip can be a LAYOUT change rather than an edit.
// A citation therefore states what the EXTRACTION contained and links the
// capture, and never states what the page contained. Getting this wrong would
// give an extraction artifact the authority of a forensic finding, on the one
// layer the platform presents as requiring no trust.
//
// This suite reaches into the frontend's message catalogues on purpose: that is
// where the human-facing wording actually lives, the frontend has no test
// runner of its own, and the spec names this as the thing a future edit is most
// likely to "improve" into a stronger, false claim. If the catalogues move, this
// fails loudly — which is the correct outcome, not a nuisance.
// ---------------------------------------------------------------------------

const MESSAGES_DIR = join(__dirname, '..', '..', 'frontend', 'messages');

function trajectoryMessages(locale: 'he' | 'en'): Record<string, string> {
  const raw = readFileSync(join(MESSAGES_DIR, `${locale}.json`), 'utf8');
  const parsed = JSON.parse(raw) as { theses: Record<string, string> };
  return Object.fromEntries(
    Object.entries(parsed.theses).filter(([key]) => key.startsWith('trajectory') || key === 'trajectoriesTitle'),
  );
}

/**
 * Phrasings that assert PAGE content. Each is a claim the archive cannot
 * support, because presence was only ever measured in the extraction.
 */
const FORBIDDEN_EN = [
  'the page contained',
  'the page said',
  'was on the page',
  'removed from the page',
  'added to the page',
  'disappeared from the page',
];
const FORBIDDEN_HE = ['הופיעה בעמוד', 'נעדרה מהעמוד', 'הוסרה מהעמוד', 'נמחקה מהעמוד', 'נוספה לעמוד'];

describe('the rendered wording never asserts what the page contained', () => {
  it('English', () => {
    const messages = trajectoryMessages('en');
    expect(Object.keys(messages).length).toBeGreaterThan(0);
    for (const [key, value] of Object.entries(messages)) {
      for (const phrase of FORBIDDEN_EN) {
        expect(`${key}: ${value.toLowerCase()}`).not.toContain(phrase);
      }
    }
  });

  it('Hebrew', () => {
    const messages = trajectoryMessages('he');
    expect(Object.keys(messages).length).toBeGreaterThan(0);
    for (const [key, value] of Object.entries(messages)) {
      for (const phrase of FORBIDDEN_HE) {
        expect(`${key}: ${value}`).not.toContain(phrase);
      }
    }
  });

  it('says instead what presence WAS measured in — the extraction', () => {
    expect(trajectoryMessages('en').trajectoryAppeared.toLowerCase()).toContain('extraction');
    expect(trajectoryMessages('he').trajectoryAppeared).toContain('חילוץ');
  });

  it('states the limitation and points the reader at the capture, in both locales', () => {
    const en = trajectoryMessages('en').trajectoryCaveat.toLowerCase();
    expect(en).toContain('extraction');
    expect(en).toContain('capture');

    const he = trajectoryMessages('he').trajectoryCaveat;
    expect(he).toContain('חילוץ');
    expect(he).toContain('העתק');
  });

  it('keeps the machine-readable caveat and the rendered one making the same claim', () => {
    // The MCP layer hands agents TRAJECTORY_EXTRACTION_CAVEAT; the UI hands
    // people the catalogue string. Two audiences, one limitation.
    const caveat = TRAJECTORY_EXTRACTION_CAVEAT.toLowerCase();
    for (const phrase of FORBIDDEN_EN) expect(caveat).not.toContain(phrase);
    expect(caveat).toContain('extraction');
  });

  it('has every trajectory string in both catalogues — a missing key renders as a raw key', () => {
    expect(Object.keys(trajectoryMessages('he')).sort()).toEqual(Object.keys(trajectoryMessages('en')).sort());
  });
});
