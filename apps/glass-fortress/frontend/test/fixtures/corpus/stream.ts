import type { CorpusAnswer } from '@/types/corpus';

// Hand-written from the appendix (plan §4 :880–:883), never captured from a live response, so the fixture
// asserts what the CONTRACT says rather than what one environment answered on one day. Each is TYPED, so
// `tsc` checks it against `types/corpus.ts` — a fixture that drifts from the appendix fails the build.

/** A stream over TWO pages with both row kinds: a cited diff, an awaiting-derivation diff and a narrowed diff, with the `pages` facet and a cursor. */
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
        "editorial": null,
        "classifierVersion": "classifier-fixture-1",
        "draws": null
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
        "editorial": null,
        "classifierVersion": "classifier-fixture-1",
        "draws": null
      },
      "narrowed": true,
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
      "first": "2021-12-23",
      "last": "2022-02-11",
      "entries": 4
    },
    {
      "trackedUrlId": "page-two",
      "url": "https://example.gov/two/",
      "public": true,
      "first": "2022-03-01",
      "last": "2022-04-15",
      "entries": 1
    }
  ],
  "nextCursor": "cursor-fixture-2"
};
