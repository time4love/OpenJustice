import type { Document, Shed } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { CURRENT_EXTRACTOR } from '../lib/documentExtractor';
import { DERIVED_VERSION, currentVersion, custody, type Custody, type DerivedVersion, type DocumentCurrent } from './documentPredicates';
import type { Current } from './evidencePredicates';

// ---------------------------------------------------------------------------
// A CITED DOCUMENT, LOADED ONCE — document plan step 33 :243–:252; document flows §6 :695–:699, A3 :1360–:1371.
//
// THE ONE PLACE A CITATION OF A DOCUMENT IS LOADED. The version write resolves a `#doc_` token through it, and the
// working view's citation resolver names the document's title and custody through it, so the two can never disagree
// about which row a commitment names or what CURRENT(d) is. It is ONE PLURAL READ for every commitment asked — the
// version write runs it before its transaction opens, where the 5 s window is not spent (memory: the window).
//
// PREDICATES ARE CALLED, NEVER RE-SPELLED: CUSTODY(d) and CURRENT(d) are `documentPredicates`', over the rows this
// read loaded, with `CURRENT_EXTRACTOR` handed in as the parameter that module takes (its `currentVersion` header).
//
// OFF THE CHAIN PATH, BY CONSTRUCTION. It imports no registry reader and no anchoring module: ANCHORED(d) is a chain
// read, and the research acts that load a cited document (the version write, the debate) must reach no chain through
// any chain of imports — `test/researchActsReachNoChain.test.ts` holds that transitively. VERIFIED(d), which needs the
// chain, is `documentStanding.ts`'s, imported only by the gated read that shows it.
// ---------------------------------------------------------------------------

/** A document a citation names, with what every caller asks of it — the row, CUSTODY(d) and CURRENT(d). */
export interface CitedDocument {
  document: Document;
  shed: Shed | null;
  versions: DerivedVersion[];
  custody: Custody;
  current: DocumentCurrent;
}

/** Every commitment asked for that names a document, keyed by commitment — ONE read. An absent key names none. */
export async function documentsByCommitment(commitments: readonly string[]): Promise<Map<string, CitedDocument>> {
  const wanted = [...new Set(commitments)];
  if (wanted.length === 0) return new Map();
  const rows = await prisma.document.findMany({
    where: { commitment: { in: wanted } },
    include: { versions: DERIVED_VERSION, shed: true },
  });
  return new Map(
    rows.map((row): [string, CitedDocument] => {
      const { versions, shed, ...document } = row;
      return [
        row.commitment,
        {
          document,
          shed,
          versions,
          custody: custody(document, shed),
          current: currentVersion(document, versions, CURRENT_EXTRACTOR, shed),
        },
      ];
    }),
  );
}

/**
 * CURRENT(d) IN EVIDENCE A3's `Current` SHAPE — so NEEDS_REVIEW and CITATION_CURRENT over a document are evidence's
 * predicates, CALLED: "everything else on the row … is evidence's, and applies to a document without a second spelling"
 * (document §6 :675–:677; A3 :1372). ONE conversion for the debate's checks and both review surfaces. SHED has no such
 * shape — the content was taken back — and each caller answers it before asking.
 */
export function evidenceCurrentOf(current: Exclude<DocumentCurrent, { shed: true }>): Current<never> {
  if ('awaiting' in current) return { defined: false, reason: 'AWAITING_DERIVATION' };
  return { defined: true, kind: 'DOCUMENT', contentVersionHash: current.contentVersionHash };
}

/** A promoted document that was SHED — unreachable until step 35 builds SHED, and named rather than read as awaiting. */
export function documentShedNotBuilt(commitment: string): Error {
  return new Error(
    `${commitment} is a promoted DOCUMENT whose content was taken back (SHED), and what a review owes a shed document is ` +
      'document step 35\'s. Nothing writes a Shed row before it.',
  );
}
