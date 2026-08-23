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
