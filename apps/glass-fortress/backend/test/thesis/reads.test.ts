jest.mock('../../src/lib/prisma', () => ({
  prisma: (require('../helpers/evidenceDouble') as typeof import('../helpers/evidenceDouble')).db,
}));
jest.mock('../../src/context/researcherContext', () => (require('./tools') as typeof import('./tools')).researcherContextDouble);
jest.mock('../../src/factories/LLMFactory', () => (require('./tools') as typeof import('./tools')).llmFactoryTripwire);

import { AFTER, BEFORE, CAPTURE_NAME, CURRENT_VERSION, DIFF_NAME, DIFF_ROW, PAGE, URL } from '../helpers/corpusFixture';
import { resetDouble, store, written, type Row } from '../helpers/evidenceDouble';
import { built } from './absent';
import type { ThesisGapDecisionRow, ThesisPredicatesModule, ThesisRow, ThesisRowsShape, ThesisVersionRow } from './contract';
import {
  AUTHOR,
  BOTH_EVIDENCE_MENTION,
  BOTH_TRAJECTORY_MENTION,
  CITING_BOTH_VERSION,
  CLAIM,
  DEBATE,
  FRAMING,
  MENTION,
  NEXT_VERSION,
  NOTE,
  OPEN_GAP,
  OTHER_RESEARCHER,
  PROVISION,
  THESIS,
  TRAJECTORY_ID,
  TRAJECTORY_MENTION,
  TRAJECTORY_VERSION,
  VERSION,
  VERSION_TEXT,
} from './fixtures';
import { mentionRow } from './rows';
import {
  AS_PUBLISHED,
  MISSING_FRAMING,
  MISSING_THESIS,
  ON_THE_FIXTURE,
  PUBLISHED_AT,
  answerOf,
  call,
  codeSetEquality,
  containsDeep,
  listOf,
  objectsWhere,
  refusals,
  resetTools,
  seedCorpus,
  seedThesis,
  tripped,
} from './tools';
import { loadThesisRows } from '../../src/services/thesisRows';
import { citationsFrom } from '../../src/services/publishedThesis';
import type { OwedEntryShape, ReviewEntry } from './contract';

/**
 * The gated row projected down to A4 :1523's `E` — spelled arm by arm rather than by discarding keys, so a field
 * added to either shape is a compile failure here and not a key quietly carried onto the wrong envelope.
 */
const entryOf = (entry: OwedEntryShape): ReviewEntry => {
  const common = { thesisId: entry.thesisId, name: entry.name, command: entry.command };
  if (entry.kind === 'FLAGGED') {
    return { ...common, kind: entry.kind, versionId: entry.versionId, mentionId: entry.mentionId, reasons: entry.reasons };
  }
  if (entry.kind === 'STALE_TRAJECTORY') {
    return { ...common, kind: entry.kind, citedOn: entry.citedOn, state: entry.state };
  }
  return { ...common, kind: entry.kind, versionId: entry.versionId, mentionId: entry.mentionId };
};

/** A stable order for comparing two answers of the SAME set — never the order either one happens to build. */
const byKindThenName = (a: ReviewEntry, b: ReviewEntry): number =>
  a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name) || a.thesisId.localeCompare(b.thesisId);

/** The seeded world as ROWS — the one query, so the composer under test is pure (UI-8 chunk A). */
const thesisRowsOf = async (): Promise<ThesisRowsShape> => {
  const rows = await loadThesisRows(THESIS.id);
  if (rows === null) throw new Error('the world seeds a thesis and the loader answered none');
  return rows;
};

// ---------------------------------------------------------------------------
// THE READS AND THE NOTE — docs/gf-thesis-flows.md A4 :1426–:1431, :1476–:1479,
// :1501–:1504, :1520–:1525, §9 and T6, the R40 sketch §3b. Steps 20 (list_theses,
// get_thesis_context, add_note), 22 (get_whistleblower_call) and 24
// (list_thesis_reviews) build them.
//
// THREE KINDS OF READ, THREE RULES (A4 :1418–:1421). A PUBLIC read takes no identity
// and answers identically for everyone — `list_theses`' anonymous face and the
// whistleblower call; a researcher reaching MORE through `list_theses` is access,
// not a second behaviour (§0d, evidence A4 :1074–:1077). A GATED read answers any
// researcher the working state, and its handler reads no caller (flows A5
// :1037–:1038) — `get_thesis_context`. `list_thesis_reviews` is gated too, and
// refuses NO_RESEARCHER because REVIEWS(caller) has no subject without one (L9).
//
// `get_whistleblower_call` REFUSES NOTHING (Q3b, REVIEW's): an id naming no thesis
// answers `{ live: false }`, exactly as a draft does, so the two answers cannot tell
// an anonymous caller which ids are drafts (evidence §5).
//
// `get_thesis_context`'s `since` (ISO-8601) IS COINED (7.3 round 2, M2; REVIEW's
// ruling, the researcher's to overturn). A4 :1479 returns "HISTORY(t), optionally
// since a date" and its input line `{ thesisId }` names no parameter for it; the A4
// amendment is owed with NO_FRAMING's and create_thesis's (`contract.ts`, TOOLS).
//
// TWO THINGS ARE LEFT UNWRITTEN ON PURPOSE: sketch §3b's "THE_CALL … of the PUBLISHED
// version only, never the head's" waits on the researcher's question whether a gap
// decision carries the version it was decided on (T4 :628, :687 against A2 :1320, A3
// :1404); and HISTORY's attribution of a debate waits on question 1.
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
  resetTools();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const at = (minute: number): Date => new Date(Date.UTC(2026, 8, 10, 9, minute));

/**
 * A SECOND gap. Its description is the sketch §5f's input `c` and its gapId is
 * gapId(c), derived at the same shell as OPEN_GAP's — a gap row whose id is not its
 * description's would be a malformed row. One spelling for the two worlds holding
 * two gaps: `list_theses`' open-gap count and the whistleblower call's request.
 */
const SECOND_GAP = {
  gapId: '0x925e813b18233dc71792ff6d237b1a4032eda5d1bd5625ce0b938f7fda2c8626',
  description: 'מסמך הצגת הנתונים למשרד הבריאות לפני 6 באוגוסט 2022',
} as const;

