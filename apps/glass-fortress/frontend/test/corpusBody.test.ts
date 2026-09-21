import { parseCaptureRead, parseChainAnswer, parseClaims, parseCorpusPages, parseDiffInput, parseResolvedRecord } from '@/lib/corpusBody';
import type { ResolvedRecord } from '@/types/corpus';
import { requireSubjects } from './scan';
import { corpusStream } from './fixtures/corpus/stream';
import { captureRead } from './fixtures/corpus/capture';
import { diffInput } from './fixtures/corpus/diffInput';
import { resolvedCaptureRecord, resolvedDiffRecord } from './fixtures/corpus/record';
import { chainAnswer } from './fixtures/corpus/chain';
import { chainUnavailableWire } from './fixtures/corpus/chainUnavailable';
import { claimsAnswer, claimsUndetected } from './fixtures/corpus/claims';

// ---------------------------------------------------------------------------
// corpus-body — docs/gf-ui-flows.md §8 :331–:333 ("bytes, not views"), §28 :792 (the facet), §27 (the gated
// twin and its NOT PUBLIC mark); UI plan §4 :880–:883.
//
// THE `public` NARROWING IS A DISCLOSURE CONTROL AND IT WAS HELD BY NOTHING. The parser's own docblock says a
// missing `public` "must FAIL rather than default to `false` … or to `true`", and that sentence was true of the
// code and asserted nowhere: the reviewer changed `flag(row.public, …)` so a missing field defaulted to `true`
// and every one of `pages-list-reads-public-only`'s seven cases stayed GREEN.
//
// WHY IT IS INVISIBLE TODAY AND DANGEROUS TOMORROW. §28 says `public` is "always true at `public`", so at THIS
// door the field cannot be missing and a default cannot bite. But UI-8 renders the same component at `all`,
// where `public` is the field that CARRIES the NOT PUBLIC mark — and a default of `true` there silently
// publishes a surveyed page. That is the §9.5 leak one step removed: through the PARSER rather than through the
// read, which is the half `pages-list-reads-public-only` cannot see because it stages bodies that already have
// the field.
//
// BOTH DEFAULTS MUST FAIL, AND FOR DIFFERENT REASONS — which is why this case asserts a THROW and not a value.
// `true` publishes what was not opened. `false` drops a row the scope meant to show, and a row silently missing
// from a list is a row nobody knows to look for. Neither is a reading of the body; both are a guess about it.
// ---------------------------------------------------------------------------

/** A facet row the appendix fully specifies (§28 :792), used whole and then damaged one field at a time. */
const WHOLE = { trackedUrlId: 'page-one', url: 'https://example.gov/one/', public: true, first: '20211223211940', last: '20220211120000', entries: 4, shape: null };

/** The same row as a read that NAMES this page answers it — §28's `shape`, in days and never in pixels. */
const WITH_SHAPE = {
  ...WHOLE,
  shape: {
    captures: [{ day: '20211223', count: 2, cited: true }],
    diffs: [{ before: '20211223', after: '20220211', count: 1, chunks: 5, passed: false }],
  },
};

const without = (field: keyof typeof WHOLE): Record<string, unknown> => {
  const row: Record<string, unknown> = { ...WHOLE };
  delete row[field];
  return row;
};

