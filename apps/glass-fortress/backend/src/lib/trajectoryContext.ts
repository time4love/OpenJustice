import { prisma } from './prisma';
import {
  getClaimTrajectories,
  claimHash,
  normaliseClaim,
  MIN_CLAIM_LENGTH,
  MIN_TRANSITIONS,
} from '../services/claimTrajectory';
import { parseDiffItems } from './diffItems';

// ---------------------------------------------------------------------------
// Making claim trajectories visible to the agents that reason over a corpus.
//
// Every thesis-stage agent used to receive Evidence rows and their AI-written
// summaries, and nothing else. That is the WEAKEST layer this platform holds:
// a model's characterisation of a change. The strongest layer — a deterministic
// string search over archived text, reproducible by anyone without trusting this
// platform at all — was invisible to them.
//
// The cost was measured, not theorised. A framing assessor told a researcher
// their evidence showed "no restoration" of removed safety text, citing an
// anchored record. The archive showed five claims removed on 2022-08-05 and
// restored on 2022-09-06. The researcher was right; the assessor could not see
// the layer that proved it, and contradicted them with a citation.
//
// So trajectories are supplied alongside the evidence, and supplied with an
// explicit PRECEDENCE RULE. Pasting them in as more text would leave a model
// weighing a reproducible string search and a model-written summary as equals,
// which is the whole error. Where they conflict, the trajectory governs.
// ---------------------------------------------------------------------------

/**
 * UNCITED groups shown per URL. Enough to carry the pattern; not enough to swamp
 * the prompt.
 *
 * This is a budget for CONTEXT, and for nothing else. Citations draw from no
 * budget at all — every cited movement is always rendered.
 *
 * The two are different in kind and must not compete. A cited movement is
 * SUPPORT: completeness is the whole point, because a partial citation set is a
 * dishonest one. An uncited movement on the same page is CONTEXT: a sample has
 * always been sufficient, and nobody ever needed all 21 groups a page can produce.
 * While they shared one allowance, a thesis citing eight movements silently paid
 * for its own honesty by starving the critique of page context — measured on the
 * real thesis, which lost all five context groups and, with them, one of the
 * critique's three counter-arguments.
 */
const MAX_CONTEXT_GROUPS_PER_URL = 8;
/** Claim texts are quoted for verification, not read in full. */
const CLAIM_EXCERPT = 220;
const MAX_CLAIMS_PER_GROUP = 4;

export interface TrajectoryContext {
  url: string;
  patternHash: string;
  claimCount: number;
  transitions: number;
  finalState: 'PRESENT' | 'REMOVED';
  /** The flips only, each with the archived snapshot a reader can open. */
  changes: { snapshotDate: string; present: boolean; snapshotUrl: string }[];
  claims: string[];
  /**
   * Evidence in this corpus that contains these exact claims, and how many.
   *
   * Overlap is computed by matching CLAIM HASHES against the evidence's own diff
   * items — not by matching dates. A date match would tar a whole evidence record
   * because part of it coincides with a trajectory, and an evidence record is not
   * one assertion: a single diff holds many items, each with its own
   * classification since categories moved to the item. Eight of fourteen items
   * being a trajectory's claims says nothing about the other six.
   */
  overlappingEvidence: { fileHash: string; sharedItems: number }[];
  /**
   * The ClaimTrajectory ids THIS THESIS cites that land in this group.
   *
   * Matched by claim hash, never by id or patternHash. A citation is pinned to
   * the detection pass it was made against; `patternHash` hashes the presence
   * vector and so changes the moment a snapshot is added, and the row ids change
   * with it. The claim hash is the only identity that survives a new pass, which
   * is the whole point of citing a claim rather than a pattern.
   *
   * Empty means the thesis does not cite this group — it is here because it is
   * on a page the cited evidence came from, which is context, not support.
   */
  citedIds: string[];
}

/**
 * How much of one evidence record any trajectory actually accounts for.
 *
 * The second number is the one that matters. A significant item that no
 * trajectory covers — because it flipped only once, or fell under the length
 * threshold, or was never extracted as a candidate — is INDEPENDENT of every
 * trajectory here, and discounting it because its neighbours overlap is exactly
 * how a consequential claim gets lost in a crowd.
 */
