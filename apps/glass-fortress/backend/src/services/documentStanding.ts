import { prisma } from '../lib/prisma';
import { standingsOf } from './anchorDocuments';
import { openDocumentRegistryWindow } from './anchorSnapshots';
import { documentsByCommitment, type CitedDocument } from './documentCitation';
import { readObject } from './documentBucket';
import { verifiedDocument } from './documentPredicates';
import type { DocumentVerification, DocumentVerified } from './evidencePredicates';

// ---------------------------------------------------------------------------
// VERIFIED(d) FOR A CITED DOCUMENT — thesis A4 :1476's DOCUMENT arm (R81 QC) and, since document step 34, the publication
// gate's (the researcher's Q1, `R84-review-state.md` Entry 3): VERIFIED(d) as document A6 :1529 reads it — RECOMPUTABLE(d)
// AND ANCHORED(d) (A3 :1367).
//
// THE ONE MODULE THAT ASKS THE CHAIN FOR A CITED DOCUMENT. ANCHORED(d) is a chain read (A3 :1366) and RECOMPUTABLE of a
// HELD document hashes its bytes (A3 :1361), so this module reads the registry and the bucket on every read that shows
// or grades a cited document — "computed on read and none is stored" (A3 :1389). Its importers are THREE, all outside
// the research acts: `mcp/tools/getThesisContext.ts` (a GATED READ) and the two publication tools, `publish_thesis` and
// `check_publication_readiness`, which hand its answer to `evaluatePublication` — no research act imports it, and
// `test/researchActsReachNoChain.test.ts` holds that transitively and names the three. The citation resolver
// (`publishedThesis.ts`) and the gate's evaluation stay off the chain because research acts import them.
//
// EVERY PREDICATE IS CALLED. `verifiedDocument` composes RECOMPUTABLE and ANCHORED; ANCHORED's answer is `standingsOf`'s,
// which already folds A3 :1366's capture arm through `standingOf`, so its verdict is handed in as `attributed` and the
// capture arm is not asked twice (`equalCapture` null). A document the chain could not answer for is `{ unread }`,
// NAMING THE OUTAGE (Q1 (ii)): the gate refuses by that name, and the working view shows it false (§4 :447).
//
// COST, recorded as a LOW (R81 sketch [R1-3]): about two RPC reads and, for a HELD document, one bucket read and a hash,
// per cited document, sequentially. §12's measurement decides whether it ever needs batching.
// ---------------------------------------------------------------------------

/** VERIFIED(d) for each cited document, keyed by commitment — or the outage that kept the chain from answering. */
export async function verifiedOf(cited: ReadonlyMap<string, CitedDocument>): Promise<Map<string, DocumentVerified>> {
  const documents = [...cited.values()];
  const standing = await standingsOf(
    openDocumentRegistryWindow(),
    documents.map((c) => ({ commitment: c.document.commitment, docId: c.document.docId, held: c.custody === 'HELD' })),
  );
  const verified = new Map<string, DocumentVerified>();
  for (const { document, shed, custody } of documents) {
    const read = standing.get(document.commitment);
    if (read === undefined) {
      throw new Error(`documentStanding: standingsOf answered nothing for ${document.commitment} — it answers every document asked.`);
    }
    if ('unread' in read) {
      verified.set(document.commitment, { unread: read.unread });
      continue;
    }
    // The HELD arm's bytes — the object the row's `bytes` column keys (A2 :1267); no other custody holds any.
    const bytes = custody === 'HELD' && document.bytes !== null ? await readObject(document.bytes) : null;
    verified.set(document.commitment, { verified: verifiedDocument(document, shed, bytes, () => read.anchored) });
  }
  return verified;
}

/**
 * THE PUBLICATION TOOLS' ONE ASK — Q1: the documents version `versionId` cites (its DOCUMENT mentions, the names check 18
 * and rows 5–10 examine), loaded through `documentCitation` (the one loader), and VERIFIED(d) for each, as
 * `evaluatePublication` takes it. A version citing no document asks nothing of the chain: the answer is ASKED and empty,
 * because there was nothing to ask.
 */
export async function documentVerificationOf(versionId: string): Promise<DocumentVerification> {
  const mentions = await prisma.thesisMention.findMany({ where: { versionId, kind: 'DOCUMENT' }, select: { name: true } });
  const cited = await documentsByCommitment(mentions.map((m) => m.name));
  if (cited.size === 0) return { asked: true, byCommitment: new Map() };
  return { asked: true, byCommitment: await verifiedOf(cited) };
}
