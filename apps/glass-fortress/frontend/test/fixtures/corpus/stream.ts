import type { CorpusAnswer } from '@/types/corpus';

// Hand-written from the appendix (plan §4 :880–:883), never captured from a live response, so the fixture
// asserts what the CONTRACT says rather than what one environment answered on one day. Each is TYPED, so
// `tsc` checks it against `types/corpus.ts` — a fixture that drifts from the appendix fails the build.

/**
 * A stream over TWO pages with both row kinds: a cited diff, an awaiting-derivation diff, a narrowed diff, and
 * — added with the significance gate — a diff that is EDITORIAL *and* LEGALLY SIGNIFICANT beside one that is
 * editorial only. That pair is what makes the gate assertable by VALUE rather than by property name: 20 of 21
 * diffs on the real corpus are editorial and EIGHT of those are also legally significant, so a gate written on
 * `editorial` would hide the first of these two, which is exactly the row the page exists to show.
 */
export const corpusStream: CorpusAnswer = {
  "entries": [
    {
      "kind": "CAPTURE",
      "capture": "20211223211940",
      "snapshotDate": "2021-12-23",
      "fileHash": "0x1111111111111111111111111111111111111111111111111111111111111111",
      "textHash": "2222222222222222222222222222222222222222222222222222222222222222",
      "textExtractionVersion": "v3-fixture",
      "anchor": {
        "documentHash": "3333333333333333333333333333333333333333333333333333333333333333",
        "attributed": true
      },
      "evidence": null,
      "page": {
        "trackedUrlId": "page-one",
        "url": "https://example.gov/one/",
        "public": true
      }
    },
    {
      "kind": "CAPTURE",
      "capture": "20220105090000",
      "snapshotDate": "2022-01-05",
      "fileHash": "0x4444444444444444444444444444444444444444444444444444444444444444",
      "textHash": "5555555555555555555555555555555555555555555555555555555555555555",
      "textExtractionVersion": "v3-fixture",
      "anchor": {
        "documentHash": "6666666666666666666666666666666666666666666666666666666666666666",
        "attributed": false
      },
      "evidence": null,
      "page": {
        "trackedUrlId": "page-one",
        "url": "https://example.gov/one/",
        "public": true
      }
    },
    {
      "kind": "DIFF",
      "before": "20211223211940",
      "after": "20220105090000",
      "fileHash": "0x7777777777777777777777777777777777777777777777777777777777777777",
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
      "opinion": {
        "significance": "מגוף הדף נגרע סעיף תופעות הלוואי ובמקומו נוספה המלצה להתחסן.",
        "categories": [
          "WITHHOLDING_INFORMATION",
          "SAFETY_CLAIM_ALTERATION"
        ],
        "legallySignificant": true,
        "editorial": false,
        "classifierVersion": "classifier-fixture-1",
        "draws": 1
      },
      "narrowed": false,
      "evidence": {
        "fileHash": "0x7777777777777777777777777777777777777777777777777777777777777777",
        "status": "PROMOTED",
        "citedBy": [
          {
            "thesisId": "thesis-one",
            "published": true
          }
        ]
      },
      "page": {
        "trackedUrlId": "page-one",
        "url": "https://example.gov/one/",
        "public": true
      }
    },
    {
      "kind": "DIFF",
      "before": "20220105090000",
      "after": "20220211120000",
      "fileHash": "0x9999999999999999999999999999999999999999999999999999999999999999",
      "current": null,
      "awaitingDerivation": true,
      "opinion": null,
      "narrowed": false,
      "evidence": null,
      "page": {
        "trackedUrlId": "page-one",
        "url": "https://example.gov/one/",
        "public": true
      }
    },
    {
      "kind": "DIFF",
      "before": "20220301080000",
      "after": "20220415080000",
      "fileHash": "0xaaaa111111111111111111111111111111111111111111111111111111111111",
      "current": {
        "contentVersionHash": "bbbb111111111111111111111111111111111111111111111111111111111111",
        "chunks": [
          {
            "side": "ADDED",
            "text": "עדכון מרווחי מתן"
          }
        ]
      },
      "awaitingDerivation": false,
      "opinion": {
        "significance": "עדכון הנחיות שגרתי, ללא גריעת אזהרות בטיחות.",
        "categories": [],
        "legallySignificant": false,
        "editorial": false,
        "classifierVersion": "classifier-fixture-1",
        "draws": 1
      },
      "narrowed": true,
      "evidence": null,
      "page": {
        "trackedUrlId": "page-two",
        "url": "https://example.gov/two/",
        "public": true
      }
    },
    {
      "kind": "DIFF",
      "before": "20220415080000",
      "after": "20220520080000",
      "fileHash": "0xaaaa0000000000000000000000000000000000000000000000000000000000aa",
      "current": {
        "contentVersionHash": "bbbb000000000000000000000000000000000000000000000000000000000000",
        "chunks": [
          { "side": "REMOVED", "text": "רשימת התופעות השכיחות" },
          { "side": "ADDED", "text": "רשימת התופעות" }
        ]
      },
      "awaitingDerivation": false,
      "opinion": {
        "significance": "הפסקה נוסחה מחדש, ובתוך אותו ניסוח נגרעה ממנה רשימת התופעות השכיחות.",
        "categories": ["SAFETY_CLAIM_ALTERATION"],
        "legallySignificant": true,
        "editorial": true,
        "classifierVersion": "v5-editorial-verdict",
        "draws": 1
      },
      "narrowed": false,
      "evidence": null,
      "page": {
        "trackedUrlId": "page-two",
        "url": "https://example.gov/two/",
        "public": true
      }
    },
    {
      "kind": "DIFF",
      "before": "20220520080000",
      "after": "20220601080000",
      "fileHash": "0xcccc0000000000000000000000000000000000000000000000000000000000cc",
      "current": {
        "contentVersionHash": "dddd000000000000000000000000000000000000000000000000000000000000",
        "chunks": [
          { "side": "ADDED", "text": "עודכן בתאריך" }
        ]
      },
      "awaitingDerivation": false,
      "opinion": {
        "significance": "עדכון תאריך בתחתית הדף, ללא שינוי בתוכן ההנחיות עצמן.",
        "categories": [],
        "legallySignificant": false,
        "editorial": true,
        "classifierVersion": "v5-editorial-verdict",
        "draws": 1
      },
      "narrowed": false,
      "evidence": null,
      "page": {
        "trackedUrlId": "page-two",
        "url": "https://example.gov/two/",
        "public": true
      }
    }
  ],
  "pages": [
    {
      "trackedUrlId": "page-one",
      "url": "https://example.gov/one/",
      "public": true,
      "first": "20211223211940",
      "last": "20220211120000",
      "entries": 4
    },
    {
      "trackedUrlId": "page-two",
      "url": "https://example.gov/two/",
      "public": true,
      "first": "20220301080000",
      "last": "20220415080000",
      "entries": 1
    }
  ],
  "nextCursor": "cursor-fixture-2"
};