export interface EvidenceCoverage {
  fileHash: string;
  totalItems: number;
  itemsInTrajectories: number;
  /** Items carrying their own classification that no trajectory covers. */
  independentSignificantItems: number;
}

export interface TrajectoryBundle {
  /** The groups shown, capped per URL. */
  trajectories: TrajectoryContext[];
  /** Computed against EVERY group, not just the shown ones. */
  coverage: EvidenceCoverage[];
  /**
   * Groups detected but not shown, because of the per-URL cap.
   *
   * Reported rather than dropped silently. A truncated set makes a partial answer
   * look complete, and a reader given eight of fifteen findings with no marker has
   * no way to know the difference.
   */
  omittedGroups: number;
  /**
   * Cited ClaimTrajectory ids that no group on any of these pages contains.
   *
   * Reported rather than dropped, for the same reason as `omittedGroups`: an
   * agent told a thesis cites eight movements, and shown six, has no way to know
   * the difference. A citation lands here when the claim is no longer followed by
   * the latest pass, or when it belongs to a page none of the cited evidence
   * came from.
   */
  citedNotResolved: string[];
}

/**
 * Trajectories for every tracked page the supplied evidence came from.
 *
 * Evidence reaches a tracked URL through the diff it was promoted from. Evidence
 * with no urlVersionDiffId — an article, a document — contributes no trajectories,
 * which is correct: nothing archived it over time.
 */
interface DiffItemRef {
  hash: string;
  /** Normalised quote, kept for containment matching. Empty when unusable. */
  text: string;
  significant: boolean;
}

/** The claim identities a diff's items would produce, and which are classified. */
function diffItemRefs(deletedText: string, addedText: string): DiffItemRef[] {
  const all: DiffItemRef[] = [];
  for (const raw of [deletedText, addedText]) {
    for (const item of parseDiffItems(raw)) {
      const normalised = normaliseClaim(item.exactQuote);
      // Below the length threshold a quote is never followed as a trajectory and
      // is not safe to match by containment either — a short string is a
      // substring of unrelated claims by accident, and a false match would
      // discount a classified item, which is the direction that LOSES a finding.
      const usable = normalised.length >= MIN_CLAIM_LENGTH;
      all.push({
        hash: usable ? claimHash(normalised) : '',
        text: usable ? normalised : '',
        significant: item.investigativeCategories.length > 0,
      });
    }
  }
  return all;
}

/**
 * Whether a diff item is the same assertion as one of these trajectory claims.
 *
 * Exact hash first — that is identity, and identity must stay exact. Containment
 * second, because extraction genuinely emits nested quotes: one real trajectory
 * group contains both a sentence and that same sentence plus the paragraph
 * following it. Exact hashing treats those as unrelated, so an item matching the
 * longer form would be counted INDEPENDENT while being partly covered — which
 * overstates corroboration, the dangerous direction for a signal that feeds how
 * much weight a model gives evidence.
 *
 * Containment is not fuzziness: `a.includes(b)` is exact about a real relation.
 * O(items × claims) over ~58 normalised strings, computed once per record.
 */
function coveredBy(item: DiffItemRef, claimHashes: ReadonlySet<string>, claimTexts: readonly string[]): boolean {
  if (!item.text) return false;
  if (claimHashes.has(item.hash)) return true;
  return claimTexts.some((c) => item.text.includes(c) || c.includes(item.text));
}

/**
 * A bundle carrying nothing.
 *
 * Named rather than written inline at each call site: every field added to
 * `TrajectoryBundle` since it was introduced has broken a dozen literals, and a
 * caller repairing one by hand is a caller deciding what a new field means.
 */
export function emptyTrajectoryBundle(): TrajectoryBundle {
  return { trajectories: [], coverage: [], omittedGroups: 0, citedNotResolved: [] };
}

interface CitedClaims {
  /** Cited row ids, keyed by claim hash. */
  byClaimHash: ReadonlyMap<string, string[]>;
  /** Every tracked page the cited claims live on. */
  urls: string[];
}

