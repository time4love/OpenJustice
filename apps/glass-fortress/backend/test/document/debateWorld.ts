import { db, store, type Row } from '../helpers/evidenceDouble';
import { COMMITMENT, HELD_BEFORE, HELD_NOW, OTHER_COMMITMENT, TITLE, documentRow, versionRow } from './citationWorld';

// ---------------------------------------------------------------------------
// A DEBATE ON A DOCUMENT IN THE EVIDENCE DOUBLE'S WORLD — document step 33 chunk 4 (plan :247–:250; §6 :701–:710).
//
// ONE spelling of the world the gating unit cases (`test/documentDebate.test.ts`) and this suite's amended ones stand
// on, as `citationWorld.ts` is for the citation. Every row is one the design creates: a thesis whose head version cites
// a HELD document by `#doc_<commitment>` in two paragraphs and records the DOCUMENT mention the version write parsed
// from it (T2), and the OPEN session `open_debate` wrote on it (A2 :1339–:1341: `recordCommitment`, `recordFileHash`
// the commitment).
//
// `thesisMention.findFirst` ANSWERS BY ITS `where` here, as the database does; the double's own answers `store.mention`
// whatever it is asked, which would let a document arm that asked for the wrong KIND of mention pass.
// ---------------------------------------------------------------------------

export const AUTHOR = 'researcher-doc';
export const THESIS = 'thesis-doc';
export const VERSION = 'version-doc';
export const SESSION = 'session-doc';

/** The head's text: the document cited in two paragraphs, beside paragraphs citing other things. */
export const HEAD_TEXT = [
  `החוזר מורה לשמור את ערוץ הדיווח פתוח #doc_${COMMITMENT}`,
  `פסקה על רשומה אחרת #ev_0x${'e9'.repeat(32)}`,
  `ובפסקה נוספת: החוזר מורה על דיווח שבועי #doc_${COMMITMENT}`,
  `ומסמך אחר לגמרי #doc_${OTHER_COMMITMENT}`,
].join('\n\n');

/** CURRENT(d)'s computed text — distinct from the older version's, so a case can tell which one was handed. */
export const CURRENT_TEXT = 'יש לשמור את ערוץ הדיווח פתוח לכל הפחות עד סוף הרבעון.';

/** A document debate's session row, as `loadDebate` selects it. */
export function documentSession(over: Row = {}): Row {
  return {
    id: SESSION,
    thesisId: THESIS,
    recordFileHash: COMMITMENT,
    status: 'OPEN',
    hasSubstance: false,
    verdict: null,
    promotedOverObjection: false,
    evidenceId: null,
    recordSnapshotId: null,
    recordDiffId: null,
    recordCommitment: COMMITMENT,
    recordSnapshot: null,
    recordDiff: null,
    recordDocument: { commitment: COMMITMENT, title: TITLE },
    evidence: null,
    thesis: { createdById: AUTHOR, headVersionId: VERSION },
    researcherId: AUTHOR,
    createdAt: new Date('2026-09-25T09:00:00.000Z'),
    closedAt: null,
    events: [],
    ...over,
  };
}

/** A HELD PDF whose CURRENT(d) carries text, beside an older version; the head cites it as a DOCUMENT. After `resetDouble`. */
export function seedDocumentDebate(): void {
  store.thesis = { createdById: AUTHOR, headVersionId: VERSION };
  store.versions = [{ id: VERSION, text: HEAD_TEXT }];
  store.mentions = [
    { id: 'mention-doc', versionId: VERSION, kind: 'DOCUMENT', name: COMMITMENT, contentVersionHash: HELD_NOW, debateSessionId: null },
  ];
  (db.thesisMention.findFirst as jest.Mock).mockImplementation((args: { where: Row }) =>
    Promise.resolve(
      store.mentions.find((m) => Object.entries(args.where).every(([field, value]) => m[field] === value)) ?? null,
    ),
  );
  store.openByKey = null;
  store.session = documentSession();
  store.researchers = [{ id: AUTHOR, handle: 'חוקר_א' }];
  store.documents = [documentRow()];
  store.documentContentVersions = [
    versionRow(HELD_BEFORE, { extractorVersion: 'v0-an-older-extractor', text: 'נוסח ישן' }),
    versionRow(HELD_NOW, { text: CURRENT_TEXT }),
  ];
}
