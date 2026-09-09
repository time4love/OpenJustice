// ---------------------------------------------------------------------------
// THE PASSAGE — docs/gf-thesis-flows.md T3.
//
// "The debate's question is 'does this record support what thesis T says it
// does?', and 'what T says' is a sentence, not a thesis: the paragraph in which
// the token appears, extracted from the head version's text by the backend, is
// the assessor's material beside the rationale and the record's computed
// content."
//
// THE BODY IS TipTap JSON UNTIL THESIS STEP 20, when thesis A2 makes it Markdown
// with inline tokens. So the paragraph is a NODE, and this module's whole job is
// to render the right nodes and no others.
//
// ONE WALKER, NEVER A SECOND. `extractText` in `services/thesisClaimAudit.ts` is
// the one function in this tree that knows what a mention node renders as
// (`#ev_<id>`), and a second walker written here would be free to disagree with
// it about exactly the token this module searches for. It is IMPORTED —
// DYNAMICALLY, because that module reaches `archiveVerification` → `archiveText`
// → jsdom, which is ESM-only and has broken the suite twice; the refactor plan
// §8 names the hazard and this pattern as its remedy, and `resolve_record`
// already uses it.
//
// PER NODE, BEFORE THE COLLAPSE. `extractText` collapses every run of whitespace
// to one space, so rendering the whole document yields ONE LINE and every
// paragraph boundary with it. Splitting after that is not merely harder; it is
// impossible, and the "passage" it would produce is the entire thesis.
// ---------------------------------------------------------------------------

/** A version as the passage reads it — its id for the message, its body to walk. */
export interface CitingVersion {
  id: string;
  userContent: unknown;
}

/** The top-level nodes of a TipTap document, or nothing this module can walk. */
function topLevelNodes(userContent: unknown): unknown[] {
  if (typeof userContent !== 'object' || userContent === null) return [];
  const content = (userContent as { content?: unknown }).content;
  return Array.isArray(content) ? content : [];
}

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
 * THROWS when the mention says the head cites the record and no node carries the
 * token. Not a refusal: under the target the mentions are PARSED FROM THE TEXT by
 * the one version write (T2), so the two cannot disagree, and a disagreement is a
 * malformed version rather than an answerable state. A loud guard, never a silent
 * filter — a passage quietly replaced by the whole text is a subject reported as
 * something it is not.
 */
export async function passagesCiting(version: CitingVersion, fileHash: string): Promise<string[]> {
  const { extractText } = await import('./thesisClaimAudit');
  const token = `#ev_${fileHash}`;

  const passages = topLevelNodes(version.userContent)
    .map((node) => extractText(node))
    .filter((text) => text.includes(token));

  if (passages.length === 0) {
    throw new Error(
      `debatePassage: version ${version.id} is recorded as citing ${fileHash}, but no paragraph of ` +
        `its body carries ${token}. A version's mentions are parsed from its text, so the two cannot ` +
        'disagree; this is a malformed version, not a state the debate can answer.',
    );
  }
  return passages;
}