/**
 * Cited trajectory rows, keyed by CLAIM HASH rather than by row id.
 *
 * A citation pins the detection pass it was made against, so its row ids belong
 * to that pass. Rows are never updated in place — a new pass writes new rows —
 * and `patternHash` changes whenever a snapshot is added. The claim hash is the
 * only identity that survives, so it is the only safe join between what a thesis
 * cited and what the latest pass detected.
 */
async function loadCitedClaims(ids: readonly string[]): Promise<CitedClaims> {
  const byClaimHash = new Map<string, string[]>();
  if (ids.length === 0) return { byClaimHash, urls: [] };

  const rows = await prisma.claimTrajectory.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, claimHash: true, trackedUrl: { select: { url: true } } },
  });
  for (const row of rows) {
    const bucket = byClaimHash.get(row.claimHash);
    if (bucket) bucket.push(row.id);
    else byClaimHash.set(row.claimHash, [row.id]);
  }
  // The pages the CITATIONS are on, which is not the same set as the pages the
  // evidence came from. Nothing requires a thesis to cite a trajectory on a page
  // its evidence was promoted from: the publication gate requires evidence, not
  // evidence from the same URL. Deriving the page list from evidence alone made a
  // citation elsewhere resolve to nothing and report itself as "no longer
  // followed" — a page that was never looked at, described as a claim that
  // stopped being true.
  return { byClaimHash, urls: [...new Set(rows.map((r) => r.trackedUrl.url))] };
}

/** The cited ids landing in one group, deduplicated, in the group's claim order. */
function citedIdsIn(
  group: { claims: readonly { claimHash: string }[] },
  citedByClaimHash: ReadonlyMap<string, string[]>,
): string[] {
  const ids = new Set<string>();
  for (const claim of group.claims) {
    for (const id of citedByClaimHash.get(claim.claimHash) ?? []) ids.add(id);
  }
  return [...ids];
}

/**
 * Which groups on one page are rendered: every cited one, plus a sample of the rest.
 *
 * The cap used to keep the LARGEST groups, and on a real thesis that was exactly
 * the wrong key: the citation set had been widened from one ten-claim group to
 * twenty-one claims across eight groups, five of them singletons, because the
 * sentence being supported is a UNIVERSAL and one counter-example falsifies it.
 * Size-ranked truncation dropped every singleton — the narrow set that would have
 * UNDER-supported a true sentence stayed visible, and the correction did not.
 *
 * So a cited group is never dropped, and it does not consume the context budget
 * either. Uncited groups are still sampled by size, which is a rougher key than it
 * looks: the context an adversary actually wants is what else moved ON THE SAME
 * CAPTURES as the cited claims. That is an open question, deliberately not
 * answered by a heuristic invented ahead of an example that needs it.
 *
 * Everything dropped is still counted in `omittedGroups`.
 */
function selectGroups<T extends { transitions: number; claims: readonly { claimHash: string }[] }>(
  groups: readonly T[],
  citedByClaimHash: ReadonlyMap<string, string[]>,
): { selected: T[]; omitted: number } {
  const isCited = (g: T): boolean => g.claims.some((c) => citedByClaimHash.has(c.claimHash));

  // A single flip is an ordinary removal, already fully visible in the forensic
  // timeline, so it is not worth prompt room as context — UNLESS the thesis cites
  // it, in which case it is part of the argument and the threshold has no say.
  //
  // This is not hypothetical. The one cited claim on the real thesis with a single
  // flip is the FDA-approval sentence, removed on 2022-08-05 and never restored —
  // and it is the exact claim the previous critique built a STRONG counter-argument
  // about, while the trajectory proving the removal was filtered out of its input.
  const candidates = groups.filter((g) => isCited(g) || g.transitions >= MIN_TRANSITIONS);
  const context = candidates.filter((g) => !isCited(g)).slice(0, MAX_CONTEXT_GROUPS_PER_URL);
  const keep = new Set<T>([...candidates.filter(isCited), ...context]);
  return {
    // Original order: the render numbers groups positionally, and a stable order
    // keeps those numbers meaningful across a re-read of the same bundle.
    selected: candidates.filter((g) => keep.has(g)),
    // Groups below the threshold that nothing cites were never candidates, and
    // counting them here would report a deliberate exclusion as truncation.
    omitted: candidates.length - keep.size,
  };
}

