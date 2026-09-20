// ---------------------------------------------------------------------------
// Which version of a thesis a viewer is shown.
//
// Publication is a pinned version (Thesis.publishedVersionId). The public sees
// that version and only that version; an approved researcher sees the head,
// and is told whether the public is behind it. One rule, used by every read
// that serves a thesis — the MCP tools, the REST route behind the thesis page
// and the call page — so there is exactly one answer to "what does the public
// see?".
// ---------------------------------------------------------------------------

export type Viewer = 'PUBLIC' | 'RESEARCHER';

export interface PublicationState {
  isPublished: boolean;
  publishedVersionId: string | null;
  publishedAt: Date | null;
  /** Handle of the researcher who published; null when unpublished or legacy. */
  publishedBy: string | null;
  headVersionId: string | null;
  /** True when what the public sees IS the head. */
  headIsPublished: boolean;
  /** How many versions were created after the published one — how far the public is behind. */
  versionsAhead: number;
}

interface ThesisPublicationFields {
  headVersionId: string | null;
  publishedVersionId: string | null;
  publishedAt: Date | null;
  publishedBy: { handle: string } | null;
}

export function publicationState(
  thesis: ThesisPublicationFields,
  versions: { id: string; createdAt: Date }[],
): PublicationState {
  const published = thesis.publishedVersionId
    ? versions.find((v) => v.id === thesis.publishedVersionId) ?? null
    : null;
  const versionsAhead = published ? versions.filter((v) => v.createdAt > published.createdAt).length : 0;

  return {
    isPublished: thesis.publishedVersionId !== null,
    publishedVersionId: thesis.publishedVersionId,
    publishedAt: thesis.publishedAt,
    publishedBy: thesis.publishedBy?.handle ?? null,
    headVersionId: thesis.headVersionId,
    headIsPublished: thesis.publishedVersionId !== null && thesis.publishedVersionId === thesis.headVersionId,
    versionsAhead,
  };
}

/**
 * The version id this viewer is served: the head for a researcher, the
 * published pin for the public, null when the public has nothing to see.
 */
export function versionIdForViewer(
  thesis: { headVersionId: string | null; publishedVersionId: string | null },
  viewer: Viewer,
): string | null {
  return viewer === 'RESEARCHER' ? thesis.headVersionId : thesis.publishedVersionId;
}

// ---------------------------------------------------------------------------
// THE THESIS'S STATE AS ONE WORD — docs/gf-ui-flows.md §11 :398–:399; thesis A4 :1429 and :1476, the envelope
// RULED 2026-09-20 (the researcher, R66 „Q1 transcript approved”).
//
// §11 gives a thesis four states and, as served on 2026-09-20, NO FIELD carried them: `headIsPublished` covers
// two arms, `versionsAhead` was computed here and never sent, and a withdrawal was named by nothing at all. A
// page would have had to derive the word from a boolean, a count it did not have and a row it cannot read —
// one rule with as many implementations as there are surfaces. This is the one implementation, and BOTH gated
// reads call it: `get_thesis_context` and `list_theses` answer the SAME union.
//
// IT STAYS PURE. It takes the `PublicationState` its caller already computed and the latest withdrawal ROW; it
// reads no client. A pure module never gains a dependency (the researcher, 2026-09-11).
//
// THE PIN DECIDES, AND THE WITHDRAWAL IS SECOND. A thesis withdrawn and published again is PUBLISHED: publication
// sets the pin, withdrawal clears it (T6 :916–:920), so a non-null pin is the later fact. The withdrawal does not
// disappear — it stays in the transcript, "in its history between the two versions", which is where T6 puts it.
// ---------------------------------------------------------------------------

export type ThesisState =
  | { kind: 'DRAFT_ONLY' }
  | { kind: 'PUBLISHED_IS_HEAD' }
  | { kind: 'PUBLISHED_BEHIND'; versionsAhead: number }
  | { kind: 'WITHDRAWN'; at: Date; reason: string };

export function thesisState(
  state: PublicationState,
  latestWithdrawal: { createdAt: Date; reason: string } | null,
): ThesisState {
  if (state.publishedVersionId !== null) {
    return state.headIsPublished ? { kind: 'PUBLISHED_IS_HEAD' } : { kind: 'PUBLISHED_BEHIND', versionsAhead: state.versionsAhead };
  }
  if (latestWithdrawal !== null) {
    return { kind: 'WITHDRAWN', at: latestWithdrawal.createdAt, reason: latestWithdrawal.reason };
  }
  return { kind: 'DRAFT_ONLY' };
}
