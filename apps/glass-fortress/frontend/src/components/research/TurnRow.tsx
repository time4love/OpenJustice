'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { GLYPHS } from '@/components/glyphs';
import { PlatformMark, type MarkKind } from '@/components/thesis/PlatformMark';
import { formatDate } from '@/lib/format';
import type { Turn, TurnKind, VersionMentionRow } from '@/types/research';
import { ModelVoice } from './ModelVoice';

// ---------------------------------------------------------------------------
// ONE TURN, ONE ROW — docs/gf-ui-flows.md §11 :431–:433 and its table :438–:450; docs/gf-thesis-flows.md
// A4 :1476 (the seventeen kinds, `T`'s shape, which of them carry a `line`); §9 :974. Approved board ג3.
//
// ONE BUILDER, THREE DOORS. This renderer is the WORKING VIEW's and is built ONCE, here —
// `FramingRow.tsx` :14–:19 declared that before it existed ("that renderer is the working view's and is built
// once, there"), on the ground of A4 :1459, where `get_framing` answers its thread "from the SAME builder the
// transcript uses". The framing sheet and the debate sheet CALL this; neither grows a second one for four or
// five of the seventeen kinds.
//
// COLLAPSED IS: the kind's frozen name · the speaker · the moment · the `line` DATUM (§11 :431). EXPANDED IS
// IN PLACE — never a navigation. The SHEET is for a turn's MATERIAL (the record, the diff to the parent, a
// request's addresses) and is NOT this chunk's; nothing here opens one.
//
// THE BACKEND AUTHORS NO SENTENCE (RULED 2026-09-20, R66 „Q1 datum"). `line` is a DATUM verbatim — a question,
// a claim, a record's name, a grade — and every COMPOSED phrase of §11's table is built HERE from `body`
// through a frozen ICU string (`research.line.*`). Nine of the seventeen carry `line: null` by A4 :1476, their
// kind and body naming them, so a row draws a line only where there is one.
//
// THE THREE VOICES, EACH IN ITS REGISTER (§10 :371–:391, §11 :431): the RESEARCHER's handle and words plain,
// the MODEL inside COMPLIANCE Rule 3's labelled container, the PLATFORM as a MARK through `PlatformMark` —
// CALLED, never re-spelled, a mark computed here being the second spelling §21 :626 forbids.
//
// WHAT AN EXPANSION SHOWS, AND WHY IT IS THE RESEARCHER'S WORDS ALONE. The model's material — `AssessmentBody`'s
// `assessment` and `objection`, `AnalysisBody`'s `opinion`, `RoundAssessedBody`'s `content` — is typed
// `unknown` on purpose, and `types/research.ts` :223–:224 says why in terms: the appendix names those fields
// and spells none, and "every one of them renders inside `LabelledOpinion` or not at all". Narrowing them is
// the ANALYSIS and CITATIONS tabs' work, with the container question this chunk's report escalates. So a model
// turn expands to its labelled voice and no further — which is that clause obeyed, not a gap in this row.
// ---------------------------------------------------------------------------

/**
 * A KIND'S FROZEN NAME, by the copy freeze's own routing — sixteen own rows and ONE CALL.
 *
 * `research.turn.WITHDRAWAL` is a CALL row (`R63-approved-copy-5bc.md` :152): it reuses
 * `theses.provenance.events.THESIS_UNPUBLISHED`, „הפרסום בוטל", whose panel retires at UI-10 and whose key
 * MOVES rather than dies. A computed `research.turn.${kind}` therefore answers a MISSING MESSAGE for exactly
 * that one kind — which is what this table exists to stop, and what the harness caught the moment the
 * seventeen-kind fixture first rendered. `messages-parity` could never have: a key absent from both
 * catalogues is absent consistently.
 */