describe('corpus-body', () => {
  it('THE WHOLE FACET PARSES, field for field — the control, so a throwing parser is not mistaken for a strict one', () => {
    const parsed = requireSubjects('the parsed facet', parseCorpusPages({ entries: [], pages: [WHOLE], nextCursor: null }));
    expect(parsed).toEqual([WHOLE]);
    // And the fixture the whole suite leans on parses too: a fixture that its own parser rejects is a fixture
    // every later case is green over for the wrong reason.
    expect(parseCorpusPages(corpusStream)).toHaveLength(corpusStream.pages.length);
  });

  it('THE `shape` PARSES IN FULL — the bins are read as the wire sends them, in DAYS and with their counts', () => {
    const parsed = requireSubjects('the parsed facet', parseCorpusPages({ entries: [], pages: [WITH_SHAPE], nextCursor: null })).at(0);
    expect(parsed).toEqual(WITH_SHAPE);
    // AND THE DAYS STAY EIGHT DIGITS. `timeStrip.dayOf` slices `0..8`, so a parser that "helpfully" widened a
    // day to the 14-digit archive name would still position every mark correctly and would still be a drift.
    expect({
      day: parsed?.shape?.captures.at(0)?.day.length,
      before: parsed?.shape?.diffs.at(0)?.before.length,
      // THE TWO FIELDS A DEFAULT WOULD HAVE DECIDED SILENTLY: a bin's count and its gate verdict.
      count: parsed?.shape?.captures.at(0)?.count,
      passed: parsed?.shape?.diffs.at(0)?.passed,
    }).toEqual({ day: 8, before: 8, count: 2, passed: false });
  });

  it('A MISSING `shape` THROWS — `null` is a read that named no page, an ABSENT key is a body that drifted', () => {
    // THE TWO ARE DIFFERENT FACTS AND THE PARSER MAY NOT CONFLATE THEM. §28 makes `shape` null on every row of
    // a read that names no page, and region 0 draws no strip — so `null` must parse. A body that STOPPED
    // sending the field would then read as "no page was named" on a single-page view, and region 3 would
    // vanish with nothing said: the silent half this module exists to refuse.
    //
    // MEASURED ON THE RUNNING BACKEND, both arms: `?page=<corona>` answers a `shape` object, and the bare read
    // answers the key with `null` in it. Neither omits it.
    expect(() => parseCorpusPages({ entries: [], pages: [without('shape')], nextCursor: null })).toThrow('pages[0].shape expected an object');
    // THE CONTROL: `null` is accepted, so the throw above is about the key and not about the field.
    expect(requireSubjects('the parsed facet', parseCorpusPages({ entries: [], pages: [WHOLE], nextCursor: null })).at(0)?.shape).toBeNull();
  });

  it('A MISSING `public` THROWS AND NAMES THE FIELD — it never defaults to `true`, which would publish a surveyed page', () => {
    // The reviewer's plant, one way. At UI-8's `all` scope this is the §9.5 leak through the parser.
    expect(() => parseCorpusPages({ entries: [], pages: [without('public')], nextCursor: null })).toThrow('pages[0].public expected a boolean');
  });

  it('A MISSING `public` NEVER DEFAULTS TO `false` EITHER — a row silently dropped is a row nobody knows to look for', () => {
    // The plant the other way. The assertion is the same THROW, and that is the point: the parser may not
    // choose between the two harms, because choosing either is a guess about a body it was given to read.
    let parsed: unknown = 'not attempted';
    try {
      parsed = parseCorpusPages({ entries: [], pages: [without('public')], nextCursor: null });
    } catch (error) {
      parsed = (error as Error).message;
    }
    expect(parsed).toBe('corpus body: pages[0].public expected a boolean, got undefined');
  });

  it('EVERY OTHER FIELD OF THE FACET IS REQUIRED TOO, each naming itself — so a drift fails loudly at the read', () => {
    // The subject set is the row's own fields, through the vacuity guard: a loop over nothing asserts nothing,
    // and a field ADDED to the appendix without a case here shows up as a count that no longer matches.
    const fields = requireSubjects('the facet row fields', Object.keys(WHOLE) as (keyof typeof WHOLE)[]);
    const thrown = fields.map((field) => {
      try {
        parseCorpusPages({ entries: [], pages: [without(field)], nextCursor: null });
        return `${field}: NO THROW`;
      } catch (error) {
        return (error as Error).message.includes(`pages[0].${field}`) ? `${field}: named` : `${field}: threw without naming itself`;
      }
    });
    expect({ count: fields.length, thrown }).toEqual({
      count: 7,
      thrown: ['trackedUrlId: named', 'url: named', 'public: named', 'first: named', 'last: named', 'entries: named', 'shape: named'],
    });
  });

  it('A BODY WITH NO `pages` FACET THROWS — the pages list has no other legal source, so an absent facet is not an empty list', () => {
    // §24 :680: the facet is the list's ONLY legal source. An absent facet read as `[]` would render region
    // 5's "no page is open yet" — a SENTENCE ABOUT THE CORPUS — over what is really a broken read.
    expect(() => parseCorpusPages({ entries: [], nextCursor: null })).toThrow('pages expected an array');
  });
});

