import type { ResolvedRecord } from '@/types/corpus';

// The ENVELOPE is evidence A4 :1106 as amended 2026-09-19, whose two sources are `resolveRecord.ts`'
// `interface Resolved` and one body on the running route. The VALUES are invented (plan §4 :880–:883). Both are
// TYPED, so `tsc` checks them against `types/corpus.ts`.
//
// TWO FIXTURES, BECAUSE THE ANSWER IS A UNION ON TWO AXES AND ONE BODY CANNOT SHOW BOTH ARMS OF EITHER.
// `kind` decides `record` (`{ capture }` or `{ before, after }`) and `verified` is the evaluable report or the
// reason it cannot be asked. A single fixture would leave `parseResolvedRecord` holding an arm nothing parses —
// and an unexercised arm is where the last envelope defect lived. RB-4 asserts BOTH are present before it reads
// either, so deleting one is a red case and not a quieter suite.
//
// NAMED LIMIT (gf-a-fixture-that-does-not-match-reality, "name the sweep's limit"): staging holds ONE page with
// no diff carrying an evidence fileHash and no AWAITING_DERIVATION pair, so the `{ before, after }` arm, the
// `notEvaluable` arm and the 409 were confirmed against the backend's `interface` and the amended clause, NOT
// against a live body. The CAPTURE arm below was confirmed on the running route.

/** `resolve_record` for a cited CAPTURE — VERIFIED is evaluable and reports per-capture attribution. */
export const resolvedCaptureRecord: ResolvedRecord = {
  fileHash: '0x7777777777777777777777777777777777777777777777777777777777777777',
  kind: 'CAPTURE',
  page: {
    trackedUrlId: 'page-one',
    url: 'https://example.gov/one/',
    public: true,
  },
  record: {
    capture: '20211223211940',
  },
  recomputable: true,
  verified: {
    verified: true,
    captures: [
      {
        capture: '20211223211940',
        documentHash: '3333333333333333333333333333333333333333333333333333333333333333',
        anchoredHash: '3333333333333333333333333333333333333333333333333333333333333333',
        anchoredHashMatchesDocumentHash: true,
        attributed: true,
        verdict: 'VERIFIED',
        verifierVersion: 'verifier-v2',
        checkedAt: '2026-09-12T19:21:07.868Z',
      },
    ],
  },
  citedBy: [
    {
      thesisId: 'thesis-one',
      versionId: 'version-one',
      contentHash: '0x4444444444444444444444444444444444444444444444444444444444444444',
      // The PIN — the citation's text is the text AT ITS PIN, which is why it is carried and may be null.
      pin: '5555555555555555555555555555555555555555555555555555555555555555',
      // FLAGGED IS THE REPORT AND NEVER A BIT (A3 :1054): the arms actually asked, and the reasons found.
      flagged: {
        flagged: false,
        armsEvaluated: ['WITHDRAWN', 'NOT_CITATION_CURRENT'],
        reasons: [],
      },
      text: 'בין הצילום הראשון לשני נגרע סעיף תופעות הלוואי.',
    },
  ],
};

/** `resolve_record` for a DIFF whose VERIFIED cannot be asked — the record was never promoted. */
export const resolvedDiffRecord: ResolvedRecord = {
  fileHash: '0x9999999999999999999999999999999999999999999999999999999999999999',
  kind: 'DIFF',
  page: {
    trackedUrlId: 'page-one',
    url: 'https://example.gov/one/',
    public: true,
  },
  // A DIFF RECORD'S ENDPOINTS ARE THE PAIR — 14-digit archive names, never dates.
  record: {
    before: '20211223211940',
    after: '20220105090000',
  },
  recomputable: true,
  // NOT A `verified: false`. The platform did not check and says so; §18 :574 shows a reason, never a failure.
  verified: {
    notEvaluable: 'NOT_PROMOTED',
  },
  citedBy: [
    {
      thesisId: 'thesis-one',
      versionId: 'version-two',
      contentHash: '0x6666666666666666666666666666666666666666666666666666666666666666',
      // A NULL PIN is a citation with no pinned content version, and it parses.
      pin: null,
      flagged: {
        flagged: true,
        armsEvaluated: ['WITHDRAWN', 'NOT_CITATION_CURRENT'],
        reasons: ['NOT_CITATION_CURRENT'],
      },
      text: 'השינוי בין שני הצילומים מתועד ברשומה זו.',
    },
  ],
};

/**
 * `resolve_record` for a DIFF whose VERIFIED IS evaluable — TWO captures beneath one record.
 *
 * THE THIRD ARM, ADDED 2026-09-20 BECAUSE A DECOY WENT BLIND. W-14 asserts one row per entry of
 * `verified.captures`, and both earlier fixtures made that assertion vacuous: the CAPTURE record has
 * exactly ONE capture beneath it, so a page drawing `captures.slice(0, 1)` — one verdict over the whole
 * record, hiding a capture whose anchor was never attributed — reddened NOTHING. A4 :1114 is explicit
 * that a record's `fileHash` "answers about every capture beneath it", and only a DIFF record has more
 * than one, so only a DIFF record can witness the list.
 *
 * ITS TWO CAPTURES DISAGREE, deliberately: the first is attributed and the second is not. A list drawn
 * from the first row alone would show „מעוגן" for a record whose second endpoint was never anchored —
 * which is the exact statement this shape exists to prevent.
 */
export const resolvedDiffVerifiedRecord: ResolvedRecord = {
  fileHash: '0x8888888888888888888888888888888888888888888888888888888888888888',
  kind: 'DIFF',
  page: {
    trackedUrlId: 'page-one',
    url: 'https://example.gov/one/',
    public: true,
  },
  record: {
    before: '20211223211940',
    after: '20220105090000',
  },
  recomputable: true,
  verified: {
    verified: false,
    captures: [
      {
        capture: '20211223211940',
        documentHash: '3333333333333333333333333333333333333333333333333333333333333333',
        anchoredHash: '3333333333333333333333333333333333333333333333333333333333333333',
        anchoredHashMatchesDocumentHash: true,
        attributed: true,
        verdict: 'VERIFIED',
        verifierVersion: 'verifier-v2',
        checkedAt: '2026-09-12T19:21:07.868Z',
      },
      {
        capture: '20220105090000',
        documentHash: '4444444444444444444444444444444444444444444444444444444444444444',
        anchoredHash: null,
        anchoredHashMatchesDocumentHash: false,
        attributed: null,
        verdict: null,
        verifierVersion: null,
        checkedAt: null,
      },
    ],
  },
  citedBy: [],
};
