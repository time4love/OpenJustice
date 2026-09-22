import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SRC } from '../walk/scan';
import { built } from './built';
import type { DocumentContentVersionRow, Verdict } from './contract';
import { version } from './fixtures';

// ---------------------------------------------------------------------------
// A3 :1372-:1374, :1385-:1386 and §3 :359-:365 — THE CITATION SIDE.
//
// CITATION_CURRENT(m), ARGUED(m) and NEEDS_REVIEW(e) ARE EVIDENCE A3'S, UNCHANGED,
// COMPUTED OVER CURRENT(d) (A3 :1372). They are CALLED and never re-spelled — a second
// spelling of one rule is this repository's named dominant defect shape — so the cases
// below prove the CALL by reading the source rather than by agreeing with an answer.
//
// EVERY SOURCE CASE LOADS THE MODULE FIRST, deliberately: until step 29 builds it the
// case fails BY NAME with the step that owes it, rather than with an ENOENT from a file
// read that says nothing about the contract.
//
// THE VERDICT RULE IS THESIS STEP 19'S SYMBOL AND THIS STEP ADDS NOTHING TO IT
// (plan step 29 :162-:163). What this layer contributes is its THIRD VALUE, UNCHECKED,
// wherever the content is bytes — an amendment to thesis T1, not a new rule.
// ---------------------------------------------------------------------------

interface Citation {
  verdict: (phrase: string, current: DocumentContentVersionRow | null) => Verdict;
}

const citation = () => built<Citation>('services/documentPredicates', ['verdict']);

/** Loaded through `built` first, so an unbuilt module fails by name and never by ENOENT. */
async function predicateSource(): Promise<string> {
  await citation();
  return readFileSync(join(SRC, 'services/documentPredicates.ts'), 'utf8');
}

describe('A3 :1385-:1386 — VERDICT(phrase, d), the ONE verdict rule over CURRENT(d).text', () => {
  it('PRESENT when the phrase is in the computed text', async () => {
    const { verdict } = await citation();
    expect(verdict('the channel stay open', version())).toBe('PRESENT');
  });

  it('ABSENT when it is not', async () => {
    const { verdict } = await citation();
    expect(verdict('a sentence the document never carried', version())).toBe('ABSENT');
  });

  it('UNCHECKED where the content is the BYTES — never silently PRESENT (§3 :362-:364)', async () => {
    const { verdict } = await citation();
    expect(verdict('anything at all', version({ text: null }))).toBe('UNCHECKED');
  });

  it('UNCHECKED where there is no current version at all — a model never grades another model', async () => {
    const { verdict } = await citation();
    expect(verdict('anything at all', null)).toBe('UNCHECKED');
  });

  it('the three values are the WHOLE range — a fourth would be a verdict no clause defines', async () => {
    const { verdict } = await citation();
    const seen = new Set<Verdict>([
      verdict('the channel stay open', version()),
      verdict('never carried', version()),
      verdict('x', version({ text: null })),
    ]);
    expect([...seen].sort()).toEqual(['ABSENT', 'PRESENT', 'UNCHECKED']);
  });
});

describe('A3 :1372 — evidence A3’s predicates are CALLED over CURRENT(d), never re-spelled', () => {
  it('the module IMPORTS evidencePredicates rather than defining its own', async () => {
    expect(await predicateSource()).toMatch(/from '.*evidencePredicates'/);
  });

  it('it redefines NONE of citationCurrent, argued or needsReview — A3 :1372 says they are unchanged', async () => {
    const source = await predicateSource();
    const respelled = ['citationCurrent', 'argued', 'needsReview'].filter((name) =>
      new RegExp(`export (const|function) ${name}\\b`).test(source),
    );
    // THE FLOOR is the list itself: three names examined, and the failure names which.
    expect(respelled).toEqual([]);
  });

  it('THE VERDICT RULE IS THESIS STEP 19’S — this module calls it and declares no second one', async () => {
    const source = await predicateSource();
    expect(source).toMatch(/from '.*(thesisAssertions|verdictRule|claimVerdict)'/);
    expect(source).not.toMatch(/export (const|function) (verdictRule|computeVerdict)\b/);
  });
});
