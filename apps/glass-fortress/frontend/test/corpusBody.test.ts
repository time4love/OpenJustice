import { parseCorpusPages } from '@/lib/corpusBody';
import { requireSubjects } from './scan';
import { corpusStream } from './fixtures/corpus/stream';

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