const TURN_KEY: Record<TurnKind, string> = {
  FRAMING_OPENED: 'research.turn.FRAMING_OPENED',
  ROUND_PROPOSED: 'research.turn.ROUND_PROPOSED',
  ROUND_ASSESSED: 'research.turn.ROUND_ASSESSED',
  ROUND_CHOSEN: 'research.turn.ROUND_CHOSEN',
  VERSION: 'research.turn.VERSION',
  DEBATE_OPENED: 'research.turn.DEBATE_OPENED',
  RATIONALE: 'research.turn.RATIONALE',
  ASSESSMENT: 'research.turn.ASSESSMENT',
  RESPONSE: 'research.turn.RESPONSE',
  DEBATE_CLOSED: 'research.turn.DEBATE_CLOSED',
  ANALYSIS: 'research.turn.ANALYSIS',
  GAP_DECISION: 'research.turn.GAP_DECISION',
  PUBLICATION_RATIONALE: 'research.turn.PUBLICATION_RATIONALE',
  PUBLICATION_ASSESSMENT: 'research.turn.PUBLICATION_ASSESSMENT',
  PUBLICATION_VERDICT: 'research.turn.PUBLICATION_VERDICT',
  WITHDRAWAL: 'theses.provenance.events.THESIS_UNPUBLISHED',
  NOTE: 'research.turn.NOTE',
};

/**
 * THE KIND'S GLYPH — seventeen kinds onto EIGHT families, exactly as `docs/boards/boards.py` :38–:40 maps
 * them, and the families are `components/glyphs.tsx` :50–:67's, CALLED and never redrawn (that file's own
 * :49 says it landed there "so it does not redraw them").
 *
 * IT IS A TABLE FOR THE REASON `TURN_KEY` IS: the mapping is MANY-TO-ONE and not derivable — `act` carries
 * seven kinds and `model` four, while five kinds have a family to themselves — so there is nothing to
 * compute and a computed lookup would only be a place to be wrong.
 */
const GLYPH_OF: Record<TurnKind, keyof typeof GLYPHS> = {
  FRAMING_OPENED: 'act',
  ROUND_PROPOSED: 'act',
  ROUND_ASSESSED: 'model',
  ROUND_CHOSEN: 'act',
  VERSION: 'version',
  DEBATE_OPENED: 'act',
  RATIONALE: 'act',
  ASSESSMENT: 'model',
  RESPONSE: 'act',
  DEBATE_CLOSED: 'verdict',
  ANALYSIS: 'model',
  GAP_DECISION: 'gap',
  PUBLICATION_RATIONALE: 'act',
  PUBLICATION_ASSESSMENT: 'model',
  PUBLICATION_VERDICT: 'publication',
  WITHDRAWAL: 'withdrawal',
  NOTE: 'note',
};

/** The three families the board colours away from `--ink` (`boards.py` :118); the rest take the default. */
const RAIL_TONE: Partial<Record<keyof typeof GLYPHS, string>> = {
  model: 'turn-rail-model',
  publication: 'turn-rail-publication',
  withdrawal: 'turn-rail-withdrawal',
};

/** The platform's verdicts as marks — the closed set this transcript reaches, over `PlatformMark`'s union. */
const DEBATE_OUTCOME: Record<'PROMOTED' | 'ABANDONED', MarkKind> = { PROMOTED: 'promoted', ABANDONED: 'abandoned' };
const PUBLICATION_OUTCOME: Record<'PUBLISHED' | 'REFUSED', MarkKind> = { PUBLISHED: 'published', REFUSED: 'refused' };

/**
 * THE COMPOSED PHRASE FOR A ROW, or null where the turn's own `line` is the whole of it.
 *
 * §11's table gives several rows a phrase the PAGE writes — "assessed: n contradictions, m elements filled",
 * "+n citations, k unargued", "analysis: <strength>", the checks a publication was refused by. Each is an ICU
 * string in the frozen catalogue, filled from `body`. A kind not named here has nothing composed.
 */
