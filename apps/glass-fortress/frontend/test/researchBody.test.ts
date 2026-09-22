import {
  parseArticleRules,
  parseCaptures,
  parseDebate,
  parseEvidenceReviews,
  parseFraming,
  parseFramings,
  parsePages,
  parseRuleHistory,
  parseThesesList,
  parseThesisContext,
  parseThesisReviews,
} from '@/lib/researchBody';
import { TURN_KINDS, type TurnKind } from '@/types/research';
import { requireSubjects } from './scan';
import { thesisContextColleague, thesisContextFull, thesisContextOwed, thesisContextThin, thesisContextWithdrawn } from './fixtures/research/thesisContext';
import {
  articleRules,
  captures,
  debateRead,
  evidenceReviews,
  framingRead,
  framings,
  pages,
  ruleHistory,
  thesesList,
  thesisReviewsOwed,
  thesisReviewsEmpty,
} from './fixtures/research/reads';

// ---------------------------------------------------------------------------
// THE ELEVEN PARSERS, AND THE FIXTURE SET'S FLOORS — docs/gf-ui-refactor-plan.md UI-8 :773, §4 :956–:963.
//
// EVERY INVARIANT IS ASSERTED OFF THE PARSE, never off the fixture literal (R65's trap): a literal agrees with
// itself, so a case reading one holds the fixture rather than the contract. Each fixture below goes through
// `JSON.parse(JSON.stringify(…))` first, which is what the wire does to it — an instant becomes a string, an
// `undefined` disappears — and then through its parser.
//
// EVERY CASE TAKES ITS SUBJECT SET AS A VALUE AND FAILS ON AN EMPTY ONE (`requireSubjects`), and each carries a
// FLOOR: a count a blinded builder cannot satisfy. "≥ 17 kinds" is not a floor if the set can be one kind
// seventeen times, so the floor is on the DISTINCT kinds and on the arms within them.
// ---------------------------------------------------------------------------

/** What the wire does to a fixture before a parser ever sees it. */
const overTheWire = (value: unknown): unknown => JSON.parse(JSON.stringify(value)) as unknown;

/** A body with one member removed, by path — how a required field is made to name itself. */
function without(value: unknown, path: readonly string[]): unknown {
  const copy = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  let at: Record<string, unknown> = copy;
  for (const step of path.slice(0, -1)) at = at[step] as Record<string, unknown>;
  delete at[path[path.length - 1]];
  return copy;
}

/** A body with one member replaced, by path — how a closed union is sent a word it does not hold. */
function withInstead(value: unknown, path: readonly string[], instead: unknown): unknown {
  const copy = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  let at: Record<string, unknown> = copy;
  for (const step of path.slice(0, -1)) at = at[step] as Record<string, unknown>;
  at[path[path.length - 1]] = instead;
  return copy;
}

/** Where a kind sits in the full transcript — so a union's case names the turn it moved, not an index. */
function turnIndex(kind: TurnKind): number {
  const at = thesisContextFull.history.findIndex((turn) => turn.kind === kind);
  if (at < 0) throw new Error(`the full transcript carries no ${kind} turn`);
  return at;
}

