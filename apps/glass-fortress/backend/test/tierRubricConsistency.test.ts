import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The tier rubric is defined in the intake prompt and must grade by what a
 * document CONTAINS rather than by its form.
 *
 * IT ONCE HAD A SECOND CONSUMER AND THEY DRIFTED: the thesis-synthesis prompt
 * called Tier 1 "official documents", which is intake's Tier 2, so a thesis was
 * weighted by a definition the classifier never used. That prompt was retired
 * with `suggest_thesis` (docs/gf-prosecutor-dev-plan.md §11.1), and its arm of
 * this test went with it — the divergence cannot recur because the second
 * implementation no longer exists. The intake arms below are the live rule.
 */

const PROMPTS = join(__dirname, '..', 'src', 'prompts');
const intake = readFileSync(join(PROMPTS, 'intakeAgentClassification.ts'), 'utf8');

describe('the tier rubric means the same thing wherever it is referred to', () => {
  it('intake grades by what the document contains, not by its form', () => {
    // The defect this replaced: branch 3 read "media article or general pattern
    // without direct proof", so "media article" stood alone as a FORM test. Given
    // the full page, the model saw the byline, concluded "journalistic
    // investigation", and demoted a document carrying leaked recordings to
    // Tier 3 — more information moved the answer further from the truth.
    expect(intake).toMatch(/WHAT THE DOCUMENT CONTAINS/);
    expect(intake).toMatch(/REGARDLESS OF FORM/);
    expect(intake).not.toMatch(/Is this a media article or general pattern/);
  });

  it('intake forbids a tier that contradicts its own reasoning', () => {
    // The observed failure mode: tierReasoning said the direct quotes and audio
    // links give it "high evidentiary weight", and the tier said Supporting.
    expect(intake).toMatch(/resolve it in favour of the reasoning/);
  });

  it('keyFigures defaults to exclusion and names who is never included', () => {
    // An over-inclusive list is the platform's highest legal exposure: it feeds
    // a per-person dossier. The observed failure added a pharmaceutical CEO who
    // appears only as background.
    expect(intake).toMatch(/default is EXCLUSION/);
    expect(intake).toMatch(/WHEN IN DOUBT, EXCLUDE/);
    for (const excluded of ['author or journalist', 'blew the whistle', 'victims', 'head of an implicated organisation']) {
      expect(intake).toContain(excluded);
    }
  });
});
