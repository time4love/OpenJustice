import type { ThesisContext, Turn } from '@/types/research';
import type { DocumentCitation } from '@/types/thesis';
import debateDocument from './debate-document.json';
import { thesisContextThin } from './thesisContext';

// ---------------------------------------------------------------------------
// A WORKING VIEW WHOSE HEAD CITES A DOCUMENT — document step 33 chunk 6.
//
// THE DOCUMENT MENTION IS THE BACKEND'S OWN ARM, field for field: `publishedThesis.ts` :189–:198 `DocumentCitationBase`
// (`documentCitation()` :738–:750 builds it) completed with `verified` by `getThesisContext.ts` :78 — thesis A4 :1476's
// DOCUMENT arm as ruled (R81 QC). A live capture over the evidence double was attempted and stopped at the double's
// written rows (they carry no `thesisVersion`, `debateSession` or `createdAt`), so the arm is transcribed from the type
// that serves it — the same discipline `thesisContext.ts` states for its own bodies.
//
// THE DEBATE THREAD IS A REAL ANSWER: `debate-document.json` is `open_debate`'s own body over a document (the backend's
// chunk-4 case output, `handoffs/R82-dev-chunk4/page-state.json`), with the two event ids the double did not write
// supplied — a database row always has one. Nothing here names a person or a product.
// ---------------------------------------------------------------------------

/** A document's commitment — `0x` + 64 lowercase hex, the only name a `#doc_` token carries (A1 :1236, :1244). */
export const DOC_COMMITMENT = `0x${'c1'.repeat(32)}`;
/** Board י4's title, the researcher's own words — the chip carries its first four. */
export const DOC_TITLE = 'מערך הנתונים המשלים למאמר על תקשורת סיכון לבבי, 2026';
export const DOC_PIN = `0x${'b1'.repeat(32)}`;

/** The DOCUMENT arm, over a HELD document cited and not yet argued. */
export const documentMention = (over: Partial<DocumentCitation> = {}): DocumentCitation => ({
  kind: 'DOCUMENT',
  name: DOC_COMMITMENT,
  pin: DOC_PIN,
  argued: false,
  title: DOC_TITLE,
  custody: 'HELD',
  verified: false,
  flag: { flagged: false, reasons: [] },
  overObjection: false,
  ...over,
});

const thinHead = thesisContextThin.head;
if (thinHead === null) throw new Error('documentContext: thesisContextThin has no head to extend');
const evidence = thinHead.mentions.at(0);
if (evidence === undefined) throw new Error('documentContext: thesisContextThin head cites nothing');

/** The debate thread of the real answer, as the transcript carries it — DEBATE_OPENED, RATIONALE, ASSESSMENT. */
const debateTurns = debateDocument.turns as unknown as Turn[];

/** A HEAD citing one captured page and one document, as board ד2·י draws the working view. */
export const thesisContextDocument: ThesisContext = {
  ...thesisContextThin,
  head: {
    ...thinHead,
    text: `מערך הנתונים שפורסם עם המאמר #doc_${DOC_COMMITMENT} מתעד את הדיווחים. בצילום #ev_${evidence.name} עומדים ארבעה פריטים.`,
    mentions: [evidence, documentMention()],
  },
  history: [
    {
      kind: 'VERSION',
      id: 'version-doc',
      at: '2026-09-25T08:00:00.000Z',
      thread: { step: 'VERSION', id: 'version-doc' },
      by: { voice: 'RESEARCHER', handle: 'handle-a', mine: true },
      line: thinHead.claim,
      body: {
        text: 'מערך הנתונים שפורסם עם המאמר מתעד את הדיווחים.',
        claim: thinHead.claim,
        contentHash: thinHead.contentHash,
        parentVersionId: null,
        // THE STORED ROWS a `#doc_` write leaves (the backend's `documentCitationWrite` case holds this shape).
        mentions: [
          { versionId: 'version-doc', kind: 'EVIDENCE', name: evidence.name, contentVersionHash: 'pin-four', debateSessionId: null },
          { versionId: 'version-doc', kind: 'DOCUMENT', name: DOC_COMMITMENT, contentVersionHash: DOC_PIN, debateSessionId: null },
        ],
        citationsVsParent: { added: [`EVIDENCE:${evidence.name}`, `DOCUMENT:${DOC_COMMITMENT}`], repinned: [], dropped: [], carried: [] },
      },
    },
    ...debateTurns,
  ],
};
