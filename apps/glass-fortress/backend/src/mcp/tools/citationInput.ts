import { z } from 'zod';

// ---------------------------------------------------------------------------
// The citation inputs shared by create_thesis_draft and add_thesis_version.
//
// Defined once because they had already drifted: the same footnote parameter
// was `positive()` in one tool and `min(1)` in the other, and a thesis is
// written by alternating between them. Two tools that disagree about what a
// citation is are two tools that produce different documents from the same
// intent.
// ---------------------------------------------------------------------------

export const citationsSchema = z
  .array(
    z
      .object({
        id: z.number().int().min(1).describe('Footnote number matching a [^id] marker in body.'),
        fileHashes: z.array(z.string()).optional().describe('Evidence file hash(es) (0x…) this footnote cites.'),
        trajectoryIds: z
          .array(z.string())
          .optional()
          .describe(
            'ClaimTrajectory id(s) this footnote cites — the trajectoryId field from ' +
              'get_claim_trajectories, NOT a claimHash. Cite every claim in a co-movement group: ' +
              'the group has no id of its own, and citing all of its members is what preserves the ' +
              'finding that they moved together.',
          ),
      })
      .refine((c) => (c.fileHashes?.length ?? 0) + (c.trajectoryIds?.length ?? 0) > 0, {
        message: 'A citation must cite at least one evidence hash or one trajectory id.',
      }),
  )
  .optional()
  .describe(
    'Per-claim citations for [^n] footnote markers in body — each renders as inline mention ' +
      'chip(s) at that exact position instead of a trailing block. One footnote may cite evidence ' +
      'and trajectories together. Omit for a plain body with no inline citations.',
  );

export const trajectoryIdsSchema = z
  .array(z.string())
  .optional()
  .describe(
    'ClaimTrajectory ids to link as trajectory mentions. Ids already covered by a citations ' +
      'entry render inline instead of in a trailing chip list — pass any remaining supporting ' +
      'trajectories here. A trajectory is a deterministic string search across every archived ' +
      'capture of a page: no model judged it, and a reader can re-run it.',
  );

export interface CitationInput {
  id: number;
  fileHashes?: string[];
  trajectoryIds?: string[];
}

/** The distinct evidence hashes named anywhere in this input. */
export function allCitedHashes(flat: string[] | undefined, citations: CitationInput[] | undefined): string[] {
  return [...new Set([...(flat ?? []), ...(citations?.flatMap((c) => c.fileHashes ?? []) ?? [])])];
}

/** The distinct trajectory ids named anywhere in this input. */
export function allCitedTrajectoryIds(
  flat: string[] | undefined,
  citations: CitationInput[] | undefined,
): string[] {
  return [...new Set([...(flat ?? []), ...(citations?.flatMap((c) => c.trajectoryIds ?? []) ?? [])])];
}
