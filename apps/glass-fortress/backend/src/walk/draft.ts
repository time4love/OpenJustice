import type { Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// THE DRAFT — docs/gf-interaction-flows.md A2: the marking page's working
// state, one per page, transient, discarded on promotion. A5 says "the draft
// cleared" in three tools (approve, resolve, reset) and A6's DELETE /draft is
// the researcher's cancel; the four columns it names are cleared HERE, once,
// so that the day A2's draft gains a column there is one payload to change
// and not four (ruled 2026-09-05).
//
// The payload is an inline literal, not a shared constant: the I10 scan reads
// the columns of every `data: { … }` on the page and sees nothing through a
// reference.
// ---------------------------------------------------------------------------

/** Clear the page's draft — all four of A2's draft columns, in the caller's transaction. */
export async function clearDraft(tx: Prisma.TransactionClient, trackedUrlId: string): Promise<void> {
  await tx.trackedUrl.update({
    where: { id: trackedUrlId },
    data: { draftCapture: null, draftSelectors: [], draftTrusted: [], draftReturnedAt: null },
  });
}