/**
 * A THIRD gap — DISMISSED in `list_theses`' world, so two of its three gaps read OPEN
 * (round 2, F6). Its description is single-spaced and trimmed, so NORMALISE
 * (`normaliseClaim`, services/claimTrajectory.ts :90–:92; thesis A1 :1234, :1247)
 * returns it unchanged and its gapId is sha256 over its own UTF-8 bytes — a VECTOR
 * DERIVED OUTSIDE THE IMPLEMENTATION, 2026-09-10, at a zsh shell (89 bytes):
 *
 *   D='מסמך הצגת הנתונים למשרד הבריאות לפני 7 באוגוסט 2022'
 *   python3 -c 'import hashlib, sys; print("0x" + hashlib.sha256(sys.argv[1].encode("utf-8")).hexdigest())' "$D"
 *   printf '%s' "$D" | shasum -a 256
 *   printf '%s' "$D" | openssl dgst -sha256
 *
 * All three agree; the same commands over SECOND_GAP's description reproduce its
 * committed vector, and the one character between the two descriptions is the control
 * that differs.
 */
const THIRD_GAP = {
  gapId: '0x3d9b7ce0234a939b4c212ede5f59c339dd7b956bd9c549de1edee5cbea741307',
  description: 'מסמך הצגת הנתונים למשרד הבריאות לפני 7 באוגוסט 2022',
} as const;

describe('list_theses — A4 :1426–:1431, T5 :840–:842, PUBLIC (thesis step 20)', () => {
  const DRAFT_ID = 'thesis-draft';

  /** THESIS published at its head, and a DRAFT of the same author's, never published. */
  function seedPublishedAndDraft(): void {
    const published = seedThesis(AS_PUBLISHED);
    // The draft's head is VERSION's text under its own id, so its contentHash is
    // still its text's hash (A1 :1231) — a row whose hash is not its text's is
    // malformed.
    const draftHead: ThesisVersionRow = { ...VERSION, id: 'version-of-the-draft', thesisId: DRAFT_ID, createdAt: at(18) };
    const draft: ThesisRow = { ...THESIS, id: DRAFT_ID, headVersionId: draftHead.id, createdAt: at(17) };
    store.theses = [published, draft];
    store.versions = [VERSION, draftHead];
    store.mentions = [
      ...store.mentions,
      mentionRow({ ...MENTION, id: 'mention-of-the-draft', versionId: draftHead.id }, false, null, DRAFT_ID),
    ];
  }

  it("answers an ANONYMOUS caller the published theses only, each exactly A4's six keys — the draft does not exist to it (A4 :1427–:1428)", async () => {
    seedPublishedAndDraft();
    const list = listOf(await call('list_theses', {}, null));
    expect(list).toHaveLength(1);
    const entry = objectsWhere(list, (o) => o['thesisId'] === THESIS.id).at(0) ?? {};
    expect(Object.keys(entry).sort()).toEqual(['author', 'claim', 'contentHash', 'provision', 'publishedAt', 'thesisId']);
    // `author` is the author's HANDLE (A4 :1427): the double holds no researcher row
    // to name one, so its value is step 20's — the key is held, not the handle.
    expect(entry).toMatchObject({
      thesisId: THESIS.id,
      claim: CLAIM,
      provision: PROVISION,
      publishedAt: PUBLISHED_AT.toISOString(),
      contentHash: VERSION.contentHash,
    });
    expect(containsDeep(list, DRAFT_ID)).toBe(false);
  });

  it("answers a RESEARCHER their own theses — the draft among them, `headIsPublished` saying whether head and published differ — and CONTAINS every anonymous entry deep-equal: access, not a second behaviour (§0d)", async () => {
    seedPublishedAndDraft();
    const anonymous = listOf(await call('list_theses', {}, null));
    const theirs: unknown = JSON.parse(await call('list_theses', {}, AUTHOR));
    expect(anonymous.filter((entry) => !containsDeep(theirs, entry))).toEqual([]);
    const own = (id: string): unknown[] =>
      objectsWhere(theirs, (o) => o['thesisId'] === id && 'headIsPublished' in o).map((o) => o['headIsPublished']);
    expect(own(DRAFT_ID)).toEqual([false]);
    expect(own(THESIS.id)).toEqual([true]);
    expect(written).toEqual([]);
    expect(tripped).toEqual([]);
  });

  it("a RESEARCHER's own entry holds, by VALUE, its head, its published version, the framing attached, and the counts of unargued mentions and open gaps — each count as the ONE predicate computes it (A4 :1429–:1431; sketch §3b)", async () => {
    // Published at VERSION; the head moved on to CITING_BOTH_VERSION — the chain held
    // whole — citing the diff with no argument and a trajectory; three gaps, two OPEN
    // and one DISMISSED.
    seedThesis({ ...AS_PUBLISHED, headVersionId: CITING_BOTH_VERSION.id });
    store.versions = [VERSION, TRAJECTORY_VERSION, NEXT_VERSION, CITING_BOTH_VERSION];
    const headMentions = [BOTH_EVIDENCE_MENTION, BOTH_TRAJECTORY_MENTION];
    store.mentions = [...store.mentions, mentionRow(TRAJECTORY_MENTION, false), ...headMentions.map((m) => mentionRow(m, false))];
    const gaps: ThesisGapDecisionRow[] = [
      OPEN_GAP,
      { ...OPEN_GAP, ...SECOND_GAP, id: 'gap-decision-second', createdAt: at(33) },
      { ...OPEN_GAP, ...THIRD_GAP, id: 'gap-decision-third', decision: 'DISMISSED', reason: 'לא רלוונטי', createdAt: at(34) },
    ];
    store.gapDecisions = [...gaps];
    const p = await built<ThesisPredicatesModule>('services/thesisPredicates', ['unargued', 'gapList']);
    const unargued = p.unargued(CITING_BOTH_VERSION, headMentions.map((m) => ({ ...m, debate: null }))).length;
    const list = p.gapList(gaps, THESIS.id, headMentions.map((m) => m.name));
    const open = list.filter((e) => e.readsAs === 'OPEN').length;
    // THE VACUITY GUARD: the world holds something to count on each side; the two
    // counts DIFFER, so the /unargued/ and /gap/ fields below cannot pass on each other's
    // value; and the OPEN gaps are FEWER than every gap on GAP_LIST, so a count of all
    // gaps under a /gap/ field is not the open-gap count and fails.
    expect([unargued > 0, open > 0, unargued !== open, open !== list.length]).toEqual([true, true, true, true]);
    const theirs: unknown = JSON.parse(await call('list_theses', {}, AUTHOR));
    const own = objectsWhere(theirs, (o) => o['thesisId'] === THESIS.id && 'headIsPublished' in o);
    expect(own).toHaveLength(1);
    const entry = own.at(0);
    expect(entry?.['headIsPublished']).toBe(false);
    // EACH VALUE UNDER ITS FIELD (A4 :1429–:1431): held by a key, at any depth of the
    // entry, whose NAME carries A4's word — its spelling the builder's, read by pattern
    // as versionWrite.test.ts's "takes NO pin" reads a schema's keys. A head and a
    // published version swapped, or the two counts swapped, fail on the field's name.
    const heldUnder = (key: RegExp, value: unknown): boolean =>
      objectsWhere(entry, () => true).some((o) => Object.entries(o).some(([k, v]) => key.test(k) && containsDeep(v, value)));
    expect({
      head: heldUnder(/head/i, CITING_BOTH_VERSION.id),
      published: heldUnder(/publish/i, VERSION.id),
      framing: heldUnder(/framing/i, FRAMING.id),
      unargued: heldUnder(/unargued/i, unargued),
      openGaps: heldUnder(/gap/i, open),
    }).toEqual({ head: true, published: true, framing: true, unargued: true, openGaps: true });
    expect(written).toEqual([]);
  });

  codeSetEquality('list_theses');
});

