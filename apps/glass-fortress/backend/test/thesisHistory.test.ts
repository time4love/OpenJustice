jest.mock('../src/lib/prisma', () => ({
  prisma: (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).db,
}));
jest.mock('../src/context/researcherContext', () => (require('./thesis/tools') as typeof import('./thesis/tools')).researcherContextDouble);
jest.mock('../src/factories/LLMFactory', () => (require('./thesis/tools') as typeof import('./thesis/tools')).llmFactoryTripwire);

import { addNoteHandler } from '../src/mcp/tools/addNote';
import { getThesisContextHandler } from '../src/mcp/tools/getThesisContext';
import { history } from '../src/services/thesisPredicates';
import { resetDouble, store, written } from './helpers/evidenceDouble';
import { ANALYSIS, AUTHOR, FRAMING, NOTE, THESIS } from './thesis/fixtures';
import { actAs, resetTools, seedThesis } from './thesis/tools';

// ---------------------------------------------------------------------------
// HISTORY AND THE READS — what `test/thesis/` cannot see. docs/gf-thesis-flows.md A3 :1407, §9 :971–:997;
// the R47 sketch §6-R5, R6, R15, D11.
//
// IN THE UNIT PROJECT, which gates. Each case holds a ruling no acceptance case observes:
//
//   D11  a note on the thesis's FRAMING is its history — the acceptance world seeds thesis notes only
//   R6   `since` is STRICT — the acceptance cases put the date BETWEEN two rows, so `>=` passes them
//        the note's text VERBATIM — the acceptance note has no leading or trailing whitespace
//   R15  an analysis of HEAD before thesis step 22 THROWS — the acceptance world holds no analysis
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
  resetTools();
});

const at = (minute: number): Date => new Date(Date.UTC(2026, 8, 10, 9, minute));

describe('HISTORY(t) — the framing notes and the boundary', () => {
  it("a note on a framing ATTACHED to the thesis is a NOTE of its history; a note on an unattached framing is not (D11)", async () => {
    seedThesis();
    store.framings = [FRAMING, { ...FRAMING, id: 'framing-unattached', thesisId: null }];
    store.notes = [
      { ...NOTE, id: 'note-on-the-framing', thesisId: null, framingId: FRAMING.id, createdAt: at(20) },
      { ...NOTE, id: 'note-on-another-framing', thesisId: null, framingId: 'framing-unattached', createdAt: at(21) },
    ];
    const entries = await history(THESIS.id);
    expect(entries.filter((e) => e.kind === 'NOTE').map((e) => [e.id, e.researcherId])).toEqual([['note-on-the-framing', AUTHOR]]);
  });

  it('an entry whose createdAt EQUALS `since` is excluded — `since` is strict (R6)', async () => {
    seedThesis();
    store.notes = [
      { ...NOTE, id: 'note-at-since', createdAt: at(30) },
      { ...NOTE, id: 'note-after-since', createdAt: at(31) },
    ];
    const ids = (await history(THESIS.id, at(30))).map((e) => e.id);
    expect(ids).toEqual(['note-after-since']);
  });
});

describe('the note, stored VERBATIM', () => {
  it('a text with a trailing space is written WITH it', async () => {
    seedThesis();
    actAs(AUTHOR);
    await addNoteHandler({ thesisId: THESIS.id, text: `${NOTE.text} ` });
    expect(written.find((w) => w.model === 'note')?.data['text']).toBe(`${NOTE.text} `);
  });
});

describe('get_thesis_context — an analysis before thesis step 22 (R15)', () => {
  it('an analysis row of HEAD THROWS naming step 22 — a malformed state, not an answer', async () => {
    seedThesis();
    store.analyses = [{ ...ANALYSIS, versionId: THESIS.headVersionId }];
    await expect(getThesisContextHandler({ thesisId: THESIS.id })).rejects.toThrow('step 22');
  });
});
