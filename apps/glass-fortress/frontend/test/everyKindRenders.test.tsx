jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { renderResearchThesis } from './render';
import { TURN_KINDS, type TurnKind } from '../src/types/research';
import { fullTranscript, thesisContextFull } from './fixtures/research/thesisContext';

// ---------------------------------------------------------------------------
// every-kind-renders — docs/gf-ui-flows.md §15 :495–:496; docs/gf-ui-refactor-plan.md UI-8 :781.
//
// "A fixture transcript carrying all SEVENTEEN turn kinds of A4 :1476 renders one row EACH and one sheet
// EACH; a kind added to A2 without a renderer fails it."
//
// WHAT THIS INSTRUMENT HOLDS TODAY, SAID RATHER THAN IMPLIED. The ROW half is held here, exhaustively over
// the closed union. **The SHEET half is NOT held, because no sheet exists yet**: §11 :431 opens a sheet for a
// turn's MATERIAL — the record, the diff to the parent, a request's addresses — and that is the CITATIONS and
// GAPS tabs' work, not this chunk's. Saying so is the point: an instrument that silently covered half its
// clause would report green about a property nobody built, which is the vacuity this repository has been
// caught by more than once. The sheet half arrives with the sheets, in this file, under this name.
//
// THE FIXTURE IS THE APPENDIX'S, NEVER A LIVE BODY. Run B's real transcript exercises only fourteen of the
// seventeen — RESPONSE, WITHDRAWAL and NOTE never happened on it — so a live body would leave three kinds
// unexamined while the case read green. `thesisContext.ts` :14 records that reasoning for the fixture itself.
//
// THE EXHAUSTIVENESS IS OVER `TURN_KINDS`, THE CLOSED UNION, not over the fixture: a kind ADDED to A4 and to
// the union but left out of the fixture fails at the first assertion BY NAME, which is the half of §15 :496
// that catches an addition rather than a removal.
// ---------------------------------------------------------------------------

const LOCALE = 'he';

