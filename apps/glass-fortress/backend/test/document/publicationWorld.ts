import { commitment as commitmentOf } from '../../src/lib/documentIdentity';
import type { DocumentVerification } from '../../src/services/evidencePredicates';
import type { PublicationAssessorOutput } from '../../src/services/publicationAssessor';
import { store } from '../helpers/evidenceDouble';
import { THESIS, VERSION } from '../thesis/fixtures';
import { seedPublishable } from '../thesis/gateWorld';
import { mentionRow } from '../thesis/rows';
import { HELD_NOW, RECEIPT, seedHeld, seedSealed } from './citationWorld';

// ---------------------------------------------------------------------------
// A PUBLISHABLE HEAD CITING ONE DOCUMENT — document step 34 (R84 chunk 1; LIFTED at chunk 4a, R85, from
// `test/documentPublication.test.ts`, so the document suite's amended `publish_thesis` case runs the SAME world rather
// than a copy of it). The thesis gate's world (`test/thesis/gateWorld.ts`, read, never edited) with its head citing ONE
// document: HELD, promoted and affirmed at CURRENT(d), argued on this thesis.
// ---------------------------------------------------------------------------

export const DOC_MENTION = 'mention-doc';
/**
 * The document's REAL public name — `commitment(docId, salt)` over the citation world's row (`documentRow` :27–:43). That
 * world's `COMMITMENT` is a label, and RECOMPUTABLE(e)'s third arm (document A3 :1364) rightly refuses a row named by a
 * label: here the name is the one the row reproduces.
 */
export const COMMITMENT = commitmentOf(`0x${'d1'.repeat(32)}`, Buffer.alloc(32));
export const DEBATE = { id: 'debate-doc', status: 'PROMOTED', recordFileHash: COMMITMENT, thesisId: THESIS.id };

/** The gate world, its head citing the document alone — argued, promoted, pinned at `pin`. */
/** The span the head quotes by default — present in the citation world's computed text (`versionRow` :47–:58). */
export const QUOTE = 'הטקסט המחושב';

export async function seedCitingDocument(over: { pin?: string; sealed?: boolean; quotes?: readonly string[] } = {}): Promise<void> {
  await seedPublishable();
  if (over.sealed === true) seedSealed();
  else seedHeld();
  store.documents = store.documents.map((d) => ({ ...d, commitment: COMMITMENT }));
  store.documentContentVersions = store.documentContentVersions.map((v) => ({ ...v, commitment: COMMITMENT }));
  const pin = over.pin ?? (over.sealed === true ? RECEIPT : HELD_NOW);
  store.evidenceRows = [
    ...store.evidenceRows,
    {
      fileHash: COMMITMENT,
      kind: 'DOCUMENT',
      documentCommitment: COMMITMENT,
      status: 'PROMOTED',
      affirmedContentVersionHash: pin,
      snapshotId: null,
      snapshot: null,
      urlVersionDiffId: null,
      urlVersionDiff: null,
    },
  ];
  const document = mentionRow(
    { id: DOC_MENTION, versionId: VERSION.id, kind: 'DOCUMENT', name: COMMITMENT, contentVersionHash: pin, debateSessionId: DEBATE.id },
    false,
    DEBATE,
  );
  store.mentions = [document];
  // Check 19 reads the paragraph that carries the token (debatePassage.passagesCiting), so the head's text carries it.
  const quoted = (over.quotes ?? [QUOTE]).map((q) => `"${q}"`).join(' ');
  store.versions = [{ ...VERSION, text: `הקוד קובע ${quoted} #doc_${COMMITMENT}.` }];
}

export const asked = (answer: { verified: boolean } | { unread: string }): DocumentVerification => ({
  asked: true,
  byCommitment: new Map([[COMMITMENT, answer]]),
});


export const ASSESSED: PublicationAssessorOutput = {
  rationaleHasSubstance: true,
  substanceGaps: [],
  verdict: 'SUPPORTS',
  objection: '',
  names: [],
  allegationsFramed: true,
  allegationsNote: '',
  assessment: 'הנימוק בעל ממש.',
};
