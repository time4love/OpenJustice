import type { DocumentOpening } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { opened, publicDocument } from './documentPredicates';
import { EVER_PUBLISHED } from './evidencePredicates';

// ---------------------------------------------------------------------------
// OPENED(d) AND PUBLIC(d), LOADED — docs/gf-document-flows.md §7 :791–:801, A3 :1377–:1380 as CONFORMED 2026-09-26 (the
// researcher, R84 Q2 and Q9); document plan step 34 :266–:268.
//
// THE ONE LOADER of what publication has opened of a document. `list_documents`' `opening`, `check_on_chain_status`'s
// PUBLIC(d), `decide_opening`'s CANNOT_NARROW and the public serves all read it here, so no two readers can disagree
// about whether a document is public. It LOADS and the PREDICATES decide — `opened` and `publicDocument`
// (`documentPredicates.ts`), CALLED, never re-spelled.
//
// THREE READS, whatever the number of documents:
//   · the versions citing d that EVER published — `EVER_PUBLISHED`, CALLED (evidencePredicates :405): a withdrawal or a
//     later version dropping the citation closes nothing (§7 :797–:801; thesis T6 :920–:924);
//   · the PUBLISHED attempts OF THOSE VERSIONS — each a publication that carried the mention, the only moments a decision
//     comes into force (A4 :1444 as CONFORMED 2026-09-26, the researcher's Q14: "at the next publication of a version that
//     cites the document"; §7 :772–:774). A REFUSED attempt published nothing, and a version that dropped d carried nothing;
//   · the decisions themselves (A2 :1307, append-only).
// At each such publication the decision IN FORCE is the thesis's LATEST for d by sequence made at or before it (Q9;
// thesis A3 :1404's "decided at or before the publication"), and OPENED(d) is the WIDEST across every publication —
// `opened`'s rule, CALLED with each publication as its key: latest per key, widest across keys.
//
// IT WRITES NOTHING AND OPENS NO TRANSACTION. Derived on every read, never stored (A3 :1389).
// ---------------------------------------------------------------------------

/** What publication has opened of one document: OPENED(d), and PUBLIC(d) = OPENED(d) is defined. */
export interface DocumentOpened {
  opened: DocumentOpening | null;
  public: boolean;
}

/** OPENED(d) and PUBLIC(d) for every commitment asked — an entry for each, `{ opened: null, public: false }` where none. */
export async function openingsOf(commitments: readonly string[]): Promise<Map<string, DocumentOpened>> {
  const wanted = [...new Set(commitments)];
  const answers = new Map<string, DocumentOpened>(wanted.map((c) => [c, { opened: null, public: false }]));
  if (wanted.length === 0) return answers;

  const citing = await prisma.thesisMention.findMany({
    where: { kind: 'DOCUMENT', name: { in: wanted }, thesisVersion: EVER_PUBLISHED },
    select: { name: true, versionId: true, thesisVersion: { select: { thesisId: true } } },
  });
  if (citing.length === 0) return answers;
  const versions = [...new Set(citing.map((m) => m.versionId))];
  const theses = [...new Set(citing.map((m) => m.thesisVersion.thesisId))];

  const [publications, decisions] = await Promise.all([
    prisma.publicationAttempt.findMany({
      where: { versionId: { in: versions }, outcome: 'PUBLISHED' },
      select: { id: true, thesisId: true, versionId: true, createdAt: true },
    }),
    prisma.documentOpeningDecision.findMany({
      where: { commitment: { in: wanted }, thesisId: { in: theses } },
      select: { thesisId: true, commitment: true, sequence: true, opening: true, createdAt: true },
    }),
  ]);

  for (const commitment of wanted) {
    const carrying = new Set(citing.filter((m) => m.name === commitment).map((m) => m.versionId));
    // Every publication of a version citing THIS document, and at each the decisions of its thesis made at or before
    // it — keyed by the publication, so `opened` takes the latest per publication and the widest across them.
    const atEach = publications.filter((p) => carrying.has(p.versionId));
    const inForce = atEach.flatMap((p) =>
      decisions
        .filter((d) => d.commitment === commitment && d.thesisId === p.thesisId && d.createdAt.getTime() <= p.createdAt.getTime())
        .map((d) => ({ ...d, publication: p.id })),
    );
    const keys = atEach.map((p) => p.id);
    const byPublication = (d: (typeof inForce)[number]): string => d.publication;
    answers.set(commitment, {
      opened: opened(commitment, inForce, keys, byPublication),
      public: publicDocument(commitment, inForce, keys, byPublication),
    });
  }
  return answers;
}