describe('research-body — the transcript', () => {
  it('RR-1 THE FULL CONTEXT PARSES WHOLE — the control, so a throwing parser is not mistaken for a strict one', () => {
    expect(() => parseThesisContext(overTheWire(thesisContextFull))).not.toThrow();
    expect(() => parseThesisContext(overTheWire(thesisContextColleague))).not.toThrow();
    expect(() => parseThesisContext(overTheWire(thesisContextWithdrawn))).not.toThrow();
    expect(() => parseThesisContext(overTheWire(thesisContextThin))).not.toThrow();
  });

  it('RR-2 THE SET SPANS THE SEVENTEEN KINDS, off the PARSE — with the threads, the decisions and BOTH model arms', () => {
    const parsed = parseThesisContext(overTheWire(thesisContextFull));
    const kinds = new Set(requireSubjects('the full transcript', parsed.history).map((turn) => turn.kind));

    // THE FLOOR IS ON THE DISTINCT KINDS. A transcript of seventeen NOTE turns satisfies "≥ 17 turns" and
    // holds nothing, which is the vacuity R57 named.
    expect(kinds.size).toBe(TURN_KINDS.length);
    expect([...kinds].sort()).toEqual([...TURN_KINDS].sort());

    const debates = new Set(parsed.history.filter((turn) => turn.thread.step === 'DEBATE').map((turn) => turn.thread.id));
    expect(debates.size).toBeGreaterThanOrEqual(3);

    const decisions = new Set(parsed.history.flatMap((turn) => (turn.kind === 'GAP_DECISION' ? [turn.body.decision] : [])));
    expect(decisions.size).toBe(6);

    // M1 — the set carries a MODEL turn that recorded NEITHER field beside one that recorded both. The real
    // corpus has five of the first kind today (the two assessors' A2 :1317 debt), and a set that held only
    // the second would green a renderer that blanks the label's right-hand side on staging.
    const models = parsed.history.flatMap((turn) => (turn.by.voice === 'MODEL' ? [turn.by] : []));
    expect(models.length).toBeGreaterThanOrEqual(2);
    expect(models.filter((by) => by.model === null && by.promptVersion === null).length).toBeGreaterThanOrEqual(1);
    expect(models.filter((by) => by.model !== null && by.promptVersion !== null).length).toBeGreaterThanOrEqual(1);
  });

  /**
   * THE KEY SET OF EVERY BODY, PINNED PER KIND.
   *
   * A case that only checks one member passes over a builder that drops half a body, and `body: unknown` is
   * exactly the shape R66's M1 removed from the backend for this reason. The set is the appendix's, member for
   * member (A4 :1476), and a member added or lost on either side fails by kind.
   */
  const KEY_SET: Record<TurnKind, readonly string[]> = {
    FRAMING_OPENED: ['fromRunId', 'provision', 'question'],
    ROUND_PROPOSED: ['elements', 'framing', 'malformed'],
    ROUND_ASSESSED: ['content', 'malformed'],
    ROUND_CHOSEN: ['claim', 'elements', 'malformed', 'provision', 'restatedBy'],
    VERSION: ['citationsVsParent', 'claim', 'contentHash', 'mentions', 'parentVersionId', 'text'],
    DEBATE_OPENED: ['pin', 'record', 'sessionId'],
    RATIONALE: ['text'],
    ASSESSMENT: ['assessment', 'hasSubstance', 'malformed', 'objection', 'substanceGaps', 'verdict'],
    RESPONSE: ['text'],
    DEBATE_CLOSED: ['evidenceFileHash', 'outcome', 'overObjection'],
    ANALYSIS: ['analysisId', 'current', 'inputFingerprint', 'opinion'],
    GAP_DECISION: ['callItem', 'citedName', 'decision', 'description', 'earlier', 'gapId', 'reason', 'request', 'sequence'],
    PUBLICATION_RATIONALE: ['attemptId', 'rationale'],
    PUBLICATION_ASSESSMENT: ['assessment', 'attemptId', 'verdict'],
    PUBLICATION_VERDICT: ['attemptId', 'outcome', 'refusedBy'],
    WITHDRAWAL: ['reason', 'versionId'],
    NOTE: ['on', 'text'],
  };

  /**
   * THE VERSION TURN'S MENTIONS ARE THE STORED ROWS, NOT THE RESOLVED CITATIONS — RULED 2026-09-20 (R67 Q-D),
   * A4 :1476, from run B's real body: `thesisPredicates.ts` :636 selects these five and
   * `thesisTranscript.ts` :558–:566 passes the row through untouched. `V.mentions` on `head` and `published`
   * keeps the RESOLVED `{ kind, name, pin, argued }`, and the two are different shapes on one read — which is
   * why this is pinned rather than assumed.
   */
  const VERSION_MENTION_KEYS = ['contentVersionHash', 'debateSessionId', 'kind', 'name', 'versionId'];

  /** One required member per kind — removed, to make the parser name it. */
  const REQUIRED: Record<TurnKind, string> = {
    FRAMING_OPENED: 'question',
    ROUND_PROPOSED: 'malformed',
    ROUND_ASSESSED: 'malformed',
    ROUND_CHOSEN: 'restatedBy',
    VERSION: 'citationsVsParent',
    DEBATE_OPENED: 'sessionId',
    RATIONALE: 'text',
    ASSESSMENT: 'malformed',
    RESPONSE: 'text',
    DEBATE_CLOSED: 'outcome',
    ANALYSIS: 'inputFingerprint',
    GAP_DECISION: 'earlier',
    PUBLICATION_RATIONALE: 'rationale',
    PUBLICATION_ASSESSMENT: 'attemptId',
    PUBLICATION_VERDICT: 'refusedBy',
    WITHDRAWAL: 'reason',
    NOTE: 'on',
  };

  it.each(TURN_KINDS)('RR-3 %s — its body is parsed, and a required member of it NAMES ITSELF when it is gone', (kind) => {
    const turns = requireSubjects(`${kind} turns`, thesisContextFull.history.filter((turn) => turn.kind === kind));
    const one = turns[0];
    const field = REQUIRED[kind];

    // The positive control FIRST: the untouched turn parses, so the failure below is the removal's and not
    // the fixture's — and its body's KEY SET is exactly the appendix's, member for member.
    const parsed = parseThesisContext(overTheWire({ ...thesisContextFull, history: [one] }));
    expect(Object.keys(parsed.history[0].body).sort()).toEqual([...KEY_SET[kind]]);

    if (parsed.history[0].kind === 'VERSION') {
      const rows = requireSubjects('the VERSION turn`s mentions', parsed.history[0].body.mentions);
      expect(Object.keys(rows[0]).sort()).toEqual(VERSION_MENTION_KEYS);
    }

    const broken = { ...thesisContextFull, history: [without(one, ['body', field])] };
    expect(() => parseThesisContext(overTheWire(broken))).toThrow(new RegExp(`history\\[0\\]\\.body\\.${field}`));
  });

  it('RR-4 `line` IS A DATUM OR NULL, per kind — and the nine that carry none are NULL, not an empty string', () => {
    const parsed = parseThesisContext(overTheWire(thesisContextFull));
    const NULL_LINE: readonly TurnKind[] = [
      'ROUND_ASSESSED',
      'RATIONALE',
      'ASSESSMENT',
      'RESPONSE',
      'DEBATE_CLOSED',
      'PUBLICATION_RATIONALE',
      'PUBLICATION_ASSESSMENT',
      'PUBLICATION_VERDICT',
      'WITHDRAWAL',
    ];
    expect(NULL_LINE.length).toBe(9);

    for (const turn of requireSubjects('the full transcript', parsed.history)) {
      if (NULL_LINE.includes(turn.kind)) {
        expect(turn.line).toBeNull();
      } else {
        // A DATUM, and a non-empty one: a `line` of "" would draw a blank row where the kind carries a name.
        expect(typeof turn.line).toBe('string');
        expect(turn.line).not.toBe('');
      }
    }
  });

  it('RR-5 NO RESEARCHER ID ANYWHERE IN THE BODY, and `inForce` carrying one is REFUSED by name (A4 :1476)', () => {
    const parsed = parseThesisContext(overTheWire(thesisContextFull));
    expect(JSON.stringify(parsed)).not.toMatch(/researcherId/);

    const withId = JSON.parse(JSON.stringify(thesisContextFull)) as { gapList: { inForce: Record<string, unknown> }[] };
    withId.gapList[0].inForce.researcherId = 'researcher-row-1';
    expect(() => parseThesisContext(overTheWire(withId))).toThrow(/gapList\[0\]\.inForce.*researcherId/);
  });

  it('RR-6 A COLLEAGUE`S THESIS IS `mine` FALSE IN EVERY VOICE — the negative control a `mine: true` builder passes without', () => {
    const parsed = parseThesisContext(overTheWire(thesisContextColleague));
    expect(parsed.thesis.by.mine).toBe(false);

    const voices = requireSubjects(
      'the colleague transcript`s attributed voices',
      parsed.history.flatMap((turn) => (turn.by.voice === 'RESEARCHER' ? [turn.by] : turn.by.voice === 'MODEL' ? [turn.by.spentBy] : [])),
    );
    expect(voices.every((voice) => voice.mine === false)).toBe(true);
    expect(voices.every((voice) => voice.handle !== '')).toBe(true);
  });

  it('RR-7 THE WITHDRAWN AND THE THIN BODIES CARRY WHAT §13 SAYS THEY DO', () => {
    const withdrawn = parseThesisContext(overTheWire(thesisContextWithdrawn));
    expect(withdrawn.thesis.state).toEqual({ kind: 'WITHDRAWN', at: '2026-03-09T09:00:00.000Z', reason: 'הרשומה שצוטטה הוחלפה' });
    expect(withdrawn.published).toBeNull();
    expect(withdrawn.history.filter((turn) => turn.kind === 'WITHDRAWAL').length).toBe(1);

    const thin = parseThesisContext(overTheWire(thesisContextThin));
    expect(thin.history.length).toBe(1);
    expect(thin.history[0].kind).toBe('VERSION');
    expect(thin.unargued.length).toBeGreaterThanOrEqual(1);
  });

  it('RR-8 A KIND OUTSIDE THE SEVENTEEN IS REFUSED BY NAME — the closed union is closed at the boundary too', () => {
    const invented = JSON.parse(JSON.stringify(thesisContextFull)) as { history: Record<string, unknown>[] };
    invented.history[0].kind = 'ARRIVED';
    expect(() => parseThesisContext(overTheWire(invented))).toThrow(/history\[0\]\.kind/);
  });
});

