// ---------------------------------------------------------------------------
// THE PASSAGE — docs/gf-thesis-flows.md T3.
//
// "The debate's question is 'does this record support what thesis T says it
// does?', and 'what T says' is a sentence, not a thesis: the paragraph in which
// the token appears, extracted from the head version's text by the backend, is
// the assessor's material beside the rationale and the record's computed
// content."
//
// THE BODY IS TEXT — thesis A2's `ThesisVersion.text`, Markdown with inline
// citation tokens, since thesis step 18. A paragraph is a block of that text
// between blank lines, so this module needs no walker and no renderer: the token
// the mention names is the token the text carries, byte for byte (A1 :1242).
// ---------------------------------------------------------------------------

/** A version as the passage reads it — its id for the message, its text to split. */
export interface CitingVersion {
  id: string;
  text: string;
}

/** Markdown's paragraph boundary: one or more blank lines. */
const PARAGRAPH_BREAK = /\n[ \t]*\n/;

/**
 * The paragraphs of `version` that cite `fileHash`, in document order.
 *
 * ALL OF THEM, NOT THE FIRST. A thesis that cites one record in two places says
 * two things with it, and the assessor is asked whether the record supports what
 * the thesis says — so handing over the first paragraph would be a silent
 * selection of half the question. The mention row is unique per (version, kind,
 * name), so one citation legitimately corresponds to several paragraphs and the
 * material is a list by construction.
 *
 * THROWS when the mention says the head cites the record and no paragraph carries
 * the token. Not a refusal: the mentions are PARSED FROM THE TEXT by the one
 * version write (T2), so the two cannot disagree, and a disagreement is a
 * malformed version rather than an answerable state. A loud guard, never a silent
 * filter — a passage quietly replaced by the whole text is a subject reported as
 * something it is not.
 */
export function passagesCiting(version: CitingVersion, fileHash: string): string[] {
  const token = `#ev_${fileHash}`;

  const passages = version.text
    .split(PARAGRAPH_BREAK)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.includes(token));

  if (passages.length === 0) {
    throw new Error(
      `debatePassage: version ${version.id} is recorded as citing ${fileHash}, but no paragraph of ` +
        `its text carries ${token}. A version's mentions are parsed from its text, so the two cannot ` +
        'disagree; this is a malformed version, not a state the debate can answer.',
    );
  }
  return passages;
}
