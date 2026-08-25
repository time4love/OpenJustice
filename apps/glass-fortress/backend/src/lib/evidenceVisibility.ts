import type { Request } from 'express';

/**
 * Who may see an evidence record that has not been reviewed yet.
 *
 * `PENDING_REVIEW` exists so a PERSON decides what counts as evidence before it
 * is published or anchored. `create_evidence_from_url` says so in its own
 * response: "It will NOT appear in the public vault or be registered on-chain
 * until a human reviewer promotes it."
 *
 * That promise was false. Four public, unauthenticated routes read evidence with
 * no status filter — `/evidence/timeline`, `/evidence/:id`, `/evidence/stats`
 * and `/mentions/evidence` — while `/evidence/latest` in the very same file did
 * filter on CONFIRMED. One rule, five implementations, and four of them wrong.
 *
 * The cost was not theoretical. Records created during a review cycle and then
 * REJECTED were publicly readable for as long as they existed, including one
 * that named a pharmaceutical executive and the whistleblower whose warning the
 * source document reports as "key figures" on an Incriminating record. That is
 * precisely the exposure `defamation-risk.md` Rule 4 exists to prevent, pointed
 * at people the review had already decided did not belong there.
 *
 * So visibility is decided HERE, once. A route that reads evidence either takes
 * this `where` clause or is researcher-gated; there is no third option, and
 * `test/evidenceVisibility.test.ts` asserts it.
 */

/** Filter for a viewer who has not been identified as a researcher. */
export const PUBLIC_EVIDENCE_WHERE = { status: 'CONFIRMED' } as const;

/**
 * A researcher sees unreviewed records because reviewing them is the job. The
 * public sees only what a researcher has already approved.
 *
 * Takes the request rather than a boolean so a call site cannot pass the wrong
 * one: the only input is whether `identifyResearcher` resolved an identity, and
 * that middleware must be mounted on any route using this.
 */
export function evidenceWhereForViewer(req: Request): { status?: 'CONFIRMED' } {
  return req.researcherId ? {} : PUBLIC_EVIDENCE_WHERE;
}

/** True when this request may see records that have not been reviewed. */
export function viewerSeesUnreviewed(req: Request): boolean {
  return Boolean(req.researcherId);
}
