import { THESIS_SYNTHESIS_PROMPT } from '../src/prompts/thesisSynthesis';

// Regression guard: a branch built from a stale local base once got merged
// into staging without conflict but with this prompt's section headers
// duplicated verbatim (git's 3-way merge saw two textually-different diffs
// landing near the same lines and inserted both instead of one). No merge
// conflict fires for this because the surrounding text differs slightly, so
// only a content-level check like this catches it.
const REQUIRED_SECTIONS = [
  'EVIDENCE TYPES:',
  'RULES:',
  'LEGAL FRAMING (mandatory',
  'CAUSES OF ACTION ARE POTENTIAL, NOT CONCLUDED:',
  'KEY FIGURES — INCLUSION BAR:',
  'CITATIONS — EVERY CLAIM NEEDS A FOOTNOTE:',
  'LANGUAGE:',
];

describe('THESIS_SYNTHESIS_PROMPT', () => {
  it.each(REQUIRED_SECTIONS)('contains the %s section exactly once', (section) => {
    const occurrences = THESIS_SYNTHESIS_PROMPT.split(section).length - 1;
    expect(occurrences).toBe(1);
  });
});
