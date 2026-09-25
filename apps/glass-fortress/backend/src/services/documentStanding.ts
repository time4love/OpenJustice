import { anchoredOf } from './anchorDocuments';
import { openDocumentRegistryWindow } from './anchorSnapshots';
import type { CitedDocument } from './documentCitation';
import { readObject } from './documentBucket';
import { verifiedDocument } from './documentPredicates';

// ---------------------------------------------------------------------------
// VERIFIED(d) FOR A CITED DOCUMENT — thesis A4 :1476's DOCUMENT arm (R81 QC): `verified: boolean`, VERIFIED(d) as document
// A6 :1529 reads it — RECOMPUTABLE(d) AND ANCHORED(d) (A3 :1367).
//
// THE ONE MODULE ON THE WORKING VIEW'S PATH THAT ASKS THE CHAIN. ANCHORED(d) is a chain read (A3 :1366) and RECOMPUTABLE
// of a HELD document hashes its bytes (A3 :1361), so this module reads the registry and the bucket on every read that
// shows a cited document — "computed on read and none is stored" (A3 :1389). Its ONE importer is
// `mcp/tools/getThesisContext.ts`, a GATED READ; no research act imports it, and `test/researchActsReachNoChain.test.ts`
// holds that transitively. The citation resolver (`publishedThesis.ts`) stays off the chain because a research act —
// `debateState.ts` — imports it.
//
// EVERY PREDICATE IS CALLED. `verifiedDocument` composes RECOMPUTABLE and ANCHORED; ANCHORED's answer is `anchoredOf`'s,
// which already folds A3 :1366's capture arm through `standingOf`, so its verdict is handed in as `attributed` and the
// capture arm is not asked twice (`equalCapture` null). A chain that cannot be read answers FALSE, never a refusal of
// the read (`anchoredOf`'s header, §4 :447).
//
// COST, recorded as a LOW (R81 sketch [R1-3]): about two RPC reads and, for a HELD document, one bucket read and a hash,
// per cited document, sequentially. §12's measurement decides whether it ever needs batching.
// ---------------------------------------------------------------------------

/** VERIFIED(d) for each cited document, keyed by commitment. */
export async function verifiedOf(cited: ReadonlyMap<string, CitedDocument>): Promise<Map<string, boolean>> {
  const documents = [...cited.values()];
  const standing = await anchoredOf(
    openDocumentRegistryWindow(),
    documents.map((c) => ({ commitment: c.document.commitment, docId: c.document.docId, held: c.custody === 'HELD' })),
  );
  const verified = new Map<string, boolean>();
  for (const { document, shed, custody } of documents) {
    const anchored = standing.get(document.commitment)?.anchored ?? false;
    // The HELD arm's bytes — the object the row's `bytes` column keys (A2 :1267); no other custody holds any.
    const bytes = custody === 'HELD' && document.bytes !== null ? await readObject(document.bytes) : null;
    verified.set(document.commitment, verifiedDocument(document, shed, bytes, () => anchored));
  }
  return verified;
}