// ---------------------------------------------------------------------------
// THE RECORD PAGES' BODIES — evidence A4 :1082 (`get_capture`), :1095–:1099 (`get_diff_input`),
// :1105–:1109 (`resolve_record`), :1111–:1115 (`check_on_chain_status`).
//
// EVERY CASE READS AN APPENDIX FIXTURE AND NOT A HAND-BUILT OBJECT. A parser case that built its own input
// asserts the parser against the case author's reading, which is the same author as the parser's — the
// "fixture written from the same wrong reading as the code" defect, twice paid for in this step.
//
// AND EACH PARSER IS EXERCISED THROUGH ITS OWN FIXTURE, whole, BEFORE any field is damaged. A suite of
// damage-cases alone is satisfied by a parser that throws on everything.
// ---------------------------------------------------------------------------

/** A body with one field removed, named, so a case damages exactly one thing at a time. */
const dropped = (body: Record<string, unknown>, field: string): Record<string, unknown> => {
  const copy: Record<string, unknown> = { ...body };
  delete copy[field];
  return copy;
};

describe('corpus-body — the record pages\' bodies', () => {
  it('RB-1 EVERY APPENDIX FIXTURE PARSES WHOLE, field for field — the control, so a throwing parser is not mistaken for a strict one', () => {
    expect(parseCaptureRead(captureRead)).toEqual(captureRead);
    expect(parseDiffInput(diffInput)).toEqual(diffInput);
    expect(parseResolvedRecord(resolvedCaptureRecord)).toEqual(resolvedCaptureRecord);
    expect(parseResolvedRecord(resolvedDiffRecord)).toEqual(resolvedDiffRecord);
    expect(parseChainAnswer(chainAnswer)).toEqual(chainAnswer);

    // A NON-EMPTY FLOOR on every collection, because `toEqual` over empty arrays is satisfied by a
    // parser that dropped every row.
    const captureArm = resolvedCaptureRecord.verified;
    expect('captures' in captureArm && captureArm.captures.length).toBeGreaterThanOrEqual(1);
    expect(resolvedCaptureRecord.citedBy.length).toBeGreaterThanOrEqual(1);
    expect(resolvedDiffRecord.citedBy.length).toBeGreaterThanOrEqual(1);
    expect(chainAnswer.available && chainAnswer.captures.length).toBeGreaterThanOrEqual(1);
    expect(diffInput.current.chunks.length).toBeGreaterThanOrEqual(2);
  });

  it('RB-2 EVERY REQUIRED FIELD OF `get_capture` NAMES ITSELF when it is missing', () => {
    const fields = requireSubjects('the capture read\'s top-level fields', ['page', 'capture', 'text', 'textHash', 'current']);
    const thrown = fields.map((field) => {
      try {
        parseCaptureRead(dropped(captureRead as unknown as Record<string, unknown>, field));
        return `${field}: NO THROW`;
      } catch (error) {
        return (error as Error).message.includes(field) ? `${field}: named` : `${field}: threw without naming itself`;
      }
    });
    expect({ count: fields.length, thrown }).toEqual({
      count: 5,
      thrown: ['page: named', 'capture: named', 'text: named', 'textHash: named', 'current: named'],
    });
  });

  it('RB-3 `get_diff_input`: endpoints are OBJECTS, `current` is required, the page has no id, and the row`s three fields are the stream`s', () => {
    // THE ENVELOPE, not the field list. A4 :1096's amendment exists because the clause named the FIELDS and
    // this parser was written from that naming: `before`/`after` as bare timestamps, the texts beside them as
    // `beforeText`/`afterText`, a nullable `current` and an `awaitingDerivation` flag. Every one of those
    // parsed the fixture and none of them is what the route sends.
    expect(parseDiffInput(diffInput)).toEqual(diffInput);

    // A BARE TIMESTAMP WHERE AN ENDPOINT BELONGS MUST FAIL — that is precisely the old reading, so a parser
    // that still accepted it would be one this case could not tell from a repaired one.
    expect(() => parseDiffInput({ ...diffInput, before: '20211223211940' })).toThrow('before expected an object');

    const fields = requireSubjects("the diff input's top-level fields", ['page', 'before', 'after', 'current']);
    const thrown = fields.map((field) => {
      try {
        parseDiffInput(dropped(diffInput as unknown as Record<string, unknown>, field));
        return `${field}: NO THROW`;
      } catch (error) {
        return (error as Error).message.includes(field) ? `${field}: named` : `${field}: threw without naming itself`;
      }
    });
    expect({ count: fields.length, thrown }).toEqual({
      count: 4,
      thrown: ['page: named', 'before: named', 'after: named', 'current: named'],
    });

    // `current` IS NOT NULLABLE AND NULL IS NOT THE 409. The refusal is `{ error, code }` at 409 and never
    // reaches a parser (ui §6 :267; `getDiffInput.ts` :114-:121 returns it before the body is built), so a
    // null read as "awaiting derivation" would render that state over a body that is merely broken.
    expect(() => parseDiffInput({ ...diffInput, current: null })).toThrow('current expected an object');

    // Each nested field names itself THROUGH its endpoint, so a drift says which side moved.
    expect(() => parseDiffInput({ ...diffInput, after: dropped(diffInput.after as unknown as Record<string, unknown>, 'text') })).toThrow('after.text');
    expect(() => parseDiffInput({ ...diffInput, current: dropped(diffInput.current as unknown as Record<string, unknown>, 'diffVersion') })).toThrow('current.diffVersion');

    // `survival` IS READ AND DROPPED, DELIBERATELY — and nothing said so until this assertion. Every real
    // body carries it on both routes (measured on the running route, an 8-character verdict) while no clause
    // of §26 or the UI plan renders it, so the parser narrows to what a page uses. The fixture's SILENCE about
    // a field the wire always sends is not agreement; this is where the drop is stated.
    const withSurvival = parseDiffInput({
      ...diffInput,
      current: { ...diffInput.current, chunks: [{ side: 'REMOVED', text: '\u05e0\u05d2\u05e8\u05e2', survival: 'SURVIVED' }] },
    });
    expect(withSurvival.current.chunks.at(0)).toEqual({ side: 'REMOVED', text: '\u05e0\u05d2\u05e8\u05e2' });
    expect(withSurvival.current.chunks.at(0)).not.toHaveProperty('survival');

    // THE DIFF ROW'S OWN THREE FIELDS — ruled 2026-09-20 (A4 :1096), and narrowed by the SAME functions the
    // stream's rows use. A second spelling here could accept an opinion the stream refuses, and the two
    // surfaces would then disagree about one record while both looked correct.
    const parsedWhole = parseDiffInput(diffInput);
    expect(parsedWhole.opinion).toEqual(diffInput.opinion);
    expect(parsedWhole.narrowed).toBe(false);
    expect(parsedWhole.evidence).toEqual(diffInput.evidence);
    // EACH IS REQUIRED: `narrowed` is a claim about what intervened, so a missing one may not read as `false`.
    expect(() => parseDiffInput(dropped(diffInput as unknown as Record<string, unknown>, 'narrowed'))).toThrow('narrowed');
    // AND THE TWO NULLABLE ONES PARSE AS NULL rather than as an absence nobody noticed.
    const bare = parseDiffInput({ ...diffInput, opinion: null, evidence: null });
    expect({ opinion: bare.opinion, evidence: bare.evidence }).toEqual({ opinion: null, evidence: null });
    // A MALFORMED OPINION IS REFUSED BY NAME, through the stream's own narrowing.
    expect(() => parseDiffInput({ ...diffInput, opinion: { ...diffInput.opinion, draws: 'two' } })).toThrow('opinion.draws');

    // THE PAGE IS `{ url, public }` AND CARRIES NO `trackedUrlId`: the reader asked with the id, so the route
    // does not send it back. A parser that required it threw on every REAL body while every fixture-fed case
    // stayed green — the third defect of this envelope, and the one no field list would have shown.
    expect(diffInput.page).not.toHaveProperty('trackedUrlId');
    expect(parseDiffInput(diffInput).page).toEqual({ url: diffInput.page.url, public: true });
  });

  it('RB-4 `resolve_record` reports VERIFIED and FLAGGED, never bits; both `record` arms and both `verified` arms parse', () => {
    const arms = requireSubjects('the resolved-record arms', [resolvedCaptureRecord, resolvedDiffRecord]);
    const armAt = (index: number): ResolvedRecord => {
      const arm = arms.at(index);
      if (arm === undefined) throw new Error(`RB-4: no arm at ${String(index)} — the fixture set no longer spans the contract`);
      return arm;
    };

    // THE FLOOR, BEFORE ANYTHING IS PARSED. `verified` and `record` are each a union, and a fixture set that
    // lost an arm would leave this case reading one shape twice and reporting it as coverage.
    expect(arms).toHaveLength(2);
    expect([armAt(0).kind, armAt(1).kind]).toEqual(['CAPTURE', 'DIFF']);
    expect('capture' in armAt(0).record).toBe(true);
    expect('before' in armAt(1).record).toBe(true);
    expect('captures' in armAt(0).verified).toBe(true);
    expect('notEvaluable' in armAt(1).verified).toBe(true);
    for (const arm of arms) expect(parseResolvedRecord(arm)).toEqual(arm);

    // VERIFIED IS NOT A BIT. Read as a boolean it parses and silently loses every per-capture attribution —
    // the marks §26 :859 requires the record page to show.
    expect(() => parseResolvedRecord({ ...resolvedCaptureRecord, verified: true })).toThrow('verified');
    // FLAGGED IS NOT A BIT EITHER (A3 :1054): the report names the arms actually asked, and a check that
    // examined nothing must say so rather than passing.
    const bitFlagged = resolvedCaptureRecord.citedBy.map((one) => ({ ...one, flagged: false }));
    expect(() => parseResolvedRecord({ ...resolvedCaptureRecord, citedBy: bitFlagged })).toThrow('citedBy[0].flagged');

    // `notEvaluable` NARROWS to `evidencePredicates.ts` :566's three reasons — the opposite call from
    // `armsEvaluated`/`reasons`, which stay open. A fourth reason is a body this page cannot render, so it
    // fails by name rather than arriving as an unshown string.
    expect(() => parseResolvedRecord({ ...resolvedDiffRecord, verified: { notEvaluable: 'SOMETHING_ELSE' } })).toThrow('verified.notEvaluable');

    // A CAPTURE NOTHING HAS CHECKED IS NOT A CAPTURE THAT FAILED: every stored-verdict field may be null and
    // each parses as null, never as "no".
    const evaluable = resolvedCaptureRecord.verified;
    if (!('captures' in evaluable)) throw new Error('RB-4: the CAPTURE fixture must carry the evaluable arm');
    const anchored = evaluable.captures.at(0);
    if (anchored === undefined) throw new Error('RB-4: the evaluable arm must carry at least one capture');
    const unchecked = parseResolvedRecord({
      ...resolvedCaptureRecord,
      verified: {
        verified: false,
        captures: [{ ...anchored, anchoredHash: null, attributed: null, verdict: null, verifierVersion: null, checkedAt: null }],
      },
    });
    if (!('captures' in unchecked.verified)) throw new Error('RB-4: the parsed arm must still be the evaluable one');
    expect(unchecked.verified.captures.at(0)?.checkedAt).toBeNull();
    expect(unchecked.verified.captures.at(0)?.attributed).toBeNull();

    // `recomputable` NEVER DEFAULTS — it is a claim about a record's integrity, and `false` understates a
    // check that ran while `true` asserts one that did not.
    let outcome: unknown = 'not attempted';
    try {
      outcome = parseResolvedRecord(dropped(resolvedCaptureRecord as unknown as Record<string, unknown>, 'recomputable'));
    } catch (error) {
      outcome = (error as Error).message;
    }
    expect(outcome).toBe('corpus body: recomputable expected a boolean, got undefined');

    // A `kind` outside the two the corpus holds is refused by name rather than rendered as neither.
    expect(() => parseResolvedRecord({ ...resolvedCaptureRecord, kind: 'DOCUMENT' })).toThrow("kind expected 'CAPTURE' or 'DIFF'");

    // THE PAGE CARRIES ITS ID HERE AND ON NO OTHER RECORD READ — ruled 2026-09-20 (A4 :1106). A stranger
    // arrives by the record's NAME and holds no page id, so the one link onward (§26 :860) has no other
    // source. `get_capture` and `get_diff_input` keep `{ url, public }`: their reader named the page.
    expect(parseResolvedRecord(resolvedCaptureRecord).page).toEqual({
      trackedUrlId: resolvedCaptureRecord.page.trackedUrlId,
      url: resolvedCaptureRecord.page.url,
      public: true,
    });
    expect(() =>
      parseResolvedRecord({ ...resolvedCaptureRecord, page: { url: resolvedCaptureRecord.page.url, public: true } }),
    ).toThrow('page.trackedUrlId');

    // THE THREE FIELDS THE ROUTE HAS NEVER SENT, asserted absent so a fixture cannot quietly reintroduce them.
    for (const invented of requireSubjects('the invented fields', ['first', 'last', 'captures'])) {
      expect(resolvedCaptureRecord).not.toHaveProperty(invented);
    }
    expect(resolvedCaptureRecord.citedBy.at(0)).not.toHaveProperty('publishedAt');
  });

  it('RB-5 CHAIN_UNAVAILABLE NARROWS INTO THE UNION from the WIRE\'s spelling, and is never raised', () => {
    // THE WIRE, not the frontend's discriminant: the route sends `{ error, code }` at 503. A parser reading
    // an `available` field off the body would be reading something no route sends — and would then treat a
    // real 503 as a malformed success.
    expect(chainUnavailableWire).toHaveProperty('code', 'CHAIN_UNAVAILABLE');
    expect(chainUnavailableWire).not.toHaveProperty('available');

    const parsed = parseChainAnswer(chainUnavailableWire);
    expect(parsed).toEqual({ available: false, reason: 'CHAIN_UNAVAILABLE' });
    // IT DOES NOT THROW: a renderer reaching this through a `catch` would report a failed RECORD, when the
    // only thing that failed is the CHECK (A4 :1115).
    expect(() => parseChainAnswer(chainUnavailableWire)).not.toThrow();
  });

  it('RB-6 A STORED VERDICT MAY BE NULL AND IS NEVER READ AS "no"; a missing capture field names itself', () => {
    if (!chainAnswer.available) throw new Error('the chain fixture must be the available arm');
    const never = parseChainAnswer({ ...chainAnswer, captures: [{ ...chainAnswer.captures[0], storedVerdict: null }] });
    expect(never.available && never.captures[0]?.storedVerdict).toBeNull();

    const fields = requireSubjects('a chain capture\'s required fields', ['capture', 'documentHash', 'isRegistered', 'attributed', 'anchoredHashMatchesDocumentHash']);
    for (const field of fields) {
      const damaged = { ...chainAnswer, captures: [dropped(chainAnswer.captures[0] as unknown as Record<string, unknown>, field)] };
      expect(() => parseChainAnswer(damaged)).toThrow(new RegExp(`captures\\[0\\]\\.${field}`));
    }
  });

  /**
   * RB-7 — `list_trajectories`' body, §6.1 :248.
   *
   * THE THREE INVARIANTS ARE THE WIRE'S, not the fixture's. They are what makes `captures` and `changes` two
   * accounts of ONE history rather than two facts that may disagree, and each is a property a hand-written
   * fixture gets wrong: the file this set replaces declared `transitions: 3` over three spans and put two
   * ABSENT spans next to each other, and no page ever read it, so nothing said so for five days.
   *
   * THE FLOOR IS OVER THE SET AND OVER EACH ROW. `requireSubjects` refuses an empty set; the arm assertions
   * refuse a set that no longer spans the contract; and the per-row floors refuse a row degenerate enough to
   * satisfy the invariants vacuously — a single-span row alternates trivially and sums trivially.
   */
  it('RB-7 the claims body: both accounts of one history, and the three invariants the wire holds', () => {
    expect(parseClaims(claimsAnswer)).toEqual(claimsAnswer);
    expect(parseClaims(claimsUndetected)).toEqual(claimsUndetected);

    // THE INVARIANTS ARE READ OFF WHAT THE PARSER RETURNS, never off the fixture literal beside it. Read off
    // the literal they are a claim about a file; read off the parse they are a claim about what a CALLER
    // gets, which is the only version a page depends on. Found by the stub decoy: against a `parseClaims`
    // that narrowed nothing, every invariant below still passed, because the fixture it was reading was
    // valid — a case green about a parser it had never exercised.
    const rows = requireSubjects('the claims fixture set', parseClaims(claimsAnswer).entries);
    expect(rows.length).toBeGreaterThanOrEqual(4);

    // THE SET SPANS THE CONTRACT — removed-and-never-restored, present, multi-flip, a group, and the empty
    // page. Asserted BEFORE the invariants, so a set that lost an arm is a red case and not a quieter one.
    expect(rows.some((row) => row.finalState === 'REMOVED' && row.captures.at(-1)?.present === false)).toBe(true);
    expect(rows.some((row) => row.finalState === 'PRESENT')).toBe(true);
    expect(rows.some((row) => row.transitions >= 5)).toBe(true);
    expect(rows.some((row) => row.claimCount > 1 && row.claims.length > 1)).toBe(true);
    expect(rows.some((row) => row.changes.some((one) => one.days === null))).toBe(true);
    expect(claimsUndetected.undetected.length).toBeGreaterThanOrEqual(1);

    // THE FLOOR THAT MAKES THE THIRD INVARIANT MEAN SOMETHING, and it belongs to the SET and not to a row.
    // A row whose every span holds exactly one capture is legitimate — a claim that flipped at every
    // capture — and on it `sum(changes[].captures) === captures.length` is true of any two equal-length
    // lists. At least one row must carry a span COVERING several captures, or the invariant is satisfied by
    // a `captures` vector that is merely the spans renamed, which is the reading §6.1 :248 exists to reject.
    expect(rows.some((row) => row.changes.some((one) => one.captures > 1))).toBe(true);
    expect(rows.some((row) => row.captures.length > row.changes.length)).toBe(true);

    for (const row of rows) {
      // A VACUITY FLOOR PER ROW: a single span alternates trivially and sums trivially.
      expect(row.changes.length).toBeGreaterThanOrEqual(3);

      // (1) a span per state, from the first capture on.
      expect(row.changes.length).toBe(row.transitions + 1);
      // (2) adjacent spans alternate — two spans in one state is a run that was not maximal.
      expect(row.changes.filter((one, index) => index > 0 && one.present === row.changes.at(index - 1)?.present)).toEqual([]);
      // (3) the spans account for exactly the captures in the vector.
      expect(row.changes.reduce((total, one) => total + one.captures, 0)).toBe(row.captures.length);
      // AND THE TWO AGREE ON WHERE: a span starts at a capture the vector holds, in the same state.
      for (const one of row.changes) {
        expect(row.captures.find((capture) => capture.waybackTimestamp === one.waybackTimestamp)?.present).toBe(one.present);
      }
      // `finalState` IS THE LATEST CAPTURE'S STATE, which is what the row's word tells a reader.
      expect(row.captures.at(-1)?.present).toBe(row.finalState === 'PRESENT');
    }
  });

  it('RB-8 EVERY REQUIRED FIELD OF A CLAIMS ROW NAMES ITSELF, and `days` is nullable where nothing else is', () => {
    const fields = requireSubjects('a trajectory row\'s required fields', [
      'patternHash',
      'sourceStateHash',
      'transitions',
      'firstSeen',
      'lastSeen',
      'finalState',
      'claimCount',
      'captures',
      'changes',
      'claims',
      'page',
    ]);
    const row = claimsAnswer.entries[0] as unknown as Record<string, unknown>;
    for (const field of fields) {
      expect(() => parseClaims({ ...claimsAnswer, entries: [dropped(row, field)] })).toThrow(new RegExp(`entries\\[0\\]\\.${field}`));
    }

    // `undetected` IS REQUIRED: without it an empty list cannot be told from a page nothing was tracked on.
    expect(() => parseClaims(dropped(claimsAnswer as unknown as Record<string, unknown>, 'undetected'))).toThrow('undetected');

    // `finalState` IS A CLOSED UNION AND NOT MERELY A STRING. A row's whole word to the reader is drawn
    // from it — `corpus.claims.present` or `corpus.claims.absent` — so a third value must fail HERE, loudly
    // and by name, rather than reach a page that would draw "absent" for anything that is not "PRESENT".
    // The reasons are `claimTrajectory.ts`' own two, and a fourth arriving is a body that moved.
    expect(() => parseClaims({ ...claimsAnswer, entries: [{ ...row, finalState: 'GONE' }] })).toThrow('entries[0].finalState');

    // `days` IS THE ONE NULLABLE FIGURE, and a missing one is NOT read as zero.
    const spans = claimsAnswer.entries[0]?.changes ?? [];
    const nulled = { ...claimsAnswer, entries: [{ ...claimsAnswer.entries[0], changes: spans.map((one) => ({ ...one, days: null })) }] };
    expect(parseClaims(nulled).entries[0]?.changes.every((one) => one.days === null)).toBe(true);
    // Its NEIGHBOURS are not nullable — a span with no count is a span that says nothing about its run.
    expect(() => parseClaims({ ...claimsAnswer, entries: [{ ...claimsAnswer.entries[0], changes: [dropped(spans[0] as unknown as Record<string, unknown>, 'captures')] }] })).toThrow(
      'changes[0].captures',
    );
  });
});