function composedLine(turn: Turn, t: (key: string, values?: Record<string, string | number>) => string): string | null {
  switch (turn.kind) {
    case 'ROUND_ASSESSED': {
      const { content } = turn.body;
      const contradictions = Array.isArray(content?.contradictions) ? content.contradictions.length : 0;
      // ELEMENTS **FILLED**, NOT ELEMENTS. The frozen string says „רכיבים שמולאו" and the approved board draws
      // 3 where the assessment carries 4 — `MATERIAL_INFORMATION` comes back `filled: false` with `records: []`
      // on both of run B's ASSESSED rounds. `boards.py` :234 is the generator's own spelling of the same sum.
      // Counting the array said 4, which is the one number on that row a reader could check against the record
      // and find wrong.
      const elements = Array.isArray(content?.elements) ? content.elements.filter(isFilled).length : 0;
      return t('line.assessed', { contradictions, elements });
    }
    case 'VERSION':
      return t('line.versionCitations', {
        added: turn.body.citationsVsParent.added.length,
        unargued: unarguedOf(turn.body.mentions),
      });
    case 'ASSESSMENT':
    case 'PUBLICATION_ASSESSMENT':
      // THE ASSESSOR'S VERDICT AS A WORD (approved copy :329–:330), and **a null verdict renders NO word** —
      // that clause is the frozen note's own, and it is why this returns null rather than an empty string: an
      // empty `<p>` is a row that looks like it lost something.
      return turn.body.verdict === null ? null : t(`verdict.${turn.body.verdict}`);
    case 'ANALYSIS':
      // The GRADE is the turn's own `line` (A4 :1476, „ANALYSIS the strength grade"); the page words it.
      return turn.line === null ? null : t('line.analysisState', { strength: turn.line });
    case 'GAP_DECISION':
      return t(`gaps.decision.${turn.body.decision}`);
    case 'PUBLICATION_VERDICT':
      return turn.body.refusedBy.length === 0 ? null : t('mark.refusedBy', { checks: turn.body.refusedBy.join(' · ') });
    default:
      return null;
  }
}

/**
 * IS THIS ELEMENT FILLED — the assessment's own boolean, read defensively.
 *
 * `RoundAssessedBody.content` is `Record<string, unknown> | null` by design (A4 :1476 names the ASSESSED
 * content and spells none), so every field of it is `unknown` and is narrowed at the point of reading. An
 * element whose `filled` is absent counts as NOT filled: the count says how many the assessor CONFIRMED, and
 * a missing flag has confirmed nothing.
 */
function isFilled(element: unknown): boolean {
  return typeof element === 'object' && element !== null && (element as { filled?: unknown }).filled === true;
}

/**
 * HOW MANY OF A VERSION'S CITATIONS WERE NEVER ARGUED — §11 :431 makes this the PAGE's to compute from `body`.
 *
 * It MIRRORS `thesisPredicates.ts` :154–:158, which is UNARGUED(v): EVIDENCE and DOCUMENT mentions — "a TRAJECTORY
 * mention is never in the set, there is no argument for a trajectory", and a DOCUMENT mention IS (document flows §6 :700,
 * added at document step 33).
 *
 * IT IS THE `debateSessionId IS NULL` HALF, AND ONLY THAT HALF, WHICH IS SAID RATHER THAN GLOSSED. The
 * predicate's full test is `debateSessionId is null OR NOT ARGUED(m)`, and ARGUED is evidence A3 :1035 —
 * `DebateSession(m.debateSessionId).status = PROMOTED`, with :1036 adding that the session's record and
 * thesis must be the mention's (thesis A3 :1373–:1374 only DELEGATES to it). So a citation whose debate was
 * ABANDONED is counted here as argued and by the predicate as unargued.
 *
 * AND THE REASON NOT TO CLOSE THAT GAP IS NOT THAT THE DATA IS ABSENT — it is present. A DEBATE_CLOSED turn's
 * `thread.id` IS the `debateSessionId` these rows carry (verified on all three of run B's debates) and its
 * body carries `outcome`, so the outcome could be joined from the transcript this component already has. The
 * reason is that `since` returns a SUBSET of the turns (ui §11 :432; A4 :1476, "`since` strictly after
 * `at`"): on a delta read the VERSION turn can arrive without its DEBATE_CLOSED turn, and a count derived
 * across turns would then answer differently on the same version depending on how the page was read. A
 * number that changes with the read is worse than one that is narrowly conservative, and this one is
 * conservative in the safe direction — it can only UNDER-report what is owed, never claim a citation is
 * argued when the debate never closed.
 *
 * The envelope's own `unargued: string[]` is HEAD's and cannot serve these rows either — it is one list, and
 * using it would say the same number about four different versions, which is what the board's generator does
 * at `boards.py` :237.
 */
