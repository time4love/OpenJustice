import type { DiffInput } from '@/types/corpus';
import { classifierOpinion } from './opinion';

// The ENVELOPE is evidence A4 :1096 as amended 2026-09-19, which writes the shape the route actually sends and
// names its two sources — `getDiffInput.ts`' `interface DiffInput` and one body on the running route. The VALUES
// are still invented (plan §4 :880–:883): a fixture asserts what the CONTRACT says, never what one environment
// answered on one day. It is TYPED, so `tsc` checks it against `types/corpus.ts` — a fixture that drifts fails
// the build.
//
// WHAT THIS FIXTURE REPLACED, and why the replacement is the whole of chunk (1): it carried `before`/`after` as
// bare timestamps with `beforeText`/`afterText` beside them, a nullable `current` and an `awaitingDerivation`
// flag — a shape no route sends. It parsed, 273 cases stayed green, and the page would have 500'd on the first
// real body. THE APPENDIX NAMED FIELDS AND NOT ENVELOPES, and a fixture written from it inherited the gap.
//
// THE TWO TEXTS SHARE MATERIAL ON PURPOSE (2026-09-19, chunk 2b). They used to have no word in common, and
// `textDiff` over two wholly different strings returns exactly what a hand-rolled "remove all, add all" swap
// returns — so a decoy replacing UI-5's differ with a two-run split reddened NOTHING. A fixture whose inputs
// cannot tell two implementations apart is a fixture that proves neither. The real bodies share nearly all
// their bytes (3,814 and 5,340 characters of one page), so this is also the more faithful shape.

/** `get_diff_input`'s answer for one pair (A4 :1096). */
export const diffInput: DiffInput = {
  page: {
    url: 'https://example.gov/one/',
    public: true,
  },
  before: {
    capture: '20211223211940',
    textHash: '1111111111111111111111111111111111111111111111111111111111111111',
    textExtractionVersion: 'extract-v1',
    text: 'הקישור לדיווח על תופעות לוואי מופיע בגוף הדף. מומלץ להתחסן.',
  },
  after: {
    capture: '20220105090000',
    textHash: '2222222222222222222222222222222222222222222222222222222222222222',
    textExtractionVersion: 'extract-v1',
    text: 'הקישור לדיווח על תופעות לוואי הוסר מן הדף. מומלץ להתחסן.',
  },
  // `current` IS PRESENT AND NOT NULLABLE. An undefined CURRENT is the 409 refusal, which never reaches a
  // parser: `readPublic` answers it as a state and the page renders it (ui §6 :267, A2 :1153).
  current: {
    contentVersionHash: '8888888888888888888888888888888888888888888888888888888888888888',
    diffVersion: 'diff-v1',
    chunks: [
      {
        side: 'REMOVED',
        text: 'הקישור לדיווח על תופעות לוואי',
      },
      {
        side: 'ADDED',
        text: 'מומלץ להתחסן',
      },
    ],
  },
  // THE DIFF ROW'S THREE FIELDS (A4 :1096, ruled 2026-09-20) — the SAME shapes the stream's rows carry,
  // so the fixture calls the opinion fixture rather than writing a second one that could drift from it.
  opinion: classifierOpinion,
  // NARROWED IS THE MARK AND NOT THE LIST: the intervening captures are served by no read and stay owed.
  narrowed: false,
  evidence: {
    fileHash: '0x7777777777777777777777777777777777777777777777777777777777777777',
    status: 'PROMOTED',
    citedBy: [{ thesisId: 'thesis-one', published: true }],
  },
};
