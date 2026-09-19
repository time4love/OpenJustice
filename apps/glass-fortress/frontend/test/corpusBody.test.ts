import { parseCaptureRead, parseChainAnswer, parseCorpusPages, parseDiffInput, parseResolvedRecord } from '@/lib/corpusBody';
import { requireSubjects } from './scan';
import { corpusStream } from './fixtures/corpus/stream';
import { captureRead } from './fixtures/corpus/capture';
import { diffInput } from './fixtures/corpus/diffInput';
import { resolvedRecord } from './fixtures/corpus/record';
import { chainAnswer } from './fixtures/corpus/chain';
import { chainUnavailableWire } from './fixtures/corpus/chainUnavailable';

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
const WHOLE = { trackedUrlId: 'page-one', url: 'https://example.gov/one/', public: true, first: '20211223211940', last: '20220211120000', entries: 4 };

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
      count: 6,
      thrown: ['trackedUrlId: named', 'url: named', 'public: named', 'first: named', 'last: named', 'entries: named'],
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
    expect(parseResolvedRecord(resolvedRecord)).toEqual(resolvedRecord);
    expect(parseChainAnswer(chainAnswer)).toEqual(chainAnswer);

    // A NON-EMPTY FLOOR on the two collections, because `toEqual` over empty arrays is satisfied by a
    // parser that dropped every row.
    expect(resolvedRecord.captures.length).toBeGreaterThanOrEqual(2);
    expect(resolvedRecord.citedBy.length).toBeGreaterThanOrEqual(1);
    expect(chainAnswer.available && chainAnswer.captures.length).toBeGreaterThanOrEqual(1);
    expect(diffInput.current?.chunks.length).toBeGreaterThanOrEqual(2);
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

  it('RB-3 `get_diff_input`\'s required fields name themselves; `current` MAY be null and that is the 409 state', () => {
    const fields = requireSubjects('the diff input\'s required fields', ['before', 'after', 'beforeText', 'afterText', 'awaitingDerivation', 'page']);
    for (const field of fields) {
      expect(() => parseDiffInput(dropped(diffInput as unknown as Record<string, unknown>, field))).toThrow(new RegExp(field));
    }
    // `current: null` IS A STATE AND NOT A DEFECT (A2's 409 row, §26 :856) — it must parse, not throw.
    const awaiting = parseDiffInput({ ...diffInput, current: null, awaitingDerivation: true });
    expect(awaiting.current).toBeNull();
    expect(awaiting.awaitingDerivation).toBe(true);
  });

  it('RB-4 `recomputable` AND `verified` NEVER DEFAULT — each is a claim about a record\'s integrity', () => {
    // BOTH DIRECTIONS FAIL, and for different reasons: `false` understates an integrity claim the platform
    // did make, `true` asserts a check nobody ran. Neither is a reading of the body.
    for (const field of ['recomputable', 'verified'] as const) {
      let outcome: unknown = 'not attempted';
      try {
        outcome = parseResolvedRecord(dropped(resolvedRecord as unknown as Record<string, unknown>, field));
      } catch (error) {
        outcome = (error as Error).message;
      }
      expect(outcome).toBe(`corpus body: ${field} expected a boolean, got undefined`);
    }
    // And a `kind` outside the two the corpus holds is refused by name rather than rendered as neither.
    expect(() => parseResolvedRecord({ ...resolvedRecord, kind: 'DOCUMENT' })).toThrow("kind expected 'CAPTURE' or 'DIFF'");
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
});