describe('research-body — the framing and the debate read the SAME turns', () => {
  it('RR-9 `get_framing` parses its thread, says MALFORMED rather than `{}`, and carries no `rounds`', () => {
    const parsed = parseFraming(overTheWire(framingRead));
    expect(parsed.by.handle).not.toBe('');
    expect(new Set(parsed.turns.map((turn) => turn.kind))).toEqual(new Set(['FRAMING_OPENED', 'ROUND_PROPOSED', 'ROUND_ASSESSED', 'ROUND_CHOSEN']));

    const assessed = parsed.turns.filter((turn) => turn.kind === 'ROUND_ASSESSED');
    expect(assessed.length).toBe(1);
    // MALFORMED IS SAID. `content: {}` would be a different claim — that the round's content was read and was
    // empty — and A4 :1459 forbids smoothing one into the other.
    expect(assessed[0].kind === 'ROUND_ASSESSED' && assessed[0].body.malformed).toBe(true);
    expect(assessed[0].kind === 'ROUND_ASSESSED' && assessed[0].body.content).toBeNull();
    expect(JSON.stringify(parsed)).not.toMatch(/"rounds"|researcherId/);
  });

  it('RR-10 `get_debate` NAMES its record and carries the five debate kinds, with no raw `events`', () => {
    const parsed = parseDebate(overTheWire(debateRead));
    expect(parsed.record).toEqual({ url: 'https://example.gov/one/', capture: '20211223211940' });
    expect(parsed.turns.map((turn) => turn.kind)).toEqual(['DEBATE_OPENED', 'RATIONALE', 'ASSESSMENT', 'RESPONSE', 'DEBATE_CLOSED']);
    expect(JSON.stringify(parsed)).not.toMatch(/"events"/);

    // A record named by a fileHash alone is the shape :1144 removed — it fails here rather than rendering a
    // debate row with no page and no date.
    const unnamed = { ...debateRead, record: { capture: '20211223211940' } };
    expect(() => parseDebate(overTheWire(unnamed))).toThrow(/debate\.record\.url/);
  });
});

