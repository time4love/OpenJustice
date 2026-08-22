import { prisma } from './prisma';
import {
  getClaimTrajectories,
  claimHash,
  normaliseClaim,
  MIN_CLAIM_LENGTH,
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

/** Groups per URL. Enough to carry the pattern; not enough to swamp the prompt. */
const MAX_GROUPS_PER_URL = 8;
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
 * Trajectories for every tracked page the supplied evidence came from, plus how
 * much of each evidence record those trajectories actually account for.
 *
 * Evidence reaches a tracked URL through the diff it was promoted from. Evidence
 * with no urlVersionDiffId — an article, a document — contributes no trajectories,
 * which is correct: nothing archived it over time.
 */
export async function loadTrajectoryContext(
  evidence: readonly { fileHash: string }[],
): Promise<TrajectoryBundle> {
  if (evidence.length === 0) return { trajectories: [], coverage: [], omittedGroups: 0 };

  const rows = await prisma.evidence.findMany({
    where: { fileHash: { in: evidence.map((e) => e.fileHash) }, NOT: { urlVersionDiffId: null } },
    select: {
      fileHash: true,
      urlVersionDiff: {
        select: { deletedText: true, addedText: true, trackedUrl: { select: { url: true } } },
      },
    },
  });

  const urls = [...new Set(rows.map((r) => r.urlVersionDiff?.trackedUrl.url).filter((u): u is string => !!u))];
  const trajectories: TrajectoryContext[] = [];
  const coverage: EvidenceCoverage[] = [];
  let omittedGroups = 0;

  for (const url of urls) {
    // One page's trajectories must never break the assessment of a corpus drawn
    // from several. A URL never scanned, or whose detection fails, contributes
    // nothing rather than failing the caller.
    let result;
    try {
      result = await getClaimTrajectories(url);
    } catch {
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

    omittedGroups += Math.max(0, result.groups.length - MAX_GROUPS_PER_URL);

    for (const group of result.groups.slice(0, MAX_GROUPS_PER_URL)) {
      const groupHashes = new Set(group.claims.map((c) => c.claimHash));
      const groupTexts = group.claims.map((c) => normaliseClaim(c.claimText));

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
        claims: group.claims
          .slice(0, MAX_CLAIMS_PER_GROUP)
          .map((c) => (c.claimText.length > CLAIM_EXCERPT ? `${c.claimText.slice(0, CLAIM_EXCERPT)}…` : c.claimText)),
        overlappingEvidence: overlapping,
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

  return { trajectories, coverage, omittedGroups };
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
  const { trajectories, coverage, omittedGroups } = bundle;
  if (trajectories.length === 0) return '';

  const t = STRINGS[lang];

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
    return (
      `  [T${i + 1}] ${c.claimCount} ${t.movedAsUnit} · ${c.transitions} ${t.flips} · ${t.finalState}: ${c.finalState}\n` +
      `      ${t.page}: ${c.url}\n` +
      `      ${t.timeline}: ${timeline}\n` +
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

  // Never let a capped list read as the whole list.
  const truncationNote = omittedGroups > 0 ? `\n\n${t.omitted(omittedGroups)}` : '';

  return `${t.header}\n${t.rule}\n\n${blocks.join('\n\n')}${coverageBlock}${truncationNote}`;
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
