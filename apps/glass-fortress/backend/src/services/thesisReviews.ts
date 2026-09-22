import { prisma } from '../lib/prisma';
import { namedRecordOf, resolveRecordByName } from './corpusReads';
import type { ContentUnit, Moved } from './evidencePredicates';
import {
  latestDecisionOf,
  movedFrom,
  recordRowOf,
  type Cause,
  type LatestDecision,
  type NamedRecord,
} from './evidenceReviews';
import { handleOf, handlesOf } from './publishedThesis';
import { REVIEW_KINDS, reviewCommand, reviews, type CitedOn, type ReviewEntry, type ListScope } from './thesisPredicates';
import { resolveTrajectoryCitations, type ResolvedTrajectoryCitation, type TrajectoryCurrency } from './trajectoryCitation';

// ---------------------------------------------------------------------------
// WHAT AN AUTHOR OWES, AS A LIST — docs/gf-thesis-flows.md T6 :863–:882, A4 :1523–:1525; thesis step 24.
//
// "One entry per thing owed on the caller's theses, oldest first … an empty list is an answer." STOP-SHAPED, like a walk
// stop and like the evidence reviews: the material, old beside new, and one command to paste. A READ THAT RETURNS WORK AND
// CHANGES NOTHING — nothing here writes.
//
// IT RENDERS AND ORDERS; IT NEVER DECIDES AN ARM. What is owed is REVIEWS(caller), `thesisPredicates.reviews`, CALLED once;
// every entry below is one of its entries, verbatim, with three things added: the instant it became owed, the material a
// researcher reads, and — for an unargued citation — the command with the record the ONE resolver named (the R50 sketch
// §6-D9). FLAGGED's material is evidence's ONE loader, asked from the PIN instead of from `affirmed` (R-iii).
//
// THE ENVELOPE IS `{ owed, reviews }`, THE COUNT FIRST (the researcher's ruling, 2026-09-14; A4 :1524 amended in place).
//
// `scope` (docs/gf-ui-flows.md §7.1 :320–:324; UI-2, 2026-09-15): `mine`, the default, is today's answer byte for byte;
// `all` is REVIEWS over every thesis, `owed` counting all, and every entry carries its AUTHOR (the handle) and `mine`
// — whether the thesis is the caller's — the two keys `list_theses` adds at `all`, with one meaning each. The commands
// are unchanged: each still writes only as the author (thesis A7 :1685).
// ---------------------------------------------------------------------------

/** FLAGGED's material (R-iii): the pin beside CURRENT, what moved, why, and what E3 last decided about the record. */
interface FlaggedMaterial {
  versionId: string;
  record: NamedRecord;
  pin: { hash: string; chunks: ContentUnit[] };
  current: { hash: string; chunks: ContentUnit[] } | null;
  moved: Moved | null;
  cause: Cause[];
  decision: LatestDecision | null;
}

/** STALE_TRAJECTORY's material: the cited pass beside the newest one. */
interface StaleMaterial {
  citedOn: CitedOn[];
  cited: Pick<ResolvedTrajectoryCitation, 'claimText' | 'url' | 'finalState' | 'changes'> & { computation: { id: string; computedAt: string } };
  currency: TrajectoryCurrency;
}

/** UNARGUED's material: the citation to argue — the record at its pin. */
interface UnarguedMaterial {
  versionId: string;
  record: NamedRecord;
  pin: string;
}

type ThesisReview = ReviewEntry & { owedSince: Date; material: FlaggedMaterial | StaleMaterial | UnarguedMaterial };

/** An entry at `scope: 'all'`: the review, and whose thesis it is on (§7.1 :323). */
type AttributedReview = ThesisReview & { author: string; mine: boolean };

export interface ThesisReviewList {
  owed: number;
  /** At `mine` every entry is a `ThesisReview`; at `all` every entry is an `AttributedReview`. */
  reviews: (ThesisReview | AttributedReview)[];
}

/** The two instants an entry's pointers read from, and the thesis's author — loaded once per thesis. */
interface ThesisInstants {
  headVersionId: string;
  headCreatedAt: Date;
  publishedAt: Date | null;
  createdById: string;
}

/**
 * REVIEWS over the scope's theses, oldest first, each with its material and ONE command. Writes nothing. At `all`
 * each entry also names its author and whether the thesis is the caller's.
 */
