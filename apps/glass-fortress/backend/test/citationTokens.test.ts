import { parseCitations } from '../src/lib/citationTokens';

// ---------------------------------------------------------------------------
// THE CITATION TOKENS IN A VERSION'S TEXT — docs/gf-thesis-flows.md A1 :1241–:1245, T2 :365–:381.
//
// `parseMentions`' SUCCESSOR (thesis refactor plan §5 :258, "step 20: tokens from text, two kinds"),
// named for the module it tests — the retired walker read TipTap JSON; this reads text. In the unit
// project, which gates (the step-18 record §7).
//
// THE GRAMMAR, as the R47 sketch §c states it: a token begins at `#ev_`, `#tr_` or `#doc_`; its body is
// the maximal run of [A-Za-z0-9] after the prefix. An `#ev_` body is exactly `0x` + 64 lowercase hex; a
// `#tr_` body is non-empty; `#doc_` is RECOGNISED and not yet citable — document plan step 33 adds the
// kind (the researcher's ruling, R47 round 2). "A token the parser cannot resolve is a refusal at the
// version write, never a plain string" (A1 :1245), so no token is ever passed over as text.
// ---------------------------------------------------------------------------

const NAME = `0x${'ab'.repeat(32)}`;
const OTHER = `0x${'cd'.repeat(32)}`;
const TRAJECTORY = 'clx9trajectory00000000001';

describe('parseCitations — the two kinds a version cites today', () => {
  it('reads an #ev_ record name and a #tr_ trajectory id, in text order', () => {
    expect(parseCitations(`כפי שהעמוד הראה #ev_${NAME} ולא שוחזר #tr_${TRAJECTORY}\n`)).toEqual({
      parsed: true,
      citations: [
        { kind: 'EVIDENCE', name: NAME },
        { kind: 'TRAJECTORY', name: TRAJECTORY },
      ],
    });
  });

  it('deduplicates per (kind, name), keeping the first occurrence — a repeated citation is ONE mention', () => {
    const text = `#ev_${OTHER} ואז #ev_${NAME} ושוב #ev_${OTHER} #tr_${TRAJECTORY} #tr_${TRAJECTORY}`;
    expect(parseCitations(text)).toEqual({
      parsed: true,
      citations: [
        { kind: 'EVIDENCE', name: OTHER },
        { kind: 'EVIDENCE', name: NAME },
        { kind: 'TRAJECTORY', name: TRAJECTORY },
      ],
    });
  });

  it('a text citing nothing parses to no citations', () => {
    expect(parseCitations('כפי שהעמוד הראה בין 9 בדצמבר 2020 ל-12 ביוני 2021\n')).toEqual({ parsed: true, citations: [] });
  });
});

describe('parseCitations — where a token ends', () => {
  it('punctuation directly after a name ends the token — a sentence-final or bracketed citation parses', () => {
    for (const text of [`נמחק (#ev_${NAME}).`, `נמחק #ev_${NAME}, ושוחזר`, `נמחק #ev_${NAME}.`]) {
      expect(parseCitations(text)).toEqual({ parsed: true, citations: [{ kind: 'EVIDENCE', name: NAME }] });
    }
  });

  it('Hebrew directly after a name ends the token', () => {
    expect(parseCitations(`#ev_${NAME}שנמחק`)).toEqual({ parsed: true, citations: [{ kind: 'EVIDENCE', name: NAME }] });
  });

  it('a Markdown heading and a hashtag are text, not tokens', () => {
    expect(parseCitations('# כותרת\n## סעיף #חיסונים #covid_19 #evidence\n')).toEqual({ parsed: true, citations: [] });
  });
});

describe('parseCitations — a token that cannot be read is never a plain string (A1 :1245)', () => {
  for (const [shape, token] of [
    ['#ev_0x followed by 63 hex', `#ev_0x${'a'.repeat(63)}`],
    ['#ev_0x followed by a non-hex character', `#ev_0xg${'a'.repeat(63)}`],
    ['#ev_ followed by nothing', '#ev_'],
    ['#ev_ with UPPERCASE hex — a name is displayed lowercase (evidence A1 :899–:901), never normalised', `#ev_0x${'AB'.repeat(32)}`],
    ['#ev_ with 64 hex and no 0x', `#ev_${'ab'.repeat(32)}`],
    ['#tr_ followed by nothing', '#tr_ '],
  ] as const) {
    it(`MALFORMED — ${shape}`, () => {
      expect(parseCitations(`כפי שהעמוד הראה ${token}\n`)).toEqual({ parsed: false, reason: 'MALFORMED', token: token.trim() });
    });
  }

  it('#doc_ is RECOGNISED — a document is not citable until document plan step 33 adds the kind', () => {
    expect(parseCitations(`המסמך #doc_${NAME} מראה`)).toEqual({ parsed: false, reason: 'DOCUMENT_NOT_BUILT', token: `#doc_${NAME}` });
  });

  it('the FIRST unreadable token in text order is the one reported, after any good citation before it', () => {
    expect(parseCitations(`#ev_${NAME} #doc_${OTHER} #ev_0x12`)).toEqual({
      parsed: false,
      reason: 'DOCUMENT_NOT_BUILT',
      token: `#doc_${OTHER}`,
    });
  });
});