function unarguedOf(mentions: readonly { kind: VersionMentionRow['kind']; debateSessionId: string | null }[]): number {
  return mentions.filter((mention) => mention.kind !== 'TRAJECTORY' && mention.debateSessionId === null).length;
}

/** The platform's mark for a turn that carries one — drawn beside the row's line. */
function markOf(turn: Turn): MarkKind | null {
  if (turn.kind === 'DEBATE_CLOSED') return DEBATE_OUTCOME[turn.body.outcome];
  if (turn.kind === 'PUBLICATION_VERDICT') return PUBLICATION_OUTCOME[turn.body.outcome];
  return null;
}

/**
 * THE RESEARCHER'S OWN WORDS ON THIS TURN, or null where the turn has none beyond its line.
 *
 * Every field read here is typed `string` on its body, and every one of them is the researcher's — never a
 * model's and never the platform's. That is what makes this safe to render PLAIN: `three-voices` holds that no
 * page renders an opinion through the researcher's component, and this function cannot reach one.
 */
function researcherWords(turn: Turn): string | null {
  switch (turn.kind) {
    case 'VERSION':
      return turn.body.text;
    case 'RATIONALE':
    case 'RESPONSE':
    case 'NOTE':
      return turn.body.text;
    case 'PUBLICATION_RATIONALE':
      return turn.body.rationale;
    case 'WITHDRAWAL':
      return turn.body.reason;
    case 'GAP_DECISION':
      return turn.body.reason;
    default:
      return null;
  }
}

export function TurnRow({ turn, locale }: { turn: Turn; locale: string }) {
  const root = useTranslations();
  const t = useTranslations('research');
  const marking = useTranslations('marking');
  const [open, setOpen] = useState(false);
  const composed = composedLine(turn, t);
  const mark = markOf(turn);
  const words = researcherWords(turn);
  // ANALYSIS's line is CONSUMED by its composed phrase — drawing both would put the grade twice on one row.
  const datum = turn.kind === 'ANALYSIS' ? null : turn.line;

  const family = GLYPH_OF[turn.kind];
  const Glyph = GLYPHS[family];

  return (
    // THE TWO-COLUMN GRID OF BOARD ג3 (`boards.py` :114): a 24px rail column and the content column. The
    // rail's own segment over-hangs this row's padding at both ends, so consecutive rows join into one line.
    <li data-turn={turn.kind} className="turn-row">
      <span data-turn-glyph={family} className={`turn-rail ${RAIL_TONE[family] ?? ''}`.trim()}>
        <Glyph />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
      <p className="flex flex-wrap items-baseline gap-2 text-xs text-ink-muted">
        <b data-turn-kind className="text-ink">
          {root(TURN_KEY[turn.kind])}
        </b>
        {turn.by.voice === 'RESEARCHER' ? <bdi data-turn-handle>{turn.by.handle}</bdi> : null}
        {turn.by.voice === 'MODEL' ? <ModelVoice voice={turn.by} /> : null}
        <span data-turn-at>{formatDate(turn.at, locale)}</span>
        {mark === null ? null : <PlatformMark kind={mark} />}
      </p>
      {datum === null ? null : (
        <p data-turn-line dir="auto" className="text-sm text-ink">
          {datum}
        </p>
      )}
      {composed === null ? null : (
        <p data-turn-composed dir="auto" className="text-sm text-ink">
          {composed}
        </p>
      )}
      {/* EXPANDED IN PLACE (§11 :431), and the control's words are CALLED — `marking.expand` /
          `marking.collapse`, the freeze's own CALL rows :147–:148, never a new string. A turn with no words of
          the researcher's has nothing to open, so it draws no control: a toggle that reveals nothing is the
          dead control this step has ruled against twice. */}
      {words === null ? null : (
        <>
          <button
            type="button"
            data-turn-toggle
            aria-expanded={open}
            onClick={() => {
              setOpen((was) => !was);
            }}
            className="self-start text-xs text-ink-muted underline"
          >
            {open ? marking('collapse') : marking('expand')}
          </button>
          {open ? (
            <p data-turn-words dir="auto" className="whitespace-pre-wrap text-sm text-ink">
              {words}
            </p>
          ) : null}
        </>
      )}
      </div>
    </li>
  );
}