describe('research-body — the lists', () => {
  it('RR-11 `list_thesis_reviews`: three kinds, `owed` EQUALS the entries, every command non-empty — and the empty is an answer', () => {
    const parsed = parseThesisReviews(overTheWire(thesisReviewsOwed));
    const kinds = new Set(requireSubjects('the owed entries', parsed.reviews).map((entry) => entry.kind));
    expect(kinds).toEqual(new Set(['FLAGGED', 'STALE_TRAJECTORY', 'UNARGUED']));
    expect(parsed.owed).toBe(parsed.reviews.length);
    expect(parsed.reviews.every((entry) => entry.command !== '')).toBe(true);
    // ONE COMMAND on a thesis review (§29 :892) — not a list. The asymmetry with the evidence review below is
    // the design's, word for word.
    expect(parsed.reviews.every((entry) => typeof entry.command === 'string')).toBe(true);
    expect(parsed.reviews.some((entry) => entry.mine === false)).toBe(true);

    const empty = parseThesisReviews(overTheWire(thesisReviewsEmpty));
    expect(empty).toEqual({ owed: 0, reviews: [] });
  });

  it("RR-11b `get_thesis_context` CARRIES THIS THESIS'S OWED ENTRIES, and the parser holds the PAIRING (A4 :1476)", () => {
    const parsed = parseThesisContext(overTheWire(thesisContextOwed));
    // THE FLOOR: the body really carries entries of more than one kind, so the equalities below are not the
    // equalities of an empty list — and `owed` is a NUMBER, exactly as it is on `list_thesis_reviews` (:1523).
    const kinds = new Set(requireSubjects("the thesis's owed entries", parsed.reviews).map((entry) => entry.kind));
    expect(kinds.size).toBe(3);
    expect(parsed.owed).toBe(parsed.reviews.length);
    expect(parsed.reviews.every((entry) => entry.command !== '')).toBe(true);
    // EVERY ENTRY IS THIS THESIS'S. The read is per-thesis, so a body carrying another thesis's row is a
    // backend that answered a different question.
    expect(parsed.reviews.filter((entry) => entry.thesisId !== thesisContextOwed.thesis.thesisId)).toEqual([]);

    // THE THREE LEGAL PAIRINGS, OFF THE PARSE (A4 :1476 as amended 2026-09-22): FLAGGED { record, no date } ·
    // UNARGUED { record, date } · STALE_TRAJECTORY { no record, date }.
    expect(parsed.reviews.map((entry) => [entry.kind, entry.record === null ? 'no record' : 'record', entry.owedSince === null ? 'no date' : 'date'])).toEqual([
      ['FLAGGED', 'record', 'no date'],
      ['STALE_TRAJECTORY', 'no record', 'date'],
      ['STALE_TRAJECTORY', 'no record', 'date'],
      ['UNARGUED', 'record', 'date'],
    ]);

    // AND WHAT THE ROW IS NOT: `material`, `author` and `mine` are A4 :1523's, and every one of them costs that
    // list reads this one does not make.
    expect(JSON.stringify(parsed.reviews)).not.toMatch(/"material"|"author"|"mine"/);

    // THE PAIRING IS CHECKED, NOT MERELY THE PRESENCE. A wire the appendix does not describe fails BY NAME —
    // and a FLAGGED entry carrying a date is exactly the wire the ruling refused, because the only date that
    // read could produce is `publishedAt`, a LOWER BOUND that overstates how long the flag has been open.
    const flaggedWithADate = withInstead(thesisContextOwed, ['reviews', '0', 'owedSince'], '2026-02-10T09:00:00.000Z');
    expect(() => parseThesisContext(overTheWire(flaggedWithADate))).toThrow(/thesis context\.reviews\[0\]\.owedSince/);
    const staleWithARecord = withInstead(thesisContextOwed, ['reviews', '1', 'record'], { url: 'https://example.gov/one/', capture: '20211223211940' });
    expect(() => parseThesisContext(overTheWire(staleWithARecord))).toThrow(/thesis context\.reviews\[1\]\.record/);
    const unarguedWithNoDate = withInstead(thesisContextOwed, ['reviews', '3', 'owedSince'], null);
    expect(() => parseThesisContext(overTheWire(unarguedWithNoDate))).toThrow(/thesis context\.reviews\[3\]\.owedSince/);
    const flaggedWithNoRecord = withInstead(thesisContextOwed, ['reviews', '0', 'record'], null);
    expect(() => parseThesisContext(overTheWire(flaggedWithNoRecord))).toThrow(/thesis context\.reviews\[0\]\.record/);

    // AND THE ENTRY'S OWN FIELDS ARE STILL CHECKED, as they are on the other door.
    const noKind = withInstead(thesisContextOwed, ['reviews', '0', 'kind'], 'ARRIVED');
    expect(() => parseThesisContext(overTheWire(noKind))).toThrow(/thesis context\.reviews\[0\]\.kind/);
    const noCommand = withInstead(thesisContextOwed, ['reviews', '0', 'command'], 7);
    expect(() => parseThesisContext(overTheWire(noCommand))).toThrow(/thesis context\.reviews\[0\]\.command/);
    const noCount = withInstead(thesisContextOwed, ['owed'], 'three');
    expect(() => parseThesisContext(overTheWire(noCount))).toThrow(/thesis context\.owed/);
  });

  it('RR-12 `list_evidence_reviews`: ALL FOUR cause arms, MORE THAN ONE command, and BOTH `notEvaluable` reasons', () => {
    const parsed = parseEvidenceReviews(overTheWire(evidenceReviews));
    const review = requireSubjects('the evidence reviews', parsed.reviews)[0];
    expect(new Set(review.cause.map((cause) => cause.kind))).toEqual(new Set(['DECISION', 'EXTRACTOR', 'DIFF_VERSION', 'UNREADABLE']));
    // COMMANDS, PLURAL — §29 :892–:894 gives a thesis review ONE and the corpus-wide entries "the commands".
    expect(review.commands.length).toBeGreaterThanOrEqual(2);
    expect(review.affirmed.chunks.length).toBeGreaterThanOrEqual(1);
    expect(review.current.chunks.length).toBeGreaterThanOrEqual(1);
    expect(new Set(parsed.notEvaluable.map((row) => row.reason))).toEqual(new Set(['AWAITING_DERIVATION', 'AFFIRMED_VERSION_MISSING']));
    // A row whose record could not be resolved is NAMED, never dropped (§2g).
    expect(parsed.notEvaluable.some((row) => row.record === null)).toBe(true);
  });

  it('RR-13 `list_theses`: all four state words, `mine` both ways, and a row with no framing', () => {
    const parsed = parseThesesList(overTheWire(thesesList));
    const states = new Set(requireSubjects('the theses', parsed.theses).map((row) => row.state.kind));
    expect(states).toEqual(new Set(['DRAFT_ONLY', 'PUBLISHED_IS_HEAD', 'PUBLISHED_BEHIND', 'WITHDRAWN']));
    expect(parsed.theses.some((row) => row.mine)).toBe(true);
    expect(parsed.theses.some((row) => !row.mine)).toBe(true);
    expect(parsed.theses.some((row) => row.framingIds.length === 0)).toBe(true);

    // AT `all` BOTH KEYS ARE REQUIRED — the route fixes the scope, so a row without them is the other scope's.
    const noAuthor = { ...thesesList, theses: [without(thesesList.theses[0], ['author'])] };
    expect(() => parseThesesList(overTheWire(noAuthor))).toThrow(/theses\.theses\[0\]\.author/);
  });

  it('RR-14 `list_framings`: three `latest` types, a framing with no round, and a FOURTH type REFUSED by name', () => {
    const parsed = parseFramings(overTheWire(framings));
    const types = new Set(requireSubjects('the framings', parsed).flatMap((row) => (row.latest === null ? [] : [row.latest.type])));
    expect(types).toEqual(new Set(['PROPOSED', 'ASSESSED', 'CHOSEN']));
    expect(parsed.some((row) => row.latest === null)).toBe(true);
    expect(parsed.some((row) => row.thesisId === null)).toBe(true);
    expect(parsed.some((row) => row.claim === null)).toBe(true);

    // RULED 2026-09-20 (R67, item 6): the wire says `string` and the appendix says three words. A fourth is a
    // drift, and it says so rather than reaching a page that has no approved word for it.
    const fourth = JSON.parse(JSON.stringify(framings)) as { latest: { type: string } | null }[];
    fourth[0].latest = { type: 'WITHDRAWN', sequence: 4 } as { type: string; sequence: number };
    expect(() => parseFramings(overTheWire(fourth))).toThrow(/framings\[0\]\.latest\.type/);
  });
});

