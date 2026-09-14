import { prisma } from '../../lib/prisma';
import { getResearcherId } from '../../context/researcherContext';
import { publicationState } from '../../lib/thesisView';
import { handleOf, handlesOf, publishedEntries, type PublishedEntry } from '../../services/publishedThesis';
import { gapList, unargued } from '../../services/thesisPredicates';
import { answer } from './thesisRefusals';

// ---------------------------------------------------------------------------
// list_theses({})
// PUBLIC read · not paid — docs/gf-thesis-flows.md A4 :1426–:1432, T5 :840–:842.
//
// "anonymous: [{ thesisId, claim, provision, publishedAt, author: handle, contentHash }] for theses with
// PUBLISHED(t); nothing else exists to an anonymous caller. researcher: their own theses — each with head,
// published, headIsPublished, the framing attached, counts of unargued mentions and open gaps — and every
// published thesis as above." It closes finding 30: every thesis tool needed an id nobody could list.
//
// ONE BEHAVIOUR, TWO LEVELS OF ACCESS (evidence A4's rule for a public read). The published list is the SAME
// list, built by the same function, for everyone; a researcher in context additionally sees their own. It
// refuses nothing, writes nothing and spends nothing.
//
// THE AUTHOR IS `Researcher.handle` — the self-chosen pseudonym, the only public identifier (schema :33). A
// published thesis whose author row is missing is a foreign-key violation, not an answer: it THROWS, never
// `author: null` (R47 §6-R8). `headIsPublished` is `lib/thesisView`'s, the one rule for what the public sees;
// the two counts are UNARGUED and GAP_LIST, CALLED. The published list is `services/publishedThesis`'s
// `publishedEntries`, which `GET /api/thesis` answers too (thesis step 23): the tool and the route cannot differ.
// ---------------------------------------------------------------------------

export const listThesesSchema = {};

interface OwnEntry {
  thesisId: string;
  claim: string | null;
  provision: string | null;
  headVersionId: string | null;
  publishedVersionId: string | null;
  headIsPublished: boolean;
  framingIds: string[];
  unarguedMentions: number;
  openGaps: number;
}

export async function listThesesHandler(): Promise<string> {
  return answer(async (): Promise<PublishedEntry[] | { theses: OwnEntry[]; published: PublishedEntry[] }> => {
    const published = await publishedEntries();
    const researcherId = getResearcherId();
    if (researcherId === null) return published;
    return { theses: await ownTheses(researcherId), published };
  });
}

/** The caller's own theses, each with its standing (A4 :1429–:1431). */
async function ownTheses(researcherId: string): Promise<OwnEntry[]> {
  const theses = await prisma.thesis.findMany({
    where: { createdById: researcherId },
    select: { id: true, provision: true, headVersionId: true, publishedVersionId: true, publishedAt: true, publishedById: true },
  });
  const handles = await handlesOf(theses.flatMap((t) => (t.publishedById === null ? [] : [t.publishedById])));

  const entries: OwnEntry[] = [];
  for (const thesis of theses) {
    const versions = await prisma.thesisVersion.findMany({
      where: { thesisId: thesis.id },
      select: { id: true, claim: true, createdAt: true },
    });
    const state = publicationState(
      {
        headVersionId: thesis.headVersionId,
        publishedVersionId: thesis.publishedVersionId,
        publishedAt: thesis.publishedAt,
        publishedBy:
          thesis.publishedById === null ? null : { handle: handleOf(handles, thesis.publishedById, thesis.id) },
      },
      versions,
    );
    const headMentions =
      thesis.headVersionId === null
        ? []
        : await prisma.thesisMention.findMany({
            where: { versionId: thesis.headVersionId },
            select: {
              kind: true,
              name: true,
              debateSession: { select: { status: true, recordFileHash: true, thesisId: true } },
            },
          });
    const decisions = await prisma.thesisGapDecision.findMany({ where: { thesisId: thesis.id } });
    const framings = await prisma.framing.findMany({ where: { thesisId: thesis.id }, select: { id: true } });
    const cited = headMentions.map((m) => ({ kind: m.kind, name: m.name, debate: m.debateSession }));

    entries.push({
      thesisId: thesis.id,
      claim: versions.find((v) => v.id === thesis.headVersionId)?.claim ?? null,
      provision: thesis.provision,
      headVersionId: state.headVersionId,
      publishedVersionId: state.publishedVersionId,
      headIsPublished: state.headIsPublished,
      framingIds: framings.map((f) => f.id),
      unarguedMentions: unargued({ thesisId: thesis.id }, cited).length,
      openGaps: gapList(decisions, thesis.id, headMentions.map((m) => m.name)).filter((g) => g.readsAs === 'OPEN').length,
    });
  }
  return entries;
}