describe('every-kind-renders', () => {
  it('THE FIXTURE CARRIES ALL SEVENTEEN KINDS — the floor, so everything below examines something', () => {
    expect(TURN_KINDS).toHaveLength(17);
    const inFixture = new Set(fullTranscript.map((turn) => turn.kind));
    // NAMED, not counted: a floor that only counts says nothing about WHICH kind is missing.
    expect(TURN_KINDS.filter((kind) => !inFixture.has(kind))).toEqual([]);
    expect(thesisContextFull.history).toBe(fullTranscript);
  });

  it('EVERY ONE OF THE SEVENTEEN RENDERS A ROW, and the row carries that kind`s frozen name', async () => {
    const container = await renderResearchThesis(LOCALE, { withPane: true, context: thesisContextFull });
    const drawn = [...container.querySelectorAll('[data-turn]')];
    // M1, the non-vacuity guard: a render that produced no row examined nothing at all.
    if (drawn.length === 0) throw new Error('the transcript rendered no turn rows');

    const missing = TURN_KINDS.filter((kind) => !drawn.some((row) => row.getAttribute('data-turn') === kind));
    expect(missing).toEqual([]);

    // ONE ROW PER TURN — not merely one per KIND, which a renderer that de-duplicated would also satisfy.
    expect(drawn.length).toBe(fullTranscript.length);

    // AND THE NAME IS DRAWN, per kind — a row that rendered an empty `<b>` would pass the presence check
    // above while saying nothing to a reader. `research.turn.WITHDRAWAL` is a CALL row in the copy freeze
    // (:152) and answers „הפרסום בוטל"; it is the one kind a computed key would have failed on.
    const nameless = TURN_KINDS.filter((kind: TurnKind) => {
      const row = drawn.find((one) => one.getAttribute('data-turn') === kind);
      return (row?.querySelector('[data-turn-kind]')?.textContent ?? '').trim() === '';
    });
    expect(nameless).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // THE COMPOSED PHRASES — §11 :431 ("the backend authors no sentence"): every phrase of §11's table is the
  // PAGE's, built from `body` through a frozen ICU string. Three lax probes went green before these existed —
  // the element count forced to 999, the unargued count forced to 999, and the ANALYSIS grade drawn twice —
  // so each assertion below is a number DERIVED FROM THE FIXTURE and compared to the rendered text, never a
  // literal copied out of the answer.
  // -------------------------------------------------------------------------

  it('THE COMPOSED PHRASES ARE THE PAGE`S, and each number is the fixture`s own', async () => {
    const container = await renderResearchThesis(LOCALE, { withPane: true, context: thesisContextFull });
    const composedOf = (kind: TurnKind): string[] =>
      [...container.querySelectorAll(`[data-turn="${kind}"]`)].map((row) => (row.querySelector('[data-turn-composed]')?.textContent ?? '').trim());

    // THE FLOOR, AND IT IS PER KIND: a row that composed NOTHING would otherwise satisfy every comparison
    // below by rendering ''. Each of these four kinds must produce a non-empty phrase on every one of its rows.
    for (const kind of ['ROUND_ASSESSED', 'VERSION', 'ANALYSIS', 'GAP_DECISION'] as const) {
      const drawn = composedOf(kind);
      if (drawn.length === 0) throw new Error(`no ${kind} row rendered — the case examined nothing`);
      expect(drawn.filter((text) => text === '')).toEqual([]);
    }

    // ASSESSED: contradictions, and elements **FILLED** — 3 of 4 in the fixture, as on board ג3.
    const assessed = fullTranscript.filter((turn) => turn.kind === 'ROUND_ASSESSED');
    expect(composedOf('ROUND_ASSESSED')).toEqual(
      assessed.map((turn) => {
        const content = turn.kind === 'ROUND_ASSESSED' ? turn.body.content : null;
        const elements = Array.isArray(content?.elements) ? content.elements : [];
        const filled = elements.filter((one) => (one as { filled?: unknown }).filled === true).length;
        const contradictions = Array.isArray(content?.contradictions) ? content.contradictions.length : 0;
        // The count of FILLED is strictly fewer than the count of elements, or this case cannot tell the two
        // apart — which is exactly the defect it exists to catch.
        expect(filled).toBeLessThan(elements.length);
        return `הוערך: ${contradictions} סתירות, ${filled} רכיבים שמולאו`;
      }),
    );

    // VERSION: added, and UNARGUED computed from the version's OWN stored mentions (`thesisPredicates.ts`
    // :152–:156's EVIDENCE-only test), never from `dropped` and never from HEAD's one `unargued` list.
    const versions = fullTranscript.filter((turn) => turn.kind === 'VERSION');
    const unarguedPerVersion = versions.map((turn) =>
      turn.kind === 'VERSION' ? turn.body.mentions.filter((m) => m.kind === 'EVIDENCE' && m.debateSessionId === null).length : 0,
    );
    // THE DISCRIMINATING FLOOR: the fixture must contain both an argued and an unargued version, or a
    // renderer that answered a constant would pass.
    expect(new Set(unarguedPerVersion).size).toBeGreaterThan(1);
    expect(composedOf('VERSION')).toEqual(
      versions.map((turn, index) => {
        const added = turn.kind === 'VERSION' ? turn.body.citationsVsParent.added.length : 0;
        return `+${added} ציטוטים, ${unarguedPerVersion[index] ?? 0} לא נטענו`;
      }),
    );

    // ANALYSIS: the grade, worded ONCE. The turn's `line` is consumed by the phrase, so the bare datum must
    // not also be drawn — the third probe that went green.
    const analyses = fullTranscript.filter((turn) => turn.kind === 'ANALYSIS');
    expect(composedOf('ANALYSIS')).toEqual(analyses.map((turn) => `ניתוח: ${turn.line ?? ''}`));
    for (const row of container.querySelectorAll('[data-turn="ANALYSIS"]')) {
      expect(row.querySelector('[data-turn-line]')).toBeNull();
    }

    // GAP_DECISION: the decision in force, as its frozen word.
    const gaps = fullTranscript.filter((turn) => turn.kind === 'GAP_DECISION');
    const WORD: Record<string, string> = { OPEN: 'פתוח', CITED: 'צוטט', REQUESTED: 'הוגשה בקשה', CALLED: 'נקרא לעדים', CONCEDED: 'הודה', DISMISSED: 'נדחה' };
    expect(composedOf('GAP_DECISION')).toEqual(gaps.map((turn) => (turn.kind === 'GAP_DECISION' ? (WORD[turn.body.decision] ?? '') : '')));
  });

  it('THE ASSESSOR`S VERDICT IS A WORD on both assessment kinds, and a NULL verdict renders none (copy :329)', async () => {
    const container = await renderResearchThesis(LOCALE, { withPane: true, context: thesisContextFull });
    const WORD = { SUPPORTS: 'המעריך הסכים', DISPUTES: 'המעריך התנגד' };
    for (const kind of ['ASSESSMENT', 'PUBLICATION_ASSESSMENT'] as const) {
      const turns = fullTranscript.filter((turn) => turn.kind === kind);
      if (turns.length === 0) throw new Error(`the fixture carries no ${kind} turn`);
      const drawn = [...container.querySelectorAll(`[data-turn="${kind}"]`)].map((row) => (row.querySelector('[data-turn-composed]')?.textContent ?? '').trim());
      expect(drawn).toEqual(
        turns.map((turn) => {
          const verdict = turn.kind === 'ASSESSMENT' || turn.kind === 'PUBLICATION_ASSESSMENT' ? turn.body.verdict : null;
          // A NULL VERDICT RENDERS NO WORD — the frozen note's own clause, and the reason this is '' and not
          // a placeholder.
          return verdict === null ? '' : WORD[verdict];
        }),
      );
    }
  });
  // -------------------------------------------------------------------------
  // THE GLYPH RAIL — board ג3's left column, mapped at `docs/boards/boards.py` :38–:40: seventeen kinds onto
  // the EIGHT families `components/glyphs.tsx` :50–:67 landed at UI-4b. The map is checked here against that
  // generator's own table, so the page and the approved image cannot drift apart silently.
  // -------------------------------------------------------------------------

  it('EVERY ONE OF THE SEVENTEEN DRAWS EXACTLY ONE GLYPH, and it is the family the board maps it to', async () => {
    const BOARD: Record<TurnKind, string> = {
      FRAMING_OPENED: 'act', ROUND_PROPOSED: 'act', ROUND_ASSESSED: 'model', ROUND_CHOSEN: 'act',
      VERSION: 'version', DEBATE_OPENED: 'act', RATIONALE: 'act', ASSESSMENT: 'model', RESPONSE: 'act',
      DEBATE_CLOSED: 'verdict', ANALYSIS: 'model', GAP_DECISION: 'gap', PUBLICATION_RATIONALE: 'act',
      PUBLICATION_ASSESSMENT: 'model', PUBLICATION_VERDICT: 'publication', WITHDRAWAL: 'withdrawal', NOTE: 'note',
    };
    // The eight families, and no ninth — a kind mapped to a name `glyphs.tsx` does not export would render
    // nothing at all, and the per-row assertions below would then be reading an empty rail.
    expect(new Set(Object.values(BOARD)).size).toBe(8);

    const container = await renderResearchThesis(LOCALE, { withPane: true, context: thesisContextFull });
    const rows = [...container.querySelectorAll('[data-turn]')];
    // THE FLOOR: a render with no glyph at all examined nothing, and must throw rather than pass.
    const glyphs = container.querySelectorAll('[data-turn-glyph]');
    if (glyphs.length === 0) throw new Error('the transcript drew no glyph — the rail is absent, not merely wrong');
    expect(glyphs.length).toBe(rows.length);

    // PER KIND: the family named, and an SVG actually drawn. Both halves are needed — an attribute kept
    // beside a glyph that stopped rendering would pass the first half alone.
    const wrong: string[] = [];
    for (const kind of TURN_KINDS) {
      for (const row of container.querySelectorAll(`[data-turn="${kind}"]`)) {
        const rail = row.querySelector('[data-turn-glyph]');
        const family = rail?.getAttribute('data-turn-glyph') ?? null;
        const drawn = rail?.querySelectorAll('svg').length ?? 0;
        if (family !== BOARD[kind] || drawn !== 1) wrong.push(`${kind}: family=${String(family)} svg=${String(drawn)}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});