/**
 * Trajectories for every tracked page the supplied evidence came from, plus how
 * much of each evidence record those trajectories actually account for.
 *
 * Evidence reaches a tracked URL through the diff it was promoted from. Evidence
 * with no urlVersionDiffId — an article, a document — contributes no trajectories,
 * which is correct: nothing archived it over time.
 */
export async function loadTrajectoryContext(
  evidence: readonly { fileHash: string }[],
  /**
   * ClaimTrajectory ids the thesis under discussion cites.
   *
   * Required, deliberately not defaulted, for the same reason the agent's
   * `trajectories` parameter is: a default of `[]` is precisely how a caller
   * silently reasons over a document's citations without them. Pass `[]`
   * explicitly where there is no document yet — framing and synthesis both
   * precede one.
   */
  citedTrajectoryIds: readonly string[],
): Promise<TrajectoryBundle> {
  const { byClaimHash: citedByClaimHash, urls: citedUrls } = await loadCitedClaims(citedTrajectoryIds);

  const rows =
    evidence.length > 0
      ? await prisma.evidence.findMany({
          where: { fileHash: { in: evidence.map((e) => e.fileHash) }, NOT: { urlVersionDiffId: null } },
          select: {
            fileHash: true,
            urlVersionDiff: {
              select: { deletedText: true, addedText: true, trackedUrl: { select: { url: true } } },
            },
          },
        })
      : [];

  // Both sources. Evidence reaches a page through the diff it was promoted from;
  // a citation reaches one directly, and may reach a page no evidence touches.
  const urls = [
    ...new Set([
      ...rows.map((r) => r.urlVersionDiff?.trackedUrl.url).filter((u): u is string => !!u),
      ...citedUrls,
    ]),
  ];

  if (urls.length === 0) {
    return {
      trajectories: [],
      coverage: [],
      omittedGroups: 0,
      citedNotResolved: [...citedTrajectoryIds],
    };
  }
  const trajectories: TrajectoryContext[] = [];
  const coverage: EvidenceCoverage[] = [];
  let omittedGroups = 0;
  const resolvedCited = new Set<string>();

  for (const url of urls) {
    // One page's trajectories must never break the assessment of a corpus drawn
    // from several. A URL never scanned, or whose detection fails, contributes
    // nothing rather than failing the caller.
    let result;
    try {
      // With citations in play the threshold is applied per group in selectGroups,
      // because a cited single-flip claim must survive it. Without them the
      // detector's own default is the filter, exactly as before.
      result = await getClaimTrajectories(
        url,
        citedByClaimHash.size > 0 ? { minTransitions: 1 } : {},
      );
    } catch (err) {
      // Deliberate: one unscanned page must not break an assessment drawn from
      // several. Logged, because "this page contributed nothing" and "detection
      // is broken" look identical in the output otherwise.
      console.warn(
        `[trajectoryContext] trajectories unavailable for ${url}:`,
        err instanceof Error ? err.message : err,
      );
      continue;
    }

    const onThisUrl = rows.filter((r) => r.urlVersionDiff?.trackedUrl.url === url);

    // Coverage claims are scoped to THIS page, and drawn from ALL of its groups.
    //
    // Both halves were wrong first, and both failed the same way — a set that
    // looks complete and is not, feeding a claim about independence:
    //
    //  - Accumulating across the loop let a claim on page B mark an item on page
    //    A as covered. Two government pages sharing 40+ characters of boilerplate
    //    is entirely plausible, and one page's text oscillating says nothing
    //    about the other. Over-matching understates independent evidence, which
    //    is the direction that LOSES a finding.
    //  - Building it from the RENDERED slice meant items covered by group 9+ were
    //    reported independent. The corona page already produces 15 groups against
    //    a cap of 8. Under-matching overstates corroboration.
    //
    // Truncation applies to what is rendered, never to what is reasoned over.
    const urlClaimHashes = new Set<string>();
    const urlClaimTexts: string[] = [];
    for (const group of result.groups) {
      for (const c of group.claims) {
        urlClaimHashes.add(c.claimHash);
        urlClaimTexts.push(normaliseClaim(c.claimText));
      }
    }

    const { selected, omitted } = selectGroups(result.groups, citedByClaimHash);
    omittedGroups += omitted;

    for (const group of selected) {
      const groupHashes = new Set(group.claims.map((c) => c.claimHash));
      const groupTexts = group.claims.map((c) => normaliseClaim(c.claimText));
      const citedIds = citedIdsIn(group, citedByClaimHash);
      for (const id of citedIds) resolvedCited.add(id);

      const overlapping = onThisUrl
        .map((r) => ({
          fileHash: r.fileHash,
          sharedItems: diffItemRefs(
            r.urlVersionDiff?.deletedText ?? '[]',
            r.urlVersionDiff?.addedText ?? '[]',
          ).filter((i) => coveredBy(i, groupHashes, groupTexts)).length,
        }))
        .filter((o) => o.sharedItems > 0);

      trajectories.push({
        url,
        patternHash: group.patternHash,
        claimCount: group.claims.length,
        transitions: group.transitions,
        finalState: group.finalState,
        changes: group.changes.map((c) => ({
          snapshotDate: c.snapshotDate,
          present: c.present,
          snapshotUrl: c.snapshotUrl,
        })),
        // Cited members first. The excerpt is capped, and quoting four arbitrary
        // members of a ten-claim group can quote none of the three the thesis
        // actually rests on — which is the one thing this block exists to show.
        claims: [...group.claims]
          .sort((a, b) => Number(citedByClaimHash.has(b.claimHash)) - Number(citedByClaimHash.has(a.claimHash)))
          .slice(0, MAX_CLAIMS_PER_GROUP)
          .map((c) => (c.claimText.length > CLAIM_EXCERPT ? `${c.claimText.slice(0, CLAIM_EXCERPT)}…` : c.claimText)),
        overlappingEvidence: overlapping,
        citedIds,
      });
    }

    for (const r of onThisUrl) {
      const items = diffItemRefs(r.urlVersionDiff?.deletedText ?? '[]', r.urlVersionDiff?.addedText ?? '[]');
      coverage.push({
        fileHash: r.fileHash,
        totalItems: items.length,
        itemsInTrajectories: items.filter((i) => coveredBy(i, urlClaimHashes, urlClaimTexts)).length,
        independentSignificantItems: items.filter(
          (i) => i.significant && !coveredBy(i, urlClaimHashes, urlClaimTexts),
        ).length,
      });
    }
  }

  return {
    trajectories,
    coverage,
    omittedGroups,
    citedNotResolved: citedTrajectoryIds.filter((id) => !resolvedCited.has(id)),
  };
}