describe('research-body — the walk`s four reads', () => {
  it('RR-15 `list_pages`: a NOT PUBLIC page, a STOP PENDING, seven outcome keys — and `public` is never defaulted', () => {
    const parsed = parsePages(overTheWire(pages));
    expect(requireSubjects('the pages', parsed).some((page) => !page.public)).toBe(true);
    expect(parsed.some((page) => page.stopPending)).toBe(true);
    expect(parsed.every((page) => Object.keys(page.outcomes).length === 7)).toBe(true);

    // NOT DEFAULTED EITHER WAY: `true` would show a row the scope may not have meant, `false` would drop one
    // nobody knows to look for — and this is the field the NOT PUBLIC mark is drawn from.
    const noPublic = [without(pages[0], ['public'])];
    expect(() => parsePages(overTheWire(noPublic))).toThrow(/pages\[0\]\.public/);
  });

  it('RR-16 `list_captures`: a row per outcome, one with `stopGates`, one STALE — and a gate outside the six is refused', () => {
    const parsed = parseCaptures(overTheWire(captures));
    const outcomes = new Set(requireSubjects('the captures', parsed).map((row) => row.outcome));
    expect(outcomes.size).toBeGreaterThanOrEqual(5);
    expect(parsed.some((row) => row.stopGates !== null)).toBe(true);
    expect(parsed.some((row) => row.stale)).toBe(true);

    const badGate = JSON.parse(JSON.stringify(captures)) as { stopGates: unknown }[];
    badGate[2].stopGates = [3];
    expect(() => parseCaptures(overTheWire(badGate))).toThrow(/captures\[2\]\.stopGates\[0\]/);
  });

  it('RR-17 `get_article_rules`: `markingUrl` IS on the wire, `decisions` is a COUNT, and an ended rule is held', () => {
    const parsed = parseArticleRules(overTheWire(articleRules));
    // THE ABSENCE IS OVER SOMETHING. `no-marking-link-from-research` holds that the read view renders no
    // anchor to it — which asserts nothing unless the URL is in the body the page was given.
    expect(parsed.pendingStop?.markingUrl).toMatch(/article-rules/);
    expect(typeof parsed.decisions).toBe('number');
    expect(requireSubjects('the rules', parsed.rules).some((rule) => rule.validTo !== null)).toBe(true);
    expect(parsed.rules.some((rule) => rule.trusted)).toBe(true);
  });

  it('RR-18 `get_rule_history`: `removed` NULL and `removed` HELD are different facts, and both are carried', () => {
    const parsed = parseRuleHistory(overTheWire(ruleHistory));
    const matches = requireSubjects('the matches', parsed.matches);
    expect(matches.some((match) => match.removed === null)).toBe(true);
    expect(matches.some((match) => match.removed !== null && match.removed.length > 0)).toBe(true);
    expect(parsed.rule.decisions.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// THE CLOSED UNIONS, AND THE REQUIRED MEMBERS — one case per union and per member, each asserting that the
// refusal NAMES ITS PATH.
//
// WHY BOTH TABLES EXIST. A parser whose `oneOf` accepted any word, and a parser that defaulted a missing
// member instead of refusing it, BOTH passed 41 of 41 cases before these were written: every earlier case
// reads a fixture that is already correct, so nothing in it could tell a narrowing parser from a permissive
// one. The probes in `scratchpad/lax_parsers.py` are what make that claim measurable rather than asserted.
// ---------------------------------------------------------------------------

describe('research-body — every closed union is CLOSED, and says which one was sent a fourth word', () => {
  const UNIONS: readonly { what: string; run: () => unknown; path: RegExp }[] = [
    {
      what: 'the assessor`s verdict',
      run: () => parseThesisContext(overTheWire(withInstead(thesisContextFull, ['history', String(turnIndex('ASSESSMENT')), 'body', 'verdict'], 'MAYBE'))),
      path: /body\.verdict/,
    },
    {
      what: 'a gap decision',
      run: () =>
        parseThesisContext(overTheWire(withInstead(thesisContextFull, ['history', String(turnIndex('GAP_DECISION')), 'body', 'decision'], 'PARKED'))),
      path: /body\.decision/,
    },
    {
      what: 'a capture`s outcome',
      run: () => parseCaptures(overTheWire(withInstead(captures, ['0', 'outcome'], 'FETCHED'))),
      path: /captures\[0\]\.outcome/,
    },
    {
      what: 'the thesis state`s kind',
      run: () => parseThesisContext(overTheWire(withInstead(thesisContextFull, ['thesis', 'state', 'kind'], 'PUBLISHED_AHEAD'))),
      path: /thesis\.state\.kind/,
    },
    {
      what: 'a thread`s step',
      run: () => parseThesisContext(overTheWire(withInstead(thesisContextFull, ['history', '0', 'thread', 'step'], 'REVIEW'))),
      path: /history\[0\]\.thread\.step/,
    },
    {
      what: 'a closed debate`s outcome',
      run: () =>
        parseThesisContext(overTheWire(withInstead(thesisContextFull, ['history', String(turnIndex('DEBATE_CLOSED')), 'body', 'outcome'], 'WITHDRAWN'))),
      path: /body\.outcome/,
    },
    {
      what: 'a publication verdict`s outcome',
      run: () =>
        parseThesisContext(
          overTheWire(withInstead(thesisContextFull, ['history', String(turnIndex('PUBLICATION_VERDICT')), 'body', 'outcome'], 'DEFERRED')),
        ),
      path: /body\.outcome/,
    },
    {
      what: 'a note`s subject',
      run: () => parseThesisContext(overTheWire(withInstead(thesisContextFull, ['history', String(turnIndex('NOTE')), 'body', 'on'], 'DEBATE'))),
      path: /body\.on/,
    },
    {
      what: 'a content unit`s side',
      run: () => parseEvidenceReviews(overTheWire(withInstead(evidenceReviews, ['reviews', '0', 'affirmed', 'chunks', '0', 'side'], 'MOVED'))),
      path: /affirmed\.chunks\[0\]\.side/,
    },
    {
      what: 'a trajectory`s currency',
      run: () => parseThesisReviews(overTheWire(withInstead(thesisReviewsOwed, ['reviews', '1', 'material', 'currency', 'state'], 'RECOMPUTED_MAYBE'))),
      path: /material\.currency\.state/,
    },
    {
      what: 'a flag reason',
      run: () => parseThesisReviews(overTheWire(withInstead(thesisReviewsOwed, ['reviews', '0', 'reasons', '0'], 'UNPINNED'))),
      path: /reviews\[0\]\.reasons\[0\]/,
    },
    {
      what: 'a notEvaluable reason',
      run: () => parseEvidenceReviews(overTheWire(withInstead(evidenceReviews, ['notEvaluable', '0', 'reason'], 'NOT_PROMOTED'))),
      path: /notEvaluable\[0\]\.reason/,
    },
    {
      what: 'a voice',
      run: () => parseThesisContext(overTheWire(withInstead(thesisContextFull, ['history', '0', 'by', 'voice'], 'ASSISTANT'))),
      path: /history\[0\]\.by\.voice/,
    },
    {
      what: 'a cause`s kind',
      run: () => parseEvidenceReviews(overTheWire(withInstead(evidenceReviews, ['reviews', '0', 'cause', '0', 'kind'], 'RE_EXTRACTED'))),
      path: /cause\[0\]\.kind/,
    },
    {
      what: 'a mention`s kind',
      run: () => parseThesisContext(overTheWire(withInstead(thesisContextFull, ['head', 'mentions', '0', 'kind'], 'DOCUMENT'))),
      path: /head\.mentions\[0\]\.kind/,
    },
    {
      what: 'the analysis state',
      run: () => parseThesisContext(overTheWire(withInstead(thesisContextFull, ['analysis', 'state'], 'RECOMPUTING'))),
      path: /analysis\.state/,
    },
    {
      what: 'a review`s kind',
      run: () => parseThesisReviews(overTheWire(withInstead(thesisReviewsOwed, ['reviews', '0', 'kind'], 'ARRIVED'))),
      path: /reviews\[0\]\.kind/,
    },
    {
      what: 'a pending stop`s gate',
      run: () => parseArticleRules(overTheWire(withInstead(articleRules, ['pendingStop', 'gates', '0', 'gate'], 3))),
      path: /pendingStop\.gates\[0\]\.gate/,
    },
  ];

  it('RR-19 THERE ARE EIGHTEEN OF THEM, and the table holds every one the parsers narrow', () => {
    expect(requireSubjects('the closed unions', UNIONS).length).toBe(18);
  });

  it.each(UNIONS.map((union) => [union.what, union] as const))('RR-20 %s — a word outside it is REFUSED, naming the path', (_what, union) => {
    expect(union.run).toThrow(union.path);
  });
});

describe('research-body — a required member that is GONE names itself, and is never defaulted', () => {
  const REQUIRED: readonly { what: string; run: () => unknown; path: RegExp }[] = [
    {
      what: 'a page`s `stopPending`',
      run: () => parsePages(overTheWire([without(pages[1], ['stopPending'])])),
      path: /pages\[0\]\.stopPending/,
    },
    {
      what: 'a review`s `mine`',
      run: () => parseThesisReviews(overTheWire({ ...thesisReviewsOwed, reviews: [without(thesisReviewsOwed.reviews[0], ['mine'])] })),
      path: /reviews\[0\]\.mine/,
    },
    {
      what: 'a turn`s `line`',
      run: () => parseThesisContext(overTheWire({ ...thesisContextFull, history: [without(thesisContextFull.history[0], ['line'])] })),
      path: /history\[0\]\.line/,
    },
    {
      what: 'one of the seven outcome counts',
      run: () => parsePages(overTheWire([without(pages[0], ['outcomes', 'SKIPPED'])])),
      path: /pages\[0\]\.outcomes\.SKIPPED/,
    },
    {
      what: 'the owed count',
      run: () => parseThesisReviews(overTheWire(without(thesisReviewsOwed, ['owed']))),
      path: /reviews\.owed/,
    },
    {
      what: 'a pending stop`s `markingUrl`',
      run: () => parseArticleRules(overTheWire(without(articleRules, ['pendingStop', 'markingUrl']))),
      path: /pendingStop\.markingUrl/,
    },
    {
      what: 'a record named by neither a capture nor a pair',
      run: () => parseDebate(overTheWire({ ...debateRead, record: { url: 'https://example.gov/one/' } })),
      path: /debate\.record/,
    },
    {
      // `mine` DEFAULTED TO FALSE IS THE ONE DEFAULT THE COLLEAGUE CONTROL CANNOT SEE: RR-6 asserts every
      // voice on a COLLEAGUE'S thesis reads false, which is exactly what a default-false answers. The author's
      // own thesis then reads as someone else's — the commands labelled as another's on the reader's own work
      // (§13 :480) — and no case above would have moved.
      what: 'the thesis author`s `mine` on the context read',
      run: () => parseThesisContext(overTheWire(without(thesisContextFull, ['thesis', 'by', 'mine']))),
      path: /thesis context\.thesis\.by\.mine/,
    },
    {
      what: 'a theses-list row`s `mine`',
      run: () => parseThesesList(overTheWire({ ...thesesList, theses: [without(thesesList.theses[0], ['mine'])] })),
      path: /theses\.theses\[0\]\.mine/,
    },
  ];

  it('RR-21 THERE ARE NINE OF THEM, each a member a page would otherwise draw a default for', () => {
    expect(requireSubjects('the required members', REQUIRED).length).toBe(9);
  });

  it.each(REQUIRED.map((member) => [member.what, member] as const))('RR-22 %s — its absence is REFUSED, naming the path', (_what, member) => {
    // `line` IS NULLABLE AND STILL REQUIRED: null says "this kind carries no datum", and absent says nothing
    // at all. A parser that read the second as the first would draw a blank row for a kind that has a name.
    expect(member.run).toThrow(member.path);
  });
});