export async function listThesisReviews(researcherId: string, scope: ListScope = 'mine'): Promise<ThesisReviewList> {
  const owed = await reviews(researcherId, scope);
  const instants = new Map<string, ThesisInstants>();
  const staleIds = owed.filter((e) => e.kind === 'STALE_TRAJECTORY').map((e) => e.name);
  const { resolved } = await resolveTrajectoryCitations(staleIds);

  const rendered: ThesisReview[] = [];
  for (const entry of owed) {
    const at = instants.get(entry.thesisId) ?? (await instantsOf(entry.thesisId));
    instants.set(entry.thesisId, at);

    switch (entry.kind) {
      case 'UNARGUED':
        rendered.push(await unarguedReview(entry, at));
        break;
      case 'FLAGGED':
        rendered.push(await flaggedReview(entry, at));
        break;
      case 'STALE_TRAJECTORY': {
        const cited = resolved.find((t) => t.id === entry.name);
        if (cited === undefined) {
          throw new Error(
            `thesisReviews: REVIEWS owes trajectory ${entry.name} on thesis ${entry.thesisId} and the ONE resolver no longer ` +
              'holds it — the two reads disagree about a row that is never deleted.',
          );
        }
        rendered.push(staleReview(entry, at, cited));
        break;
      }
    }
  }

  rendered.sort(
    (a, b) =>
      a.owedSince.getTime() - b.owedSince.getTime() ||
      REVIEW_KINDS.indexOf(a.kind) - REVIEW_KINDS.indexOf(b.kind) ||
      byCodeUnit(a.thesisId, b.thesisId) ||
      byCodeUnit(a.name, b.name),
  );
  if (scope === 'mine') return { owed: rendered.length, reviews: rendered };

  // AT `all`, WHOSE THESIS EACH ENTRY IS ON: the author's handle (the only public identifier) through ONE query, and
  // `mine` from the same column `list_theses` reads it from — `Thesis.createdById`, never the publisher.
  const handles = await handlesOf([...instants.values()].map((at) => at.createdById));
  const attributed: AttributedReview[] = rendered.map((entry) => {
    const at = instants.get(entry.thesisId);
    if (at === undefined) throw new Error(`thesisReviews: entry ${entry.name} on thesis ${entry.thesisId} was rendered with no instants loaded.`);
    return { ...entry, author: handleOf(handles, at.createdById, entry.thesisId), mine: at.createdById === researcherId };
  });
  return { owed: attributed.length, reviews: attributed };
}

/** Code-unit order — the order the list states, never the locale's. */
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

async function instantsOf(thesisId: string): Promise<ThesisInstants> {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: { headVersionId: true, publishedAt: true, createdById: true },
  });
  const headVersionId = thesis?.headVersionId ?? null;
  if (thesis === null || headVersionId === null) {
    throw new Error(`thesisReviews: thesis ${thesisId} was listed by REVIEWS and has no head version on a second read.`);
  }
  const head = await prisma.thesisVersion.findUnique({ where: { id: headVersionId }, select: { createdAt: true } });
  if (head === null) {
    throw new Error(`thesisReviews: thesis ${thesisId} points at head ${headVersionId}, which does not exist.`);
  }
  return { headVersionId, headCreatedAt: head.createdAt, publishedAt: thesis.publishedAt, createdById: thesis.createdById };
}

/** The published instant an entry on PUBLISHED(t) reads — a thesis with a published version has one, or it is malformed. */
function publishedAtOf(entry: ReviewEntry, at: ThesisInstants): Date {
  if (at.publishedAt === null) {
    throw new Error(`thesisReviews: ${entry.kind} ${entry.name} is owed on the PUBLISHED version of ${entry.thesisId}, which has no publishedAt.`);
  }
  return at.publishedAt;
}

const later = (a: Date, b: Date): Date => (a.getTime() >= b.getTime() ? a : b);

/** The record a citation names, through the ONE resolver — a name the corpus no longer resolves is a malformed citation. */
async function recordNamed(name: string, mentionId: string): Promise<NamedRecord> {
  const resolved = await resolveRecordByName(name);
  if (resolved === null) {
    throw new Error(`thesisReviews: mention ${mentionId} cites #ev_${name}, which no record of the corpus resolves.`);
  }
  return namedRecordOf(resolved);
}

