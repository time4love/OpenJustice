import type { ResolvedRecord } from '@/types/corpus';

// Hand-written from the appendix (plan §4 :880–:883), never captured from a live response, so the fixture
// asserts what the CONTRACT says rather than what one environment answered on one day. Each is TYPED, so
// `tsc` checks it against `types/corpus.ts` — a fixture that drifts from the appendix fails the build.

/** `resolve_record`'s answer for a cited diff (A4 :1105–:1109). */
export const resolvedRecord: ResolvedRecord = {
  "fileHash": "0x7777777777777777777777777777777777777777777777777777777777777777",
  "kind": "DIFF",
  "page": {
    "trackedUrlId": "page-one",
    "url": "https://example.gov/one/",
    "public": true
  },
  "first": "2021-12-23",
  "last": "2022-01-05",
  "recomputable": true,
  "verified": true,
  "captures": [
    {
      "capture": "20211223211940",
      "snapshotDate": "2021-12-23",
      "attributed": true
    },
    {
      "capture": "20220105090000",
      "snapshotDate": "2022-01-05",
      "attributed": false
    }
  ],
  "citedBy": [
    {
      "thesisId": "thesis-one",
      "versionId": "version-one",
      "publishedAt": "2026-09-15T05:06:27.851Z",
      "flagged": false,
      "text": "בין הצילום הראשון לשני נגרע סעיף תופעות הלוואי."
    }
  ]
};
