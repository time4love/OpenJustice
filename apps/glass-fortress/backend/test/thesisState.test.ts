import { publicationState, thesisState } from '../src/lib/thesisView';

// ---------------------------------------------------------------------------
// THE THESIS'S STATE, AS ONE UNION — docs/gf-thesis-flows.md A4 :1429 and :1476, the envelope RULED 2026-09-20
// (the researcher, R66 „Q1 transcript approved”); docs/gf-ui-flows.md §11 :398–:399, the four state WORDS.
//
// WHY THIS EXISTS AT ALL. §11 gives a thesis four states — DRAFT ONLY · PUBLISHED = HEAD · PUBLISHED ≠ HEAD (n) ·
// WITHDRAWN on <date> — and as served on 2026-09-20 NO FIELD carried them: `headIsPublished` covers two arms,
// `versionsAhead` was computed by `publicationState` and never sent, and a withdrawal was named by nothing. A page
// would have had to derive the word from `headIsPublished` plus a count plus a row it could not see, which is the
// second spelling this repository names as its own dominant defect. The ruling puts the union on the wire, and BOTH
// gated reads answer the SAME one: `get_thesis_context` (A4 :1476) and `list_theses` (A4 :1429).
//
// IT IS PURE, AND IT STAYS PURE. `lib/thesisView.ts` imports no client; it takes the `PublicationState` its caller
// already computed and the latest withdrawal ROW, and decides. A pure module never gains a dependency (the
// researcher, 2026-09-11) — the module holding the client depends on this one, never the other way.
//
// THE ORDER OF THE ARMS IS THE RULING'S, and the third case is why it is not arbitrary: a thesis withdrawn and then
// published again is PUBLISHED, not WITHDRAWN, because `publish_thesis` sets the pin again (T6 :916–:920, "a thesis
// withdrawn and published again shows the withdrawal in its history between the two versions"). The withdrawal stays
// in the TRANSCRIPT; it stops being the STATE.
// ---------------------------------------------------------------------------

const v = (id: string, minute: number): { id: string; createdAt: Date } => ({
  id,
  createdAt: new Date(Date.UTC(2026, 8, 10, 9, minute)),
});

const VERSIONS = [v('version-1', 0), v('version-2', 10), v('version-3', 20)];

const state = (over: Partial<Parameters<typeof publicationState>[0]> = {}) =>
  publicationState(
    { headVersionId: 'version-3', publishedVersionId: null, publishedAt: null, publishedBy: null, ...over },
    VERSIONS,
  );

const WITHDRAWN_AT = new Date(Date.UTC(2026, 8, 11, 12, 0));
const WITHDRAWAL = { createdAt: WITHDRAWN_AT, reason: 'הטקסט נשען על קטע שהעמוד כבר אינו מחזיק' };

describe('thesisState — the four words of ui §11 :398–:399, as one closed union', () => {
  it('DRAFT_ONLY: nothing was ever published, and no withdrawal exists', () => {
    expect(thesisState(state(), null)).toEqual({ kind: 'DRAFT_ONLY' });
  });

  it('PUBLISHED_IS_HEAD: the pin IS the head — the public sees what the researcher sees', () => {
    expect(thesisState(state({ publishedVersionId: 'version-3' }), null)).toEqual({ kind: 'PUBLISHED_IS_HEAD' });
  });

  it('PUBLISHED_BEHIND carries versionsAhead — the count §11 shows in "(n versions since)", never a bare boolean', () => {
    expect(thesisState(state({ publishedVersionId: 'version-1' }), null)).toEqual({
      kind: 'PUBLISHED_BEHIND',
      versionsAhead: 2,
    });
  });

  it('WITHDRAWN carries the moment AND the reason — the reason is the author’s record, gated (T6 :916)', () => {
    expect(thesisState(state(), WITHDRAWAL)).toEqual({
      kind: 'WITHDRAWN',
      at: WITHDRAWN_AT,
      reason: WITHDRAWAL.reason,
    });
  });

  it('a thesis withdrawn and PUBLISHED AGAIN is published, not withdrawn — the pin decides, the withdrawal stays in the transcript', () => {
    expect(thesisState(state({ publishedVersionId: 'version-3' }), WITHDRAWAL)).toEqual({ kind: 'PUBLISHED_IS_HEAD' });
    expect(thesisState(state({ publishedVersionId: 'version-1' }), WITHDRAWAL)).toEqual({
      kind: 'PUBLISHED_BEHIND',
      versionsAhead: 2,
    });
  });

  it('a pin whose version the list does not hold is BEHIND by nothing rather than by a guess — publicationState decides the count, not this function', () => {
    expect(thesisState(state({ publishedVersionId: 'version-gone' }), null)).toEqual({
      kind: 'PUBLISHED_BEHIND',
      versionsAhead: 0,
    });
  });
});