/** The pin a citation carries — an EVIDENCE mention always has one (CHECK `ThesisMention_fields_by_kind`). */
async function pinOf(mentionId: string): Promise<string> {
  const mention = await prisma.thesisMention.findUnique({ where: { id: mentionId }, select: { contentVersionHash: true } });
  const pin = mention?.contentVersionHash ?? null;
  if (pin === null) throw new Error(`thesisReviews: EVIDENCE mention ${mentionId} carries no pin — a malformed citation.`);
  return pin;
}

async function unarguedReview(entry: Extract<ReviewEntry, { kind: 'UNARGUED' }>, at: ThesisInstants): Promise<ThesisReview> {
  const record = await recordNamed(entry.name, entry.mentionId);
  return {
    ...entry,
    // THE TOOL'S COMMAND, from the ONE builder REVIEWS used — with the record named, so it pastes as written.
    command: reviewCommand('UNARGUED', entry.thesisId, at.headVersionId, record),
    // An unargued HEAD citation is owed from the moment the head was written.
    owedSince: at.headCreatedAt,
    material: { versionId: entry.versionId, record, pin: await pinOf(entry.mentionId) },
  };
}

async function flaggedReview(entry: Extract<ReviewEntry, { kind: 'FLAGGED' }>, at: ThesisInstants): Promise<ThesisReview> {
  const row = await recordRowOf(entry.name);
  if (row === null) {
    throw new Error(`thesisReviews: mention ${entry.mentionId} is FLAGGED and no evidence row holds ${entry.name} — \`flagged\` answers unflagged on none.`);
  }
  const pin = await pinOf(entry.mentionId);
  const material = await movedFrom(row, pin);
  if (material === null) {
    throw new Error(`thesisReviews: mention ${entry.mentionId} pins ${pin}, which is not a stored version of ${entry.name} — a malformed pin.`);
  }
  const decision = await latestDecisionOf(entry.name);

  // THE MOMENT EACH REASON AROSE — the earliest of them, and never before the version was published (the R50 sketch §6-D7).
  const moments = entry.reasons.flatMap((reason): Date[] => {
    if (reason === 'WITHDRAWN') {
      if (decision?.type !== 'WITHDRAW') {
        throw new Error(`thesisReviews: ${entry.name} is WITHDRAWN and its latest review decision is not a WITHDRAW.`);
      }
      return [decision.at];
    }
    return material.movedAt === null ? [] : [material.movedAt];
  });
  const published = publishedAtOf(entry, at);
  const earliest = moments.reduce<Date | null>((first, moment) => (first === null || moment < first ? moment : first), null);

  return {
    ...entry,
    owedSince: earliest === null ? published : later(published, earliest),
    material: {
      versionId: entry.versionId,
      record: await recordNamed(entry.name, entry.mentionId),
      pin: material.from,
      current: material.current,
      moved: material.moved,
      cause: material.cause,
      decision,
    },
  };
}

function staleReview(
  entry: Extract<ReviewEntry, { kind: 'STALE_TRAJECTORY' }>,
  at: ThesisInstants,
  cited: ResolvedTrajectoryCitation,
): ThesisReview {
  const currency = cited.currency;
  if (currency.state !== entry.state || !('latestComputedAt' in currency)) {
    throw new Error(
      `thesisReviews: trajectory ${entry.name} read ${entry.state} for REVIEWS and ${currency.state} for its material — a ` +
        'detection pass landed between the two reads; read the list again.',
    );
  }
  // The citing instant: the PUBLISHED pointer from its publication, HEAD from its writing — the earlier where both cite.
  const citing = entry.citedOn
    .map((c) => (c.published ? publishedAtOf(entry, at) : at.headCreatedAt))
    .reduce((first, moment) => (moment < first ? moment : first));
  return {
    ...entry,
    owedSince: later(citing, new Date(currency.latestComputedAt)),
    material: {
      citedOn: entry.citedOn,
      cited: {
        claimText: cited.claimText,
        url: cited.url,
        finalState: cited.finalState,
        changes: cited.changes,
        computation: { id: cited.computation.id, computedAt: cited.computation.computedAt },
      },
      currency,
    },
  };
}