/**
 * Renders trajectories for a prompt, precedence rule included.
 *
 * The rule travels WITH the data rather than living in a system prompt, so an
 * agent cannot receive trajectories without being told what they outrank. A
 * system prompt describing a section that is sometimes absent is a rule that
 * quietly stops applying.
 */
export function formatTrajectoryContext(
  bundle: TrajectoryBundle,
  lang: 'he' | 'en' = 'he',
): string {
  const { trajectories, coverage, omittedGroups, citedNotResolved } = bundle;
  if (trajectories.length === 0) return '';

  const t = STRINGS[lang];

  // Only annotate citation when there is a document doing the citing. Framing and
  // synthesis run before one exists, and labelling every group "not cited" there
  // would report an absence of citations as a property of the trajectories.
  const citedClaims = trajectories.reduce((n, c) => n + c.citedIds.length, 0);
  const citedGroups = trajectories.filter((c) => c.citedIds.length > 0).length;
  const anyCitations = citedClaims > 0 || citedNotResolved.length > 0;

  const blocks = trajectories.map((c, i) => {
    const timeline = c.changes
      .map((ch) => `${ch.snapshotDate}=${ch.present ? t.present : t.removed}`)
      .join(' → ');
    const overlap =
      c.overlappingEvidence.length > 0
        ? `\n      ${t.overlap}: ` +
          c.overlappingEvidence.map((o) => `${o.fileHash} (${t.sharedItems(o.sharedItems)})`).join(', ')
        : '';
    const quotes = c.claims.map((q) => `        · "${q}"`).join('\n');
    const cited = !anyCitations
      ? ''
      : c.citedIds.length > 0
        ? ` · ${t.citedBlock(c.citedIds.length, c.claimCount)}`
        : ` · ${t.notCitedBlock}`;
    const header =
      `  [T${i + 1}] ${c.claimCount} ${t.movedAsUnit} · ${c.transitions} ${t.flips} · ${t.finalState}: ${c.finalState}${cited}\n` +
      `      ${t.page}: ${c.url}\n` +
      `      ${t.timeline}: ${timeline}`;

    // Context is rendered short: shape, timeline, and which evidence shares its
    // claims — but no quotes and no snapshot links. The distinction is of KIND,
    // not of count. Support must be checkable word by word, because a critique
    // rests on the exact string; context only has to be recognisable as a pattern.
    // Nothing is shortened until a document is actually citing, so framing and
    // synthesis — which precede one — read exactly as they did before.
    if (anyCitations && c.citedIds.length === 0) return `${header}${overlap}`;

    return (
      `${header}\n` +
      `      ${t.snapshots}: ${c.changes.map((ch) => ch.snapshotUrl).join(' , ')}${overlap}\n` +
      `      ${t.claims}:\n${quotes}`
    );
  });

  // Only records with something a trajectory does NOT account for. A record fully
  // covered needs no line; a record with uncovered classified items does, because
  // that is the half a reader would otherwise discount by association.
  const uncovered = coverage.filter((c) => c.independentSignificantItems > 0);
  const coverageBlock =
    uncovered.length > 0
      ? `\n\n${t.coverageHeader}\n` +
        uncovered
          .map((c) => `  ${c.fileHash}: ${t.coverageLine(c.itemsInTrajectories, c.totalItems, c.independentSignificantItems)}`)
          .join('\n')
      : '';

  // Never let a capped list read as the whole list, and never let a shortened
  // entry read as a complete account of what is known about that movement.
  const truncationNote = omittedGroups > 0 ? `\n\n${t.omitted(omittedGroups)}` : '';
  const shortenedContext = anyCitations
    ? trajectories.filter((c) => c.citedIds.length === 0).length
    : 0;
  const contextNote = shortenedContext > 0 ? `\n\n${t.contextShort(shortenedContext)}` : '';

  // What the document argues FROM, separated from what merely shares its pages.
  const citationBlock = anyCitations
    ? `\n${t.citationRule(citedClaims, citedGroups)}` +
      (citedNotResolved.length > 0 ? `\n${t.citedUnresolved(citedNotResolved.length)}` : '')
    : '';

  return `${t.header}\n${t.rule}${citationBlock}\n\n${blocks.join('\n\n')}${coverageBlock}${contextNote}${truncationNote}`;
}

