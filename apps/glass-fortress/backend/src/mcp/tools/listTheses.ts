import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { getResearcherId } from '../../context/researcherContext';
import { publicationState } from '../../lib/thesisView';
import { handleOf, handlesOf, publishedEntries, type PublishedEntry } from '../../services/publishedThesis';
import { gapList, unargued, type ListScope } from '../../services/thesisPredicates';
import { answer, refusal, type Refusal } from './thesisRefusals';

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
//
// `scope` — docs/gf-ui-flows.md §7.1 :320–:323, A4 :1426 as amended (UI-2, 2026-09-15): `mine`, the default, is today's
// answer byte for byte; `all` answers EVERY researcher's theses in the researcher shape, each with `author` (the handle)
// and `mine`, beside the same published list. `all` without an identity is refused NO_RESEARCHER BEFORE ANY QUERY
// (plan §5 :903 "on every route and tool") — the one refusal this PUBLIC read makes, and only under that scope.
// ---------------------------------------------------------------------------

/** ONE optional parameter (§7.1 :320–:321); with none, the published theses and, signed in, the caller's own. */
export const listThesesSchema = {
  scope: z
    .enum(['mine', 'all'])
    .optional()
    .describe("mine (default) — your own theses beside the published; all — every researcher's, each with its author and whether it is yours"),
};

export interface ListThesesInput {
  scope?: ListScope;
}

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

/** A thesis at `scope: 'all'`: the researcher shape, plus whose it is (§7.1 :322–:323). */
type AttributedEntry = OwnEntry & { author: string; mine: boolean };

interface ResearcherList {
  theses: (OwnEntry | AttributedEntry)[];
  published: PublishedEntry[];
}

/** THE ONE FUNCTION behind the tool, `GET /api/thesis` (its anonymous answer) and `GET /api/research/theses` (UI-3). */
export async function thesesListOf(input: ListThesesInput = {}): Promise<PublishedEntry[] | ResearcherList | Refusal<'NO_RESEARCHER'>> {
  const scope = input.scope ?? 'mine';
  const researcherId = getResearcherId();
  if (scope === 'all' && researcherId === null) {
    return refusal(
      'NO_RESEARCHER',
      "scope 'all' lists every researcher's theses — working state — and needs a signed-in researcher; with no scope, the published theses are listed to anyone.",
    );
  }
  const published = await publishedEntries();
  if (researcherId === null) return published;
  return { theses: await thesesOf(researcherId, scope), published };
}

export async function listThesesHandler(input: ListThesesInput = {}): Promise<string> {
  return answer(() => thesesListOf(input));
}

/**
 * The theses of the scope, each with its standing (A4 :1429–:1431): at `mine` the caller's own, exactly today's nine
 * keys; at `all` every researcher's, each with `author` and `mine` — computed from `Thesis.createdById`, the author.
 */
async function thesesOf(researcherId: string, scope: ListScope): Promise<(OwnEntry | AttributedEntry)[]> {
  const theses = await prisma.thesis.findMany({
    where: scope === 'mine' ? { createdById: researcherId } : {},
    select: { id: true, provision: true, headVersionId: true, publishedVersionId: true, publishedAt: true, publishedById: true, createdById: true },
  });
  const handles = await handlesOf([
    ...theses.flatMap((t) => (t.publishedById === null ? [] : [t.publishedById])),
    ...(scope === 'all' ? theses.map((t) => t.createdById) : []),
  ]);

  const entries: (OwnEntry | AttributedEntry)[] = [];
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

    const own: OwnEntry = {
      thesisId: thesis.id,
      claim: versions.find((v) => v.id === thesis.headVersionId)?.claim ?? null,
      provision: thesis.provision,
      headVersionId: state.headVersionId,
      publishedVersionId: state.publishedVersionId,
      headIsPublished: state.headIsPublished,
      framingIds: framings.map((f) => f.id),
      unarguedMentions: unargued({ thesisId: thesis.id }, cited).length,
      openGaps: gapList(decisions, thesis.id, headMentions.map((m) => m.name)).filter((g) => g.readsAs === 'OPEN').length,
    };
    entries.push(
      scope === 'mine'
        ? own
        : { ...own, author: handleOf(handles, thesis.createdById, thesis.id), mine: thesis.createdById === researcherId },
    );
  }
  return entries;
}
