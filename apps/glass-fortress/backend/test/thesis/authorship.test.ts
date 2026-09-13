jest.mock('../../src/lib/prisma', () => ({
  prisma: (require('../helpers/evidenceDouble') as typeof import('../helpers/evidenceDouble')).db,
}));
jest.mock('../../src/context/researcherContext', () => (require('./tools') as typeof import('./tools')).researcherContextDouble);
jest.mock('../../src/factories/LLMFactory', () => (require('./tools') as typeof import('./tools')).llmFactoryTripwire);

import { resetDouble } from '../helpers/evidenceDouble';
import { TOOLS, WRITE_TOOLS_ON_A_THESIS, type ThesisCode } from './contract';
import { OTHER_RESEARCHER } from './fixtures';
import { MISSING_FRAMING, MISSING_THESIS, ON_THE_FIXTURE, refusals, resetTools, seedThesis } from './tools';

// ---------------------------------------------------------------------------
// AUTHORSHIP, AS A PROPERTY OVER EVERY WRITE ON A THESIS — the R40 sketch §3g;
// docs/gf-thesis-flows.md A7 :1685 ("every write refuses NOT_AUTHOR: a test calls
// each write tool as a second researcher") and §9 :1001.
//
// ONE LIST, ONE CALL, ONE WORLD. The list is `contract.ts`'s WRITE_TOOLS_ON_A_THESIS;
// the call is `ON_THE_FIXTURE`'s — the same well-formed call each tool file starts
// from — and the world is `seedThesis`'s. Each tool is called three ways:
//
//   as a SECOND researcher   → the tool's own word: NOT_YOURS on the framing tools
//                              whose set carries it (§0f), NOT_AUTHOR on every other
//   as NO ONE                → NO_RESEARCHER, decided before any query (the ORDER)
//   with its id naming none  → NO_FRAMING for a framing tool, NO_THESIS for the rest,
//                              asked by the stranger — a missing row is named missing
//
// Both words are READ from `contract.ts` (the tool's set; the key its call names),
// never re-listed here, so a tool's word is one value in one place.
//
// THE PER-TOOL FILES PRODUCE THE SAME THREE CODES FOR THEIR OWN EQUALITIES; this file
// is where the rule is one property over the list, as A7 states it, rather than ten
// cases in five files. The three debate writes refuse NOT_AUTHOR too; they are
// `test/debate.test.ts`'s, referenced and never repeated (round-3 L4).
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
  resetTools();
});

describe('every write on a thesis refuses a stranger in its own word, no one first, and a missing id by name — A7 :1685 (sketch §3g)', () => {
  for (const tool of WRITE_TOOLS_ON_A_THESIS) {
    const input = ON_THE_FIXTURE[tool];
    const stranger: ThesisCode = TOOLS[tool].codes.includes('NOT_YOURS') ? 'NOT_YOURS' : 'NOT_AUTHOR';
    const missing: { code: ThesisCode; input: Readonly<Record<string, unknown>> } =
      'thesisId' in input
        ? { code: 'NO_THESIS', input: { ...input, thesisId: MISSING_THESIS } }
        : { code: 'NO_FRAMING', input: { ...input, framingId: MISSING_FRAMING } };

    describe(tool, () => {
      refusals(tool, [
        { code: stranger, why: 'called by a SECOND researcher on the fixture thesis', as: OTHER_RESEARCHER, seed: seedThesis, input },
        { code: 'NO_RESEARCHER', why: 'called by no one — decided before any query', as: null, seed: seedThesis, input },
        {
          code: missing.code,
          why: `its id naming nothing — asked by the stranger, still ${missing.code}`,
          as: OTHER_RESEARCHER,
          seed: seedThesis,
          input: missing.input,
        },
      ]);
    });
  }

  it("the list is A4's writes on a thesis — every WRITE tool but create_thesis, which has no author yet, plus draft_foia_request, GATED and refusing NOT_AUTHOR (round-3 L4)", () => {
    // GREEN BY CONSTRUCTION TODAY — contract against contract, declared (7.3): it is
    // the guard for the day a WRITE tool joins TOOLS without joining this list.
    const writes = Object.entries(TOOLS)
      .filter(([name, contract]) => contract.access === 'WRITE' && name !== 'create_thesis')
      .map(([name]) => name);
    expect([...WRITE_TOOLS_ON_A_THESIS].sort()).toEqual([...writes, 'draft_foia_request'].sort());
  });
});