const STRINGS = {
  he: {
    header: '--- מסלולי טענות (זיהוי דטרמיניסטי) ---',
    rule:
      'אלה אינן ראיות מסוג נוסף אלא שכבה חזקה יותר — בשאלה אחת מוגדרת. הן חושבו בחיפוש\n' +
      'מחרוזת על טקסט העמוד הארכיוני עצמו, ללא כל מודל, וכל אחת ניתנת לאימות בפתיחת\n' +
      'תצלומי הארכיון וחיפוש הטקסט. סיכומי הראיות שלמעלה נכתבו על ידי מודל.\n' +
      '\n' +
      'כלל הכרעה, ותחומו: מסלול הוא סמכות בשאלה **האם המחרוזת הזו הופיעה בטקסט העמוד\n' +
      'בתצלום הזה** — ותו לא. בסתירה בין מסלול לבין סיכום ראיה, קביעתו העובדתית של\n' +
      'הסיכום בדבר נוכחות היא השגויה. אין נובע מכך שפרשנותו שגויה.\n' +
      'מסלול אינו יודע דבר על מיקום הטקסט בעמוד, על בולטותו, או על השאלה אם הטענה\n' +
      'הוצגה לקורא — טקסט בתפריט ניווט או בכותרת תחתונה ייקרא "קיים" כמו כל טקסט אחר.\n' +
      'אל תתאר טענה כ"לא הוחזרה" אם מסלול מראה שהוחזרה.',
    citationRule: (claims: number, groups: number) =>
      `\nהמסמך מצטט ${String(claims)} טענות ${groups === 1 ? 'במסלול אחד' : `ב-${String(groups)} מסלולים`}. מסלול המסומן "מצוטט" הוא מה\n` +
      'שהתזה נשענת עליו בפועל; מסלול שאינו מצוטט מופיע כאן משום שהוא באותו דף, והוא\n' +
      'הקשר בלבד. בגוף התזה מופיע הסימון ‎#traj_T<n>‎ בסוף המשפט המצטט — כך ניתן\n' +
      'לדעת על אילו מסלולים בדיוק נשען כל משפט. אל תשיב לטענה מתוך מסלול שאינו מצוטט\n' +
      'כאילו הוא הבסיס של המשפט.',
    citedBlock: (cited: number, total: number) =>
      cited === total ? 'מצוטט בתזה (כל הטענות)' : `מצוטט בתזה (${String(cited)} מתוך ${String(total)} טענות)`,
    notCitedBlock: 'אינו מצוטט בתזה',
    citedUnresolved: (n: number) =>
      `(${String(n)} ציטוטים אינם תואמים אף מסלול בזיהוי העדכני — הטענה אינה נעקבת עוד, או שהיא בדף ` +
      'שאף ראיה מצוטטת אינה מגיעה ממנו. הם אינם מוצגים למטה.)',
    contextShort: (n: number) =>
      `(${String(n)} המסלולים שאינם מצוטטים מוצגים בקצרה — צורה, ציר וחפיפה לראיות, ללא ציטוטים ` +
      'וללא קישורי ארכיון. הם הקשר, לא בסיס הטיעון. אם אחד מהם נחוץ לתשובה, אמור זאת במפורש ' +
      'במקום להסתמך על נוסח שלא הוצג לך.',
    movedAsUnit: 'טענות שנעו כיחידה אחת',
    flips: 'היפוכים',
    finalState: 'מצב סופי',
    page: 'דף',
    timeline: 'ציר',
    snapshots: 'תצלומי ארכיון',
    claims: 'טענות',
    present: 'קיים',
    removed: 'הוסר',
    overlap: 'טענות זהות מופיעות בראיות',
    sharedItems: (n: number) => `${n} פריטים משותפים`,
    omitted: (n: number) =>
      `(${n} מסלולים נוספים זוהו ואינם מוצגים כאן. הם נכללו בחישוב הכיסוי — ההשמטה היא בתצוגה בלבד.)`,
    coverageHeader:
      '--- מה שהמסלולים אינם מכסים ---\n' +
      'ראיה מבוססת-דיף אינה טענה אחת: דיף אחד מכיל פריטים רבים, ולכל פריט סיווג משלו.\n' +
      'חפיפה בפריט אחד אינה הופכת את שאר הראיה ללא-עצמאית. וגם היכן שיש חפיפה — מדובר\n' +
      'בתצפית אחת על מצב העמוד בלבד: הסיווג של הראיה, נימוקי הדרג, ההצלבה לאירועים\n' +
      'חיצוניים מתוארכים והדמויות המרכזיות אינם משוכפלים במסלול ואינם מנוכים בשלו.',
    coverageLine: (shared: number, total: number, independent: number) =>
      `${shared} מתוך ${total} פריטים הם טענות של מסלול — לגביהם המסלול והראיה צופים באותו מצב עמוד. ` +
      `${independent} פריטים מסווגים אינם מכוסים באף מסלול, והם ראיה עצמאית לכל דבר.`,
  },
  en: {
    header: '--- CLAIM TRAJECTORIES (deterministic detection) ---',
    rule:
      'These are not another kind of evidence — they are a STRONGER layer, on ONE precise\n' +
      'question. Each is computed by string search over the archived page text itself, with no\n' +
      'model involved, and anyone can verify it by opening the snapshot URLs and searching for\n' +
      'the text. The evidence summaries above were written by a model.\n' +
      '\n' +
      'PRECEDENCE, AND ITS SCOPE: a trajectory is authoritative on whether THIS EXACT STRING was\n' +
      'in the page text at THIS capture — and on nothing else. Where a trajectory and an evidence\n' +
      "summary conflict, the summary's factual assertion about presence is wrong. It does NOT\n" +
      'follow that its interpretation is wrong.\n' +
      'A trajectory knows nothing about position, prominence, or whether a claim was being made to\n' +
      'the reader: text in a nav menu or a footer reads as "present" like any other text.\n' +
      'Never state that a claim was "never restored" or "permanently deleted" when a trajectory\n' +
      'shows otherwise.',
    citationRule: (claims: number, groups: number) =>
      `\nTHIS DOCUMENT CITES ${String(claims)} claims across ${String(groups)} trajector${groups === 1 ? 'y' : 'ies'}.\n` +
      'A trajectory marked CITED is what the thesis actually argues from; an uncited one is\n' +
      'here because it is on the same page, and is context only. In the thesis text, the\n' +
      'marker #traj_T<n> follows the sentence that cites trajectory [Tn], so which claims a\n' +
      'given sentence rests on is readable rather than inferred. Do not answer a sentence\n' +
      'using an uncited trajectory as though it were that sentence\'s basis.',
    citedBlock: (cited: number, total: number) =>
      cited === total ? 'CITED BY THIS THESIS (all claims)' : `CITED BY THIS THESIS (${String(cited)} of ${String(total)} claims)`,
    notCitedBlock: 'not cited by this thesis',
    citedUnresolved: (n: number) =>
      `(${String(n)} citation${n === 1 ? '' : 's'} match no trajectory in the latest detection pass — the claim is ` +
      'no longer followed, or it is on a page none of the cited evidence came from. They are not shown below.)',
    contextShort: (n: number) =>
      `(${String(n)} uncited trajector${n === 1 ? 'y is' : 'ies are'} shown in short form — shape, timeline ` +
      'and evidence overlap, without quotes or snapshot links. They are context, not the basis of the ' +
      'argument. If one of them is load-bearing for your answer, say so explicitly rather than relying ' +
      'on wording you were not shown.)',
    movedAsUnit: 'claims that moved as one unit',
    flips: 'flips',
    finalState: 'final state',
    page: 'Page',
    timeline: 'Timeline',
    snapshots: 'Archived snapshots',
    claims: 'Claims',
    present: 'present',
    removed: 'removed',
    overlap: 'Identical claims appear in evidence',
    sharedItems: (n: number) => `${n} shared item${n === 1 ? '' : 's'}`,
    omitted: (n: number) =>
      `(${n} further trajector${n === 1 ? 'y was' : 'ies were'} detected and ${n === 1 ? 'is' : 'are'} not shown ` +
      `here. They WERE included in the coverage counts above — the omission is display only.)`,
    coverageHeader:
      '--- WHAT THE TRAJECTORIES DO NOT COVER ---\n' +
      'A diff-based evidence record is not one assertion: a single diff holds many items, each\n' +
      'with its own classification. An overlap on one item does NOT make the rest of that record\n' +
      'non-independent. And where they DO overlap, they are one observation OF PAGE STATE only:\n' +
      "the record's classification, tier reasoning, correlation to dated external events and key\n" +
      'figures are not duplicated by a trajectory and are not discounted by this.',
    coverageLine: (shared: number, total: number, independent: number) =>
      `${shared} of ${total} items are a trajectory's claims — for those, the trajectory and this ` +
      `record observe the same page state. ${independent} classified item${independent === 1 ? ' is' : 's are'} ` +
      `covered by no trajectory, and ${independent === 1 ? 'is' : 'are'} independent evidence.`,
  },
} as const;
