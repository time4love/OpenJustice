import type { CaptureEntry } from '@/types/corpus';

// Hand-written from the appendix (plan §4 :880–:883), never captured from a live response, so the fixture
// asserts what the CONTRACT says rather than what one environment answered on one day. Each is TYPED, so
// `tsc` checks it against `types/corpus.ts` — a fixture that drifts from the appendix fails the build.

/** One CAPTURE row — `list_findings`' row as the capture page reads it (A4 :1082–:1084). */
export const captureRow: CaptureEntry = {
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
};
