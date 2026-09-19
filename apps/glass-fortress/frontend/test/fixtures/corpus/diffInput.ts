import type { DiffInput } from '@/types/corpus';

// Hand-written from the appendix (plan §4 :880–:883), never captured from a live response, so the fixture
// asserts what the CONTRACT says rather than what one environment answered on one day. Each is TYPED, so
// `tsc` checks it against `types/corpus.ts` — a fixture that drifts from the appendix fails the build.

/** `get_diff_input`'s answer for one pair (A4 :1095–:1099). */
export const diffInput: DiffInput = {
  "before": "20211223211940",
  "after": "20220105090000",
  "beforeText": "הקישור לדיווח על תופעות לוואי מופיע בגוף הדף.",
  "afterText": "מומלץ להתחסן.",
  "current": {
    "contentVersionHash": "8888888888888888888888888888888888888888888888888888888888888888",
    "chunks": [
      {
        "side": "REMOVED",
        "text": "הקישור לדיווח על תופעות לוואי"
      },
      {
        "side": "ADDED",
        "text": "מומלץ להתחסן"
      }
    ]
  },
  "awaitingDerivation": false,
  "page": {
    "trackedUrlId": "page-one",
    "url": "https://example.gov/one/",
    "public": true
  }
};