describe('get_thesis_context — A4 :1476–:1479, GATED (thesis step 20)', () => {
  refusals('get_thesis_context', [
    {
      code: 'NO_THESIS',
      why: "a thesisId naming none — a GATED read's handler answers without an identity, so an anonymous call reaches it (flows A5 :1037–:1038)",
      as: null,
      seed: seedThesis,
      input: { thesisId: MISSING_THESIS },
    },
  ]);

  it("answers ANY researcher the working state — the thesis, HEAD's text and citation, UNARGUED, the gap list, NONE for an analysis never run, the framing, HISTORY — writing nothing (A4 :1477–:1479; §9 :1002–:1004)", async () => {
    seedThesis();
    store.gapDecisions = [{ ...OPEN_GAP }];
    store.notes = [{ ...NOTE }];
    const answer = answerOf(await call('get_thesis_context', { thesisId: THESIS.id }, OTHER_RESEARCHER));
    const owed: readonly unknown[] = [THESIS.id, VERSION_TEXT, DIFF_NAME, [DIFF_NAME], OPEN_GAP.gapId, 'NONE', FRAMING.id, NOTE.id];
    expect(owed.filter((value) => !containsDeep(answer, value))).toEqual([]);
    expect(written).toEqual([]);
    expect(tripped).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // NO ID ON THE WIRE — A4 :1476, "a researcher — NEVER an id on the wire"; ui §4 :167, which bars a page from
  // rendering one at all. Held on the SERIALISED answer, because that is what a route sends and what a page
  // parses: a case reading the in-memory object would miss an id nested in a row the body carries whole.
  //
  // IT WAS NOT VACUOUS WHEN IT WAS WRITTEN. A walk of the live body on 2026-09-20 found exactly one path still
  // carrying the caller's id — `gapList[].inForce.researcherId`, because :1476 spells `inForce` as "the
  // ThesisGapDecision row" and the row has the column. The id is projected out of it and `by` carries the
  // attribution instead; this case is what stops it coming back.
  // -------------------------------------------------------------------------
  it('the serialised context carries NO researcher id anywhere, and every `by` carries the seeded HANDLE instead (A4 :1476; §4 :167)', async () => {
    seedThesis();
    store.gapDecisions = [{ ...OPEN_GAP }];
    store.notes = [{ ...NOTE }];
    const text = await call('get_thesis_context', { thesisId: THESIS.id }, AUTHOR);
    // THE VACUITY GUARD: the answer must actually hold the parts that name a researcher, or the absence below
    // is an absence of everything.
    const answer = answerOf(text) as { thesis: { by: { handle: string } }; gapList: unknown[]; history: unknown[] };
    expect([answer.gapList.length > 0, answer.history.length > 0]).toEqual([true, true]);
    expect(text).not.toContain(AUTHOR);
    expect(text).not.toContain(OTHER_RESEARCHER);
    expect(text).toContain('חוקר_א');
    expect(answer.thesis.by).toEqual({ handle: 'חוקר_א', mine: true });
    // Every `by` on every arm, from the serialised text: a handle and a `mine`, and no third key.
    const byKeys = [...text.matchAll(/"by":\{([^{}]*)\}/g)].map((m) => m[1] ?? '');
    expect(byKeys.length).toBeGreaterThan(3);
    expect([...new Set(byKeys.map((keys) => keys.includes('"handle"') && keys.includes('"mine"')))]).toEqual([true]);
  });

  it("HISTORY SINCE A DATE through the tool — `since`, ISO-8601, COINED (7.3 round 2, M2): the ONE predicate's entries after it and none before, the date BETWEEN two rows (A4 :1479; §9 :977–:978)", async () => {
    seedThesis();
    store.gapDecisions = [{ ...OPEN_GAP }];
    store.notes = [{ ...NOTE }];
    // Half a minute after OPEN_GAP (09:12) and before NOTE (09:13): an instant equal
    // to a row's own createdAt would pin a strict-or-inclusive boundary A3 :1407
    // never states.
    const since = new Date(Date.UTC(2026, 8, 10, 9, 12, 30));
    const p = await built<ThesisPredicatesModule>('services/thesisPredicates', ['transcriptOf']);
    // HISTORY as the predicate answers it, in the JSON a tool returns — dates as ISO.
    const asJson = (entries: readonly unknown[]): unknown[] => entries.map((e) => JSON.parse(JSON.stringify(e)) as unknown);
    // DECLARED EDIT, 2026-09-20 (R66): the CALL SHAPE only — `history` takes its options as an object since
    // A4 :1476's ruling. Not one assertion of this case moved; it still holds the strict boundary and its own
    // vacuity guard on both sides of the instant.
    const after = asJson(p.transcriptOf(await thesisRowsOf(), { since }));
    const before = asJson(p.transcriptOf(await thesisRowsOf())).filter((entry) => !containsDeep(after, entry));
    // THE VACUITY GUARD: the date must have rows on BOTH sides, or the case holds nothing.
    expect([after.length > 0, before.length > 0]).toEqual([true, true]);
    const answer = answerOf(
      await call('get_thesis_context', { thesisId: THESIS.id, since: since.toISOString() }, OTHER_RESEARCHER),
    );
    expect(after.filter((entry) => !containsDeep(answer, entry))).toEqual([]);
    expect(before.filter((entry) => containsDeep(answer, entry))).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // THE MENTIONS ARE RESOLVED, AND `pages` RIDES THE READ — A4 :1476 as amended 2026-09-21; T5 :811–:818 for
  // what a resolved citation carries; ui §11 :410 and :413–:415 for the two readers that have always needed
  // the record.
  //
  // THE OLD SHAPE WAS `{ kind, name, pin, argued }`, which the working view's centre CANNOT be fed: the centre
  // is the public thesis column CALLED, and its `EvidenceCitation` requires `record`, `content`, `verified`,
  // `flag` and `overObjection`. The only legal call was `citations: []`, which makes `ThesisText` :25–:31
  // resolve EVERY token to `unresolved` — false on every citation.
  //
  // THE FLOOR IS STATED BECAUSE THE ASSERTION IS SATISFIABLE BY NOTHING. "The citations are resolved" is true
  // of a version that cites nothing, so the world is checked to carry BOTH kinds, a FLAGGED citation and one
  // promoted OVER THE OBJECTION before any shape is read.
  //
  // FLAGGED SITS ON PUBLISHED, AND MUST. FLAGGED(m) requires m to be on a published version (evidence A3
  // :1054) and `flaggedFor` answers an unpublished mention as unflagged before it consults any evidence row —
  // so a HEAD citation's flag is `{ flagged: false, reasons: [] }` ALWAYS. That is the design, not a defect,
  // and a case expecting a flagged HEAD citation would assert what the design forbids.
  // -------------------------------------------------------------------------

  /** The key set A4 :1476 spells for each arm of `V.mentions`, and T5 :811–:818 lists. */
  const EVIDENCE_KEYS = ['argued', 'content', 'flag', 'kind', 'name', 'overObjection', 'pin', 'record', 'verified'];
  const TRAJECTORY_RESOLVED_KEYS = ['argued', 'claimText', 'current', 'kind', 'name', 'pin', 'resolves', 'transitions', 'url'];

  interface Mention {
    kind: string;
    name: string;
    flag?: { flagged: boolean; reasons: string[] };
    overObjection?: boolean;
  }
  const keysOf = (m: Mention): string[] => Object.keys(m).sort();

  /**
   * PUBLISHED at VERSION citing the diff — ARGUED, promoted over the objection, and FLAGGED because the record
   * was WITHDRAWN after publication — with HEAD moved on to CITING_BOTH_VERSION, which cites the same diff and
   * a trajectory. Two versions, both kinds, and the two marks that only a published mention can carry.
   */
  function seedBothVersionsResolved(): void {
    seedThesis({ ...AS_PUBLISHED, headVersionId: CITING_BOTH_VERSION.id });
    store.versions = [VERSION, TRAJECTORY_VERSION, NEXT_VERSION, CITING_BOTH_VERSION];
    // `promotedOverObjection` is spread onto the debate the double answers, as publicThesisRoutes.test.ts :182
    // does: `mentionRow` carries the three fields ARGUED reads and this fourth is the FACT T5 :816 names.
    const published = mentionRow(MENTION, true, DEBATE);
    store.mentions = [
      { ...published, debateSession: { ...(published['debateSession'] as Row), promotedOverObjection: true } },
      mentionRow(BOTH_EVIDENCE_MENTION, false),
      mentionRow(BOTH_TRAJECTORY_MENTION, false),
    ];
    // The endpoints carry their page and the pair its content versions, as VERIFIED and FLAGGED select them
    // (`evidencePredicates.ts` :697, :790–:798) — routeWorld.ts :126's shape. A bare DIFF_ROW here throws
    // inside VERIFIED, which is a malformed row and not a finding about the read.
    store.evidenceRows = [
      {
        fileHash: DIFF_NAME,
        kind: 'DIFF',
        status: 'WITHDRAWN',
        snapshot: null,
        urlVersionDiff: {
          ...DIFF_ROW,
          trackedUrlId: PAGE.id,
          contentVersions: [CURRENT_VERSION],
          beforeSnapshot: { ...BEFORE, trackedUrl: PAGE },
          afterSnapshot: { ...AFTER, trackedUrl: PAGE },
        },
      },
    ];
  }

  it("HEAD's and PUBLISHED's mentions are RESOLVED CITATIONS — every key T5 :811–:818 lists, both kinds, the FLAG on the published one and the FACT of the objection — and `currency` is nowhere on the wire (A4 :1476)", async () => {
    seedBothVersionsResolved();
    const answer = answerOf(await call('get_thesis_context', { thesisId: THESIS.id }, OTHER_RESEARCHER)) as {
      head: { mentions: Mention[] };
      published: { mentions: Mention[] };
    };
    const head = answer.head.mentions;
    const published = answer.published.mentions;

    // THE FLOOR, before any shape is read: two versions really carry citations, BOTH kinds are present, and
    // the published one really is FLAGGED and really was promoted over the objection. Without this every
    // assertion below is satisfied by a world that cites nothing.
    expect({
      headCount: head.length,
      publishedCount: published.length,
      kinds: [...new Set(head.map((m) => m.kind))].sort(),
      flagged: published.filter((m) => m.flag?.flagged === true).length,
      overObjection: published.filter((m) => m.overObjection === true).length,
    }).toEqual({ headCount: 2, publishedCount: 1, kinds: ['EVIDENCE', 'TRAJECTORY'], flagged: 1, overObjection: 1 });

    // EACH ARM'S KEY SET EXACTLY — a missing `record` or `content` is what the centre cannot draw, and an
    // extra key is a second citation shape beside the public one.
    expect([...head, ...published].filter((m) => m.kind === 'EVIDENCE').map(keysOf)).toEqual([EVIDENCE_KEYS, EVIDENCE_KEYS]);
    expect(head.filter((m) => m.kind === 'TRAJECTORY').map(keysOf)).toEqual([TRAJECTORY_RESOLVED_KEYS]);

    // FLAGGED IS FALSE ON HEAD BY DEFINITION — the same record, the same WITHDRAWN row, and an unpublished
    // mention. This is the design (evidence A3 :1054), stated so a future "fix" cannot quietly flag a draft.
    expect(head.filter((m) => m.kind === 'EVIDENCE').map((m) => m.flag)).toEqual([{ flagged: false, reasons: [] }]);

    // `currency` LEFT THE WIRE: it was written onto the `resolves: false` arm, where a property of a
    // trajectory that RESOLVED cannot exist, and no reader consumes a mention's currency.
    expect(await call('get_thesis_context', { thesisId: THESIS.id }, OTHER_RESEARCHER)).not.toContain('currency');
    expect(written).toEqual([]);
    expect(tripped).toEqual([]);
  });

  it('`pages` names each CITED page ONCE across HEAD and PUBLISHED together — the union deduplicated by url, which is what the chip resolves its link from (A4 :1476; `ThesisText.tsx` :49)', async () => {
    seedBothVersionsResolved();
    const answer = answerOf(await call('get_thesis_context', { thesisId: THESIS.id }, OTHER_RESEARCHER)) as {
      head: { mentions: { kind: string; record?: { url: string } }[] };
      published: { mentions: { kind: string; record?: { url: string } }[] };
      pages: { trackedUrlId: string; url: string }[];
    };
    // THE VACUITY GUARD AND THE DECOY IN ONE: BOTH versions cite a record on this page, so a `pages` built by
    // concatenating the two versions' lists would carry it TWICE and fail on the length — while a `pages`
    // built from HEAD alone still passes. THE TWO-PAGE UNION IS NOT GRADED HERE: the thesis fixture holds one
    // TrackedUrl, so a body serving only HEAD's pages would satisfy this case. Stated, not implied.
    const citedUrls = [...answer.head.mentions, ...answer.published.mentions]
      .filter((m) => m.kind === 'EVIDENCE')
      .map((m) => m.record?.url);
    expect(citedUrls).toEqual([URL, URL]);
    expect(answer.pages).toEqual([{ trackedUrlId: PAGE.id, url: URL }]);
  });

  // -------------------------------------------------------------------------
  // `owed` AND `reviews` — A4 :1476, ruled 2026-09-22 (the researcher, R71); ui §11 :402-:408.
  //
  // THIS THESIS'S ENTRIES OF REVIEWS RIDE THIS READ. The working view took a SECOND read of
  // `/api/research/reviews` and kept the entries naming this thesis — a pass over EVERY thesis on the platform
  // to keep one thesis's rows, and a read ui §10 :369-:371's CLOSED LIST never named. The field replaces it.
  //
  // THE SHAPE MIRRORS A4 :1523: `owed` is the COUNT and `reviews` the entries, so ONE NAME keeps ONE meaning
  // across the two doors. A body serving `owed: ReviewEntry[]` — the design source's first proposal — passes
  // nothing below.
  // -------------------------------------------------------------------------
  it("`owed` and `reviews` ride THIS read: the thesis's own entries of REVIEWS, `owed` the COUNT that mirrors A4 :1523 (A4 :1476; ui §11 :402)", async () => {
    seedBothVersionsResolved();
    const answer = answerOf(await call('get_thesis_context', { thesisId: THESIS.id }, AUTHOR)) as {
      owed: number;
      reviews: { kind: string; thesisId: string; name: string; command: string }[];
    };
    // THE FLOOR ON THE SUBJECT: this world really owes something, and really owes MORE THAN ONE KIND — a
    // `reviews` that answered `[]`, or that served one arm and dropped the others, satisfies every equality
    // below by carrying nothing. `owed: 0` is a legitimate answer and is held by its own case, on a world
    // that owes nothing.
    expect(answer.reviews.length).toBeGreaterThanOrEqual(2);
    expect([...new Set(answer.reviews.map((e) => e.kind))].sort()).toEqual(['FLAGGED', 'UNARGUED']);
    // `owed` IS A NUMBER AND IT IS THIS LIST'S COUNT — the count and the list cannot disagree with each other.
    expect(answer.owed).toBe(answer.reviews.length);
    // Every entry names THIS thesis and carries the ONE command to paste (T6 :881-:882).
    expect(answer.reviews.filter((e) => e.thesisId !== THESIS.id || e.command.length === 0)).toEqual([]);
    expect(written).toEqual([]);
  });

  it("each entry carries the RECORD and `owedSince` PAIRED BY KIND, on the SERIALISED answer (A4 :1476 as amended; ui §11 :404)", async () => {
    // HELD ON THE SERIALISED ANSWER because that is what a route sends and what a page parses — the R66 lesson.
    // A `Date` that never left the process would pass an in-memory assertion and reach the page as `{}`.
    //
    // AND THE WORLD CITES **TWO DIFFERENT RECORDS**, which the shared fixture does not: its published and head
    // EVIDENCE mentions name the SAME diff, so a `record` taken from ANY entry of the resolver's map — the first,
    // say — would be right by accident and this case would grade nothing. DEV's decoy E3 (2026-09-22) is exactly
    // that, and reddened nothing until this line was added. The head gains a CAPTURE citation, so each entry's
    // record can be checked against ITS OWN name.
    seedBothVersionsResolved();
    store.mentions = [
      ...store.mentions,
      mentionRow({ ...MENTION, id: 'mention-capture', versionId: CITING_BOTH_VERSION.id, name: CAPTURE_NAME, contentVersionHash: BEFORE.textHash }, false),
    ];
    // The capture HOLDS ITS TEXT at the pin — `heldTextsFor` answers a citation pinned to the capture's current
    // extraction from the snapshot row itself, and a row without `text` is a malformed capture rather than a
    // finding about this read (`publishedThesis.ts`'s `pinnedContent` throws on it by name).
    store.captures = store.captures.map((capture) =>
      capture['id'] === BEFORE.id ? { ...capture, text: 'הפסקה כפי שנצפתה בצילום' } : capture,
    );
    const answer = answerOf(await call('get_thesis_context', { thesisId: THESIS.id }, AUTHOR)) as {
      reviews: { kind: string; name: string; record: unknown; owedSince: unknown }[];
    };
    // THE FLOOR: both arms this world owes are present, so the per-kind table below is over something.
    expect([...new Set(answer.reviews.map((e) => e.kind))].sort()).toEqual(['FLAGGED', 'UNARGUED']);

    // THE THREE LEGAL PAIRINGS, as VALUES — FLAGGED { record, owedSince: null } · UNARGUED { record, owedSince }
    // · STALE_TRAJECTORY { record: null, owedSince }. A body that made both fields independently nullable would
    // admit a fourth shape the appendix does not name, and this table is what refuses it.
    expect(
      answer.reviews.map((entry) => ({
        kind: entry.kind,
        record: entry.record === null ? null : 'named',
        owedSince: entry.owedSince === null ? null : 'dated',
      })),
    ).toEqual(answer.reviews.map((entry) => ({ kind: entry.kind, record: 'named', owedSince: entry.kind === 'FLAGGED' ? null : 'dated' })));

    // THE RECORD IS NAMED AS EVIDENCE A1 NAMES IT — the page and its timestamps, never a row id (§4 :167) — and
    // EACH ENTRY CARRIES ITS OWN. The diff-named citations name the pair by its two endpoints; the capture-named
    // one names a single capture. An entry handed another entry's record fails here by value.
    expect(answer.reviews.map((entry) => [entry.name, entry.record])).toEqual(
      answer.reviews.map((entry) => [
        entry.name,
        entry.name === CAPTURE_NAME
          ? { url: URL, capture: BEFORE.waybackTimestamp }
          : { url: URL, before: BEFORE.waybackTimestamp, after: AFTER.waybackTimestamp },
      ]),
    );
    // THE VACUITY GUARD ON THAT TABLE: both sides are built from the same answer, so it is a SHAPE check and
    // holds nothing unless the world really cites TWO records. It does, and this says which.
    expect([...new Set(answer.reviews.map((entry) => entry.name))].sort()).toEqual([CAPTURE_NAME, DIFF_NAME].sort());

    // AND THE DATE IS AN ISO INSTANT ON THE WIRE, not a serialised object. UNARGUED's is HEAD's own `createdAt`.
    const unargued = answer.reviews.find((entry) => entry.kind === 'UNARGUED');
    expect(unargued?.owedSince).toBe(CITING_BOTH_VERSION.createdAt.toISOString());
  });

  it('`{ owed: 0, reviews: [] }` is an ANSWER and never a refusal, on a thesis that owes nothing (A4 :1476, :1525; ui §11 :406)', async () => {
    // The head's one citation ARGUED, for this record and this thesis: UNARGUED fires on ARGUED, nothing is
    // published, and no trajectory is cited — the three arms are each answered and each answer is empty.
    seedThesis();
    store.mentions = [mentionRow(MENTION, false, DEBATE)];
    const answer = answerOf(await call('get_thesis_context', { thesisId: THESIS.id }, AUTHOR));
    expect({ owed: answer['owed'], reviews: answer['reviews'] }).toEqual({ owed: 0, reviews: [] });
  });

  // -------------------------------------------------------------------------
  // THE COLLEAGUE CASE — ui §11 :407-:408, and the reason this field is NOT `REVIEWS(researcher)`.
  //
  // A3 :1408-:1410 scopes that predicate to the theses the caller AUTHORS. §11 :407 requires THE SAME ENTRIES
  // on a COLLEAGUE'S thesis, with the command labelled as the author's — and §9 :1003 says the gated read is
  // "gated from the public, not from colleagues". So a `reviews` field built by calling REVIEWS(caller) and
  // keeping this thesis's rows answers `[]` to every colleague, silently.
  //
  // NOTHING IN THE TREE HELD THIS BEFORE (the R71 brief §2, the case it names as OWED).
  // -------------------------------------------------------------------------
  it("a COLLEAGUE reading the thesis is answered the SAME entries — the field is PER-THESIS and carries no author scoping (ui §11 :407; A3 :1408)", async () => {
    seedBothVersionsResolved();
    const mine = answerOf(await call('get_thesis_context', { thesisId: THESIS.id }, AUTHOR));
    const theirs = answerOf(await call('get_thesis_context', { thesisId: THESIS.id }, OTHER_RESEARCHER));
    // THE FLOOR: the author's own read really owes entries, or "the same" is the same nothing twice. And the
    // two callers really are different researchers — `mine` on the thesis says so.
    expect((mine['reviews'] as unknown[]).length).toBeGreaterThan(0);
    expect([(mine['thesis'] as { by: { mine: boolean } }).by.mine, (theirs['thesis'] as { by: { mine: boolean } }).by.mine]).toEqual([true, false]);
    expect(theirs['reviews']).toEqual(mine['reviews']);
    expect(theirs['owed']).toEqual(mine['owed']);
  });

  // -------------------------------------------------------------------------
  // ONE REVIEWS, TWO SOURCES — the guard on the deliberate second assembly.
  //
  // `reviewsOf` builds A3 :1408-:1410's three arms over rows the read already loaded; `reviews` builds them
  // over queries of its own, because a cross-thesis list cannot afford one thesis's whole read per thesis (the
  // researcher's ruling, 2026-09-22). Two sources is the ruling; two ANSWERS would be this repository's named
  // defect. This case is what stops them parting, and it is what the later pending-work chunk keeps green when
  // it collapses them.
  // -------------------------------------------------------------------------
  it('`reviewsOf` answers the SAME ENTRIES `reviews` answers — the gated row is `E` PLUS the pairing, never a different `E` (A3 :1408-:1410)', async () => {
    // RE-AIMED 2026-09-22 (round 2), NOT WEAKENED. The two doors now serve different ROWS by ruling — A4 :1476's
    // `E & { record, owedSince }` here, :1523's `E & { owedSince, material, author, mine }` there — so a raw
    // deep-equal would hold a world the design deleted. What must not drift is the ENTRY underneath, and the
    // projection below is the whole of it: a field added to either union's arms fails HERE by name rather than
    // being dropped in silence.
    seedBothVersionsResolved();
    const p = await built<ThesisPredicatesModule>('services/thesisPredicates', ['reviews', 'reviewsOf']);
    const rows = await thesisRowsOf();
    const cited = await citationsFrom(
      THESIS.id,
      rows.mentions,
      [rows.thesis.headVersionId, rows.thesis.publishedVersionId].filter((id): id is string => id !== null),
    );
    const overRows = p.reviewsOf(rows, cited);
    const overQueries = await p.reviews(AUTHOR);
    // THE FLOOR ON THE SUBJECT: a world that owes nothing makes the two lists equal by being empty twice.
    expect(overRows.length).toBeGreaterThanOrEqual(2);
    expect(overRows.map(entryOf).sort(byKindThenName)).toEqual([...overQueries].sort(byKindThenName));

    // AND THE PAIRING IS EXACTLY THE THREE THE APPENDIX NAMES (A4 :1476), stated as a value per kind so a fourth
    // combination — a FLAGGED entry with a date, a STALE entry with a record — fails by naming the kind.
    expect(overRows.map((entry) => [entry.kind, entry.record === null ? 'no record' : 'record', entry.owedSince === null ? 'no date' : 'date'])).toEqual(
      overRows.map((entry) => [entry.kind, entry.kind === 'STALE_TRAJECTORY' ? 'no record' : 'record', entry.kind === 'FLAGGED' ? 'no date' : 'date']),
    );
    // THE VACUITY GUARD ON THAT: both sides are built from `overRows`, so the equality above is a SHAPE check and
    // holds nothing unless the kinds really differ. They do, and this says which.
    expect([...new Set(overRows.map((e) => e.kind))].sort()).toEqual(['FLAGGED', 'UNARGUED']);
  });

  // -------------------------------------------------------------------------
  // THE PIN'S GUARD — `publishedThesis.ts` :543, LOAD-BEARING AND UNTIL NOW UNHELD.
  //
  // A PIN ALWAYS NAMES A STORED VERSION, and that is a design fact rather than a hope: content is held as
  // APPEND-ONLY VERSIONS and nothing overwrites one (evidence :200–:204, :796), the version write sets
  // `pin := CURRENT(record).hash` and REFUSES AWAITING_DERIVATION (thesis T2 :412–:414), and a re-walk leaves
  // every stored version where it was — *"the old version is kept and every citation still pins it"*
  // (evidence :501). AWAITING_DERIVATION is a property of CURRENT, never of the pin.
  //
  // SO A MENTION WHOSE PIN NO VERSION CARRIES IS A MALFORMED ROW, and the read says so LOUDLY. It is the
  // `requireSnapshotIdentity` pattern `CLAUDE.md` requires: never a silent filter, because a citation quietly
  // dropped is a chip the centre draws as `unresolved` with nothing to say why — and on the KEEP column an
  // unknown content kind renders NOTHING at all (`components/record/RecordContent.tsx` :104–:110, two
  // exclusive branches and no else), so a "tolerant" arm would open a chip onto an empty pane.
  //
  // ONE GUARD SERVES BOTH BODIES. `citationsByVersion` is the public page's resolver and the gated read's, so
  // this case holds the guard for `GET /api/thesis/:id` as much as for the working view.
  // -------------------------------------------------------------------------
  it('AWAITING_DERIVATION is a property of CURRENT and NOT of the pin: the cited version is KEPT, so the citation still RESOLVES and draws the PINNED chunks (evidence :1027–:1029, :501; T5 :813)', async () => {
    // THE WORLD THE FIXTURE NOW SEEDS FOR "the walk owes a version", and the ONE it can seed for a CITED
    // pair. This case is what stops `superseded` being quietly rewritten back into a world with no stored
    // version at all — which is uncitable (T2 :414) and is what three cases held for months.
    seedThesis();
    seedCorpus({ superseded: true });
    const gated = await import('../../src/mcp/tools/getThesisContext');
    const body = await gated.thesisContextOf({ thesisId: THESIS.id });
    expect('head' in body).toBe(true);
    if (!('head' in body)) return;

    // THE TWO HALVES TOGETHER, and neither alone is the world: CURRENT is undefined (the analysis arm says
    // AWAITING_DERIVATION) AND the citation resolves at its pin, with the kept version's own chunks.
    const citation = body.head?.mentions.at(0);
    expect({
      analysis: body.analysis,
      pin: citation?.pin,
      content: citation?.kind === 'EVIDENCE' ? citation.content : null,
    }).toEqual({
      analysis: { state: 'AWAITING_DERIVATION', name: DIFF_NAME },
      pin: CURRENT_VERSION.contentVersionHash,
      content: { kind: 'DIFF', chunks: CURRENT_VERSION.chunks.map((c) => ({ side: c.side, text: c.text })) },
    });
  });

  it('a mention whose PIN no stored version carries is MALFORMED, and the read THROWS naming the pin and the diff — never a citation silently missing (evidence :200–:204; T2 :412–:414)', async () => {
    seedThesis();
    const gated = await import('../../src/mcp/tools/getThesisContext');

    // THE GREEN CONTROL FIRST, on the world as seeded: the pin the store holds answers, so the throw below is
    // the PIN's and not this world's.
    const answered = await gated.thesisContextOf({ thesisId: THESIS.id });
    expect('head' in answered && answered.head?.mentions.length).toBe(1);

    // THE SAME WORLD, ONE FIELD MOVED: the head pins a hash no DiffContentVersion carries.
    store.mentions = [mentionRow({ ...MENTION, contentVersionHash: 'content-no-version-carries-this' }, false)];
    await expect(gated.thesisContextOf({ thesisId: THESIS.id })).rejects.toThrow(
      /no content version content-no-version-carries-this of the diff 20201209134003 → 20210612183110/,
    );
  });

  codeSetEquality('get_thesis_context');
});

describe('get_whistleblower_call — A4 :1501–:1504, PUBLIC, refuses nothing (Q3b) (thesis step 22)', () => {
  const CALL_ITEM = { whatIsNeeded: 'פרוטוקול הדיון', whoWouldHaveSeenIt: 'חברי הצוות', unit: 'אגף הרפואה', window: '2022-08' };
  const REQUEST = { text: 'בקשה', authority: 'משרד הבריאות', legalBasis: 'חוק חופש המידע', addresses: [], restsOn: [DIFF_NAME] };

  /** OPEN_GAP decided CALLED — a second decision on the same gap, so the one in force is CALLED. */
  const CALLED: ThesisGapDecisionRow = {
    ...OPEN_GAP,
    id: 'gap-decision-called',
    sequence: 2,
    decision: 'CALLED',
    callItem: CALL_ITEM,
    createdAt: at(31),
  };

  /** SECOND_GAP, REQUESTED. */
  const REQUESTED: ThesisGapDecisionRow = {
    ...OPEN_GAP,
    ...SECOND_GAP,
    id: 'gap-decision-requested',
    decision: 'REQUESTED',
    request: REQUEST,
    createdAt: at(32),
  };

  it('a DRAFT with a gap CALLED, and an id naming NO thesis, answer the same bytes — `{ live: false }` — so no answer reveals which ids are drafts (Q3b; A4 :1503)', async () => {
    seedThesis();
    store.gapDecisions = [{ ...OPEN_GAP }, CALLED];
    const draft = await call('get_whistleblower_call', { thesisId: THESIS.id }, null);
    const nothing = await call('get_whistleblower_call', { thesisId: MISSING_THESIS }, null);
    expect(answerOf(draft)).toEqual({ live: false });
    expect(nothing).toBe(draft);
  });

  it('PUBLISHED with nothing CALLED or REQUESTED is `{ live: false }` too (A4 :1503)', async () => {
    seedThesis(AS_PUBLISHED);
    store.gapDecisions = [{ ...OPEN_GAP }];
    expect(answerOf(await call('get_whistleblower_call', { thesisId: THESIS.id }, null))).toEqual({ live: false });
  });

  it('PUBLISHED: THE_CALL carries each CALLED call item and THE_REQUESTS each request — the same bytes with and without identity, and no model (A3 :1404–:1406; A4 :1502–:1504)', async () => {
    seedThesis(AS_PUBLISHED);
    store.gapDecisions = [{ ...OPEN_GAP }, CALLED, REQUESTED];
    const anonymous = await call('get_whistleblower_call', { thesisId: THESIS.id }, null);
    const researcher = await call('get_whistleblower_call', { thesisId: THESIS.id }, AUTHOR);
    const answer = answerOf(anonymous);
    expect(answer).not.toEqual({ live: false });
    expect([CALL_ITEM, REQUEST].filter((appeal) => !containsDeep(answer, appeal))).toEqual([]);
    expect(researcher).toBe(anonymous);
    expect(written).toEqual([]);
    expect(tripped).toEqual([]);
  });

  codeSetEquality('get_whistleblower_call');
});

describe('add_note — A4 :1520–:1521, §9 :986–:997 (thesis step 20)', () => {
  const onTheThesis = ON_THE_FIXTURE.add_note;
  const onTheFraming = { framingId: FRAMING.id, text: NOTE.text };

  refusals('add_note', [
    { code: 'NO_RESEARCHER', why: 'no researcher in context', as: null, seed: seedThesis, input: onTheThesis },
    {
      code: 'NEITHER',
      why: 'no target at all — a note names a thesis or a framing (§9 :990)',
      as: AUTHOR,
      seed: seedThesis,
      input: { text: NOTE.text },
      beforeAnyQuery: true,
    },
    {
      code: 'NEITHER',
      why: 'BOTH targets — "exactly one set", the A2 CHECK (:1343)',
      as: AUTHOR,
      seed: seedThesis,
      input: { ...onTheThesis, framingId: FRAMING.id },
      beforeAnyQuery: true,
    },
    {
      code: 'NO_THESIS',
      why: 'a thesisId naming none — never NOT_AUTHOR',
      as: OTHER_RESEARCHER,
      seed: seedThesis,
      input: { ...onTheThesis, thesisId: MISSING_THESIS },
    },
    {
      code: 'NO_FRAMING',
      why: 'a framingId naming none (Q3a)',
      as: OTHER_RESEARCHER,
      seed: seedThesis,
      input: { ...onTheFraming, framingId: MISSING_FRAMING },
    },
    { code: 'NOT_AUTHOR', why: "a note on another researcher's thesis", as: OTHER_RESEARCHER, seed: seedThesis, input: onTheThesis },
    {
      code: 'NOT_AUTHOR',
      why: "a note on another researcher's framing — add_note's word on a framing too (§0f)",
      as: OTHER_RESEARCHER,
      seed: seedThesis,
      input: onTheFraming,
    },
    { code: 'EMPTY', why: 'a blank text', as: AUTHOR, seed: seedThesis, input: { ...onTheThesis, text: '  ' } },
  ]);

  it('appends ONE Note — its target, its text, who wrote it — and nothing else (§9 :991)', async () => {
    seedThesis();
    answerOf(await call('add_note', onTheThesis, AUTHOR));
    expect(written.map((w) => [w.model, w.op])).toEqual([['note', 'create']]);
    expect(written.at(0)?.data).toMatchObject({ thesisId: THESIS.id, text: NOTE.text, researcherId: AUTHOR });
    expect(written.at(0)?.data['framingId'] ?? null).toBeNull();
  });

  it('a note saying a gap is resolved resolves NOTHING — no decision written, the gap as it was (§9 :994–:995)', async () => {
    seedThesis();
    store.gapDecisions = [{ ...OPEN_GAP }];
    answerOf(await call('add_note', { ...onTheThesis, text: 'פער 3 נפתר' }, AUTHOR));
    expect(written.map((w) => w.model)).toEqual(['note']);
    expect(store.gapDecisions).toEqual([OPEN_GAP]);
  });

  codeSetEquality('add_note');
});

describe('list_thesis_reviews — A4 :1523–:1525, T6 :863–:882, GATED (thesis step 24)', () => {
  const SECOND = 'thesis-2';

  refusals('list_thesis_reviews', [
    {
      code: 'NO_RESEARCHER',
      why: 'no researcher — REVIEWS(caller) has no subject without one (L9)',
      as: null,
      seed: seedThesis,
      input: {},
    },
  ]);

  it('a researcher who owes nothing is ANSWERED, `{ owed: 0, reviews: [] }` — never refused; another\'s thesis owes them nothing (A4 :1524–:1525)', async () => {
    seedThesis();
    expect(answerOf(await call('list_thesis_reviews', {}, OTHER_RESEARCHER))).toEqual({ owed: 0, reviews: [] });
  });

  /**
   * Two theses of AUTHOR's, each HEAD citing the diff with no argument: THESIS, and a
   * SECOND begun later with a later head — so every sane key for "oldest first"
   * agrees — SEEDED FIRST, so a list in store order is out of order.
   */
  function seedTwoOwed(): void {
    seedThesis();
    const secondHead: ThesisVersionRow = { ...VERSION, id: 'version-of-thesis-2', thesisId: SECOND, createdAt: at(21) };
    const second: ThesisRow = { ...THESIS, id: SECOND, headVersionId: secondHead.id, createdAt: at(20) };
    store.theses = [second, ...store.theses];
    store.versions = [secondHead, ...store.versions];
    store.mentions = [
      mentionRow({ ...MENTION, id: 'mention-of-thesis-2', versionId: secondHead.id }, false, null, SECOND),
      ...store.mentions,
    ];
  }

  it("answers REVIEWS(caller) — the ONE predicate's entries, never a second derivation — OLDEST FIRST, each with its material and ONE command (A4 :1524; T6 :868–:882)", async () => {
    seedTwoOwed();
    const p = await built<ThesisPredicatesModule>('services/thesisPredicates', ['reviews']);
    const owed = await p.reviews(AUTHOR);
    expect(owed.map((e) => e.thesisId).sort()).toEqual([SECOND, THESIS.id].sort());
    const answer = answerOf(await call('list_thesis_reviews', {}, AUTHOR));
    expect(answer).toEqual({
      owed: 2,
      reviews: [THESIS.id, SECOND].map((id) =>
        expect.objectContaining({
          ...owed.find((e) => e.thesisId === id),
          command: expect.stringMatching(/\S/) as unknown,
          owedSince: expect.any(String) as unknown,
          material: expect.any(Object) as unknown,
        }) as unknown,
      ),
    });
    // THE KEY IS THE ORDER: the list is sorted by the instant each item became owed.
    const since = objectsWhere(answer, (o) => 'owedSince' in o).map((o) => String(o['owedSince']));
    expect(since).toEqual([...since].sort());
    // AN UNARGUED ITEM'S MATERIAL IS THE CITATION TO ARGUE — the record at its pin.
    const materials = objectsWhere(answer, (o) => 'material' in o && 'command' in o).map((o) => o['material']);
    expect(materials.filter((m) => !containsDeep(m, MENTION.contentVersionHash))).toEqual([]);
  });

  codeSetEquality('list_thesis_reviews');
});
