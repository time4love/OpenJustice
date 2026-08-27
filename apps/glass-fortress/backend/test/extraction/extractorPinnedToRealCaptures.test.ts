import * as fs from 'fs';
import * as path from 'path';
import {
  extractArticleText,
  extractRawText,
  normaliseForPresence,
} from '../../src/lib/archiveText';

// ---------------------------------------------------------------------------
// Phase 0 of docs/gf-integrity-at-write-time-dev-plan.md — pin the instrument.
//
// Every verification this platform performs rests on extractRawText being right.
// Nothing validated the validator: if it regresses, every check silently starts
// agreeing with whatever it is checking, and the failure looks like success.
//
// So this file pins the extractor to four REAL captures, chosen because each one
// carries a fact that a live investigation on 2026-08-26 turned on:
//
//   2022-07-24  the FDA safety line is on the page
//   2022-08-05  it is STILL on the page — and absent from the extraction
//   2022-09-06  it is still on the page
//
// That continuity is the whole finding. The trajectory layer reported the line
// as removed on 08-05 and restored on 09-06, because trajectories are computed
// over the extraction; staging's PUBLISHED thesis asserts it was ADDED on 09-06.
// It was never added and never removed. If the extractor ever changes such that
// this stops being demonstrable, that false claim silently becomes unfalsifiable
// again — hence a test rather than a document.
//
// The absent-phrase block pins the second fabrication: a CONFIRMED, anchored
// evidence summary describes the 09-06 page as limiting side effects to
// "קלים וחולפים בלבד". None of those words is on the page, in either reading.
//
// Fixtures are verbatim `id_` captures frozen to disk — no network, and `id_`
// means the Archive injects no toolbar. To refresh one, re-fetch that exact URL.
// Never hand-edit them: their entire value is that they are not constructed.
// ---------------------------------------------------------------------------

const CAPTURES = {
  '2022-07-24': '20220724130104',
  '2022-08-05': '20220805053301',
  '2022-09-06': '20220906232435',
} as const;

const PAGE = 'https://corona.health.gov.il/vaccine-for-covid/';

/** The blanket safety assertion. Present in the raw page on every capture below. */
const FDA_LINE = 'נמצאו יעילים ובטוחים לשימוש';

/**
 * The page's actual wording about side effects: it states when they APPEAR.
 * It says nothing about how long they last — the distinction two separate model
 * outputs erased, and the one the thesis turns on.
 */
const ONSET_SENTENCE =
  'תופעות הלוואי השכיחות של חיסון נגד קורונה מופיעות לרוב יום או יומיים אחרי קבלת החיסון';

/** Attributed to the 2022-09-06 page by an anchored evidence summary. On no reading of it. */
const NEVER_ON_THE_PAGE = ['חולפים', 'חולפות', 'בלבד'];

function readingsOf(date: keyof typeof CAPTURES): { raw: string; extracted: string } {
  const timestamp = CAPTURES[date];
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'fixtures', `wayback-vaccine-${timestamp}-raw.html`),
    'utf-8',
  );
  return {
    raw: normaliseForPresence(extractRawText(html)),
    extracted: normaliseForPresence(
      extractArticleText(html, `http://web.archive.org/web/${timestamp}id_/${PAGE}`),
    ),
  };
}

describe('the extractor, pinned to real captures', () => {
  describe('neither reading is empty — asserted first, deliberately', () => {
    // Every other assertion here is a `toContain` or a `not.toContain`. An
    // extractor returning "" would satisfy every negative one of them, so the
    // suite would go green while the instrument was completely broken. This
    // block is what stops that: it is the difference between testing that a
    // check works and testing that it merely ran.
    for (const date of Object.keys(CAPTURES) as (keyof typeof CAPTURES)[]) {
      it(`produces substantive text for both readings of ${date}`, () => {
        const { raw, extracted } = readingsOf(date);
        expect(raw.length).toBeGreaterThan(2000);
        expect(extracted.length).toBeGreaterThan(2000);
      });
    }
  });

  describe('the FDA safety line was never removed — the fact a published thesis got wrong', () => {
    for (const date of Object.keys(CAPTURES) as (keyof typeof CAPTURES)[]) {
      it(`is in the RAW archived document on ${date}`, () => {
        expect(readingsOf(date).raw).toContain(FDA_LINE);
      });
    }

    it('is nonetheless MISSING from the extraction on 2022-08-05 — the divergence itself', () => {
      expect(readingsOf('2022-08-05').extracted).not.toContain(FDA_LINE);
    });

    it('is present in the extraction on the captures either side of it', () => {
      // This is what makes the 08-05 gap a DIVERGENCE rather than a page edit.
      // Readability keeps the line on 07-24 and on 09-06 and loses it on the one
      // capture in between, so a diff computed over the extraction manufactures
      // a removal and a restoration that never happened.
      expect(readingsOf('2022-07-24').extracted).toContain(FDA_LINE);
      expect(readingsOf('2022-09-06').extracted).toContain(FDA_LINE);
    });
  });

  describe('the side-effects wording is about onset, not duration', () => {
    it('the onset sentence is in BOTH readings on 2022-09-06', () => {
      // A positive assertion on the extraction, not just the raw text: this is
      // the case that proves the extraction is still producing real page content
      // rather than something that merely fails every negative check.
      const { raw, extracted } = readingsOf('2022-09-06');
      expect(raw).toContain(ONSET_SENTENCE);
      expect(extracted).toContain(ONSET_SENTENCE);
    });

    for (const phrase of NEVER_ON_THE_PAGE) {
      it(`"${phrase}" appears in neither reading of 2022-09-06`, () => {
        const { raw, extracted } = readingsOf('2022-09-06');
        expect(raw).not.toContain(phrase);
        expect(extracted).not.toContain(phrase);
      });
    }
  });

  describe('the extraction discards enough of the page to hide whole sentences', () => {
    for (const date of Object.keys(CAPTURES) as (keyof typeof CAPTURES)[]) {
      it(`retains materially less than the raw document on ${date}`, () => {
        // Not an exact ratio: Readability's output is not a stable contract, and
        // pinning a percentage would make this test a burden rather than a guard.
        // The assertion is that the gap stays large enough to lose a sentence,
        // which is the property every verification tool depends on.
        const { raw, extracted } = readingsOf(date);
        expect(extracted.length).toBeLessThan(raw.length * 0.9);
      });
    }
  });

  it('never lets script or style bodies reach the raw reading as page text', () => {
    // Otherwise a phrase could be "found" in markup the page never displayed —
    // which would make verify_claim_text confirm claims that are false.
    const html = fs.readFileSync(
      path.join(__dirname, '..', 'fixtures', 'wayback-vaccine-20220906232435-raw.html'),
      'utf-8',
    );
    expect(html).toContain('<script');
    expect(normaliseForPresence(extractRawText(html))).not.toContain('function(');
  });
});
