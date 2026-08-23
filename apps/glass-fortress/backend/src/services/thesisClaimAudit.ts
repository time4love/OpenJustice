import { prisma } from '../lib/prisma';
import { extractText } from './thesisAnalysis';
import {
  actVerbsIn,
  extractDates,
  extractIntervals,
  extractQuotedPhrases,
  splitSentences,
  UNCHECKABLE_CLASSES,
  type ParsedDate,
} from '../lib/thesisAssertions';
import {
  checkPhraseAtCaptures,
  fetchCaptureIndex,
  type ArchiveCapture,
  type CaptureCheck,
  type CaptureHtmlCache,
} from './archiveVerification';

// ---------------------------------------------------------------------------
// audit_thesis_claims — which factual assertions in this body can be checked
// mechanically, and do they hold?
//
// docs/gf-verification-tools-dev-plan.md §3.3. Composes list_captures and
// verify_claim_text over a thesis body.
//
// It checks three things and says so:
//   dates      — does a capture exist on the date, and does the sentence assert
//                an ACT on it where the archive supports only an interval?
//   quotations — is the quoted text actually in the captures the sentence points at?
//   intervals  — are the two endpoints adjacent captures with nothing between?
//
// And it prints what it did NOT check (UNCHECKABLE_CLASSES) in its own result.
// One of the four errors caught by hand in the first thesis walk — "six weeks"
// written for a 31-day span — is in that list, because Hebrew number words are
// not reliably extractable. Reporting the blind spot is the design, not an
// apology for it: a check list that omits its own gaps reads as coverage it
// does not have.
// ---------------------------------------------------------------------------

/**
 * Most tracked pages one audit will consider.
 *
 * Each costs a CDX query over the page's whole history. A thesis citing more
 * than this is audited against the first few and TOLD so — never silently
 * narrowed, since "no problems found" over a truncated scope is the exact
 * failure this whole toolset exists to prevent.
 */
export const MAX_SCOPE_URLS = 5;

/**
 * Most archived captures this will download to check quotations.
 *
 * Each is one HTTP fetch of a real page from a free archive. When the cap
 * bites, the remaining quotations are reported as NOT_CHECKED with the reason,
 * not dropped.
 */
export const MAX_PHRASE_CHECKS = 20;

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface AuditedPage {
  url: string;
  trackedUrlId: string;
  captureCount: number;
  truncated: boolean;
}

export interface DateFinding {
  sentence: string;
  date: string;
  raw: string;
  dayMonthAmbiguous: boolean;
  /** Act verbs found in the same sentence — empty means it describes a state. */
  actVerbs: string[];
  pages: {
    url: string;
    capturesOnDate: string[];
    previousCapture: { date: string; waybackTimestamp: string; snapshotUrl: string } | null;
    nextCapture: { date: string; waybackTimestamp: string; snapshotUrl: string } | null;
    verdict: 'CAPTURE_EXISTS_ON_DATE' | 'NO_CAPTURE_ON_DATE' | 'ARCHIVE_UNAVAILABLE';
  }[];
  /**
   * True when the sentence asserts an act on a date the archive never captured.
   * The archive can then place the change only somewhere in the interval
   * between the surrounding captures — which is a weaker claim than the prose.
   */
  flagged: boolean;
  note: string;
}

export interface QuoteFinding {
  sentence: string;
  phrase: string;
  /** Dates in the same sentence — the captures this quotation is checked against. */
  referencedDates: string[];
  verdict:
    | 'PRESENT'
    | 'ABSENT'
    | 'EXTRACTION_DIVERGENCE'
    | 'NO_CAPTURE_REFERENCED'
    | 'NOT_CHECKED';
  reason?: string;
  checks: (CaptureCheck & { url: string })[];
}

export interface IntervalFinding {
  sentence: string;
  raw: string;
  from: string;
  to: string;
  pages: {
    url: string;
    capturesStrictlyBetween: string[];
    endpointsCaptured: { from: boolean; to: boolean };
    verdict: 'ADJACENT' | 'CAPTURES_BETWEEN' | 'ARCHIVE_UNAVAILABLE';
  }[];
  flagged: boolean;
  note: string;
}

export type AuditThesisClaimsResult =
  | { status: 'THESIS_NOT_FOUND'; thesisId: string; message: string }
  | { status: 'NO_HEAD_VERSION'; thesisId: string; message: string }
  | { status: 'NO_TRACKED_PAGE_IN_SCOPE'; thesisId: string; message: string }
  | {
      status: 'OK';
      thesisId: string;
      versionId: string;
      pages: AuditedPage[];
      scopeTruncated: boolean;
      /** Pages whose capture index could not be fetched — nothing about them was checked. */
      pagesUnavailable: { url: string; reason: string }[];
      summary: {
        datesFound: number;
        datesFlagged: number;
        quotationsFound: number;
        quotationsAbsent: number;
        quotationsDiverged: number;
        quotationsNotChecked: number;
        intervalsFound: number;
        intervalsFlagged: number;
      };
      dates: DateFinding[];
      quotations: QuoteFinding[];
      intervals: IntervalFinding[];
      notChecked: readonly string[];
      /** Restates the boundary in the result itself — this reports, it never blocks. */
      scopeStatement: string;
    };

// ---------------------------------------------------------------------------
// Scope resolution
// ---------------------------------------------------------------------------

/** Pull the origin URL back out of a Wayback viewer/raw URL, or null. */
export function originUrlFromWayback(sourceUrl: string): string | null {
  const match = /^https?:\/\/web\.archive\.org\/web\/\d{14}(?:id_)?\/(.+)$/.exec(sourceUrl);
  return match ? match[1] : null;
}

/**
 * Which tracked pages this thesis is about.
 *
 * Derived from the version's own mentions rather than asked for, because a
 * researcher auditing their draft should not have to remember which pages it
 * cites — and a page they forgot is exactly where an unchecked claim hides.
 */
async function resolveScope(
  versionId: string,
  explicitUrl?: string,
): Promise<{ pages: { id: string; url: string }[]; truncated: boolean }> {
  if (explicitUrl) {
    const tracked = await prisma.trackedUrl.findFirst({
      where: { url: explicitUrl },
      select: { id: true, url: true },
    });
    return { pages: tracked ? [tracked] : [], truncated: false };
  }

  const mentions = await prisma.thesisMention.findMany({
    where: { thesisVersionId: versionId, type: { in: ['TRACKED_URL', 'EVIDENCE'] } },
    select: { type: true, refId: true },
  });

  const trackedIds = mentions.filter((m) => m.type === 'TRACKED_URL').map((m) => m.refId);
  const evidenceHashes = mentions.filter((m) => m.type === 'EVIDENCE').map((m) => m.refId);

  const evidence = evidenceHashes.length
    ? await prisma.evidence.findMany({
        where: { fileHash: { in: evidenceHashes } },
        select: { sourceUrl: true },
      })
    : [];

  const originUrls = evidence
    .map((e) => (e.sourceUrl ? originUrlFromWayback(e.sourceUrl) : null))
    .filter((u): u is string => u !== null);

  const pages = await prisma.trackedUrl.findMany({
    where: {
      OR: [
        ...(trackedIds.length ? [{ id: { in: trackedIds } }] : []),
        ...(originUrls.length ? [{ url: { in: originUrls } }] : []),
      ],
    },
    select: { id: true, url: true },
    orderBy: { url: 'asc' },
  });

  return { pages: pages.slice(0, MAX_SCOPE_URLS), truncated: pages.length > MAX_SCOPE_URLS };
}

// ---------------------------------------------------------------------------
// The audit
// ---------------------------------------------------------------------------

interface PageIndex {
  url: string;
  trackedUrlId: string;
  captures: ArchiveCapture[];
  truncated: boolean;
}

function capturesOn(captures: readonly ArchiveCapture[], date: string): ArchiveCapture[] {
  return captures.filter((c) => c.date === date);
}

function brief(capture: ArchiveCapture): { date: string; waybackTimestamp: string; snapshotUrl: string } {
  return {
    date: capture.date,
    waybackTimestamp: capture.waybackTimestamp,
    snapshotUrl: capture.snapshotUrl,
  };
}

export async function auditThesisClaims(
  thesisId: string,
  opts: { url?: string; maxPhraseChecks?: number } = {},
): Promise<AuditThesisClaimsResult> {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: { id: true, headVersionId: true, headVersion: { select: { id: true, userContent: true } } },
  });

  if (!thesis) {
    return {
      status: 'THESIS_NOT_FOUND',
      thesisId,
      message: 'No thesis with this id. Nothing was checked.',
    };
  }
  if (!thesis.headVersion) {
    return {
      status: 'NO_HEAD_VERSION',
      thesisId,
      message: 'This thesis has no head version, so there is no body to audit.',
    };
  }

  const versionId = thesis.headVersion.id;
  const body = extractText(thesis.headVersion.userContent);
  const scope = await resolveScope(versionId, opts.url);

  if (scope.pages.length === 0) {
    return {
      status: 'NO_TRACKED_PAGE_IN_SCOPE',
      thesisId,
      message:
        opts.url
          ? `${opts.url} is not tracked, so no captures can be listed for it. This is NOT a finding ` +
            'about the thesis — nothing was checked.'
          : 'This version cites no tracked page (directly or through forensic evidence), so there is ' +
            'no archive to check its dates and quotations against. Nothing was checked. Pass `url` ' +
            'explicitly to audit against a specific tracked page.',
    };
  }

  const indexes: PageIndex[] = [];
  const pagesUnavailable: { url: string; reason: string }[] = [];
  for (const page of scope.pages) {
    const index = await fetchCaptureIndex(page.url);
    if (!index.available) {
      pagesUnavailable.push({ url: page.url, reason: index.reason });
      continue;
    }
    indexes.push({
      url: page.url,
      trackedUrlId: page.id,
      captures: index.captures,
      truncated: index.truncated,
    });
  }

  const sentences = splitSentences(body);
  const dates = auditDates(sentences, indexes, pagesUnavailable);
  const intervals = auditIntervals(sentences, indexes, pagesUnavailable);
  const quotations = await auditQuotations(
    sentences,
    indexes,
    opts.maxPhraseChecks ?? MAX_PHRASE_CHECKS,
  );

  return {
    status: 'OK',
    thesisId,
    versionId,
    pages: indexes.map((i) => ({
      url: i.url,
      trackedUrlId: i.trackedUrlId,
      captureCount: i.captures.length,
      truncated: i.truncated,
    })),
    scopeTruncated: scope.truncated,
    pagesUnavailable,
    summary: {
      datesFound: dates.length,
      datesFlagged: dates.filter((d) => d.flagged).length,
      quotationsFound: quotations.length,
      quotationsAbsent: quotations.filter((q) => q.verdict === 'ABSENT').length,
      quotationsDiverged: quotations.filter((q) => q.verdict === 'EXTRACTION_DIVERGENCE').length,
      quotationsNotChecked: quotations.filter(
        (q) => q.verdict === 'NOT_CHECKED' || q.verdict === 'NO_CAPTURE_REFERENCED',
      ).length,
      intervalsFound: intervals.length,
      intervalsFlagged: intervals.filter((i) => i.flagged).length,
    },
    dates,
    quotations,
    intervals,
    notChecked: UNCHECKABLE_CLASSES,
    scopeStatement:
      'This is an instrument, not a gate: nothing here blocks publication, and a researcher may ' +
      'publish over every flag in it. It checks text against captures and dates against the capture ' +
      'index. It does not judge whether an inference is sound — that is argument, and argument has ' +
      'its own tools. Read `notChecked` before treating a clean result as a clean thesis.',
  };
}

function auditDates(
  sentences: readonly string[],
  indexes: readonly PageIndex[],
  unavailable: readonly { url: string; reason: string }[],
): DateFinding[] {
  const findings: DateFinding[] = [];

  for (const sentence of sentences) {
    const found = extractDates(sentence);
    if (found.length === 0) continue;
    const actVerbs = actVerbsIn(sentence);

    for (const date of found) {
      const pages: DateFinding['pages'] = indexes.map((index) => {
        const on = capturesOn(index.captures, date.iso);
        const previous = [...index.captures].reverse().find((c) => c.date < date.iso) ?? null;
        const next = index.captures.find((c) => c.date > date.iso) ?? null;
        return {
          url: index.url,
          capturesOnDate: on.map((c) => c.waybackTimestamp),
          previousCapture: previous ? brief(previous) : null,
          nextCapture: next ? brief(next) : null,
          verdict: on.length > 0 ? 'CAPTURE_EXISTS_ON_DATE' : 'NO_CAPTURE_ON_DATE',
        };
      });

      // A page whose capture index could not be fetched is listed with its own
      // verdict rather than omitted. Dropping it would make the finding read as
      // if every page in scope had been consulted.
      for (const page of unavailable) {
        pages.push({
          url: page.url,
          capturesOnDate: [],
          previousCapture: null,
          nextCapture: null,
          verdict: 'ARCHIVE_UNAVAILABLE',
        });
      }

      const anyCapture = pages.some((p) => p.verdict === 'CAPTURE_EXISTS_ON_DATE');
      // Only a page whose capture index was actually fetched can support a
      // flag. With every page unavailable, `anyCapture` is false for the same
      // reason it would be on a page with no captures — and flagging on that
      // would be this codebase's oldest defect, reporting "could not check" as
      // a finding.
      const consulted = indexes.length > 0;
      const flagged = consulted && actVerbs.length > 0 && !anyCapture;

      findings.push({
        sentence,
        date: date.iso,
        raw: date.raw,
        dayMonthAmbiguous: date.dayMonthAmbiguous,
        actVerbs,
        pages,
        flagged,
        note: consulted
          ? dateNote(date, actVerbs, anyCapture, pages, unavailable.length)
          : `Not checked: the archive did not answer for any page in scope, so nothing is known ` +
            `about captures on ${date.iso}. This is not a finding about the thesis.`,
      });
    }
  }

  return findings;
}

function dateNote(
  date: ParsedDate,
  actVerbs: readonly string[],
  anyCapture: boolean,
  pages: DateFinding['pages'],
  unavailablePages: number,
): string {
  const coverage =
    unavailablePages > 0
      ? ` Note that ${String(unavailablePages)} page(s) in scope could not be reached, so this reflects the ` +
        'pages that were.'
      : '';
  const ambiguity = date.dayMonthAmbiguous
    ? ' Read as DD.MM.YYYY (Israeli convention); day and month are both ≤ 12, so the written form is ambiguous.'
    : '';

  if (actVerbs.length === 0) {
    return anyCapture
      ? `A capture exists on ${date.iso}, so the page's state that day is directly observable.${ambiguity}`
      : `No capture exists on ${date.iso}. The sentence does not assert an act, but any statement ` +
          `about the page's state that day rests on the surrounding captures, not on one taken that day.${coverage}${ambiguity}`;
  }

  if (!anyCapture) {
    const bracket = pages.find((p) => p.previousCapture ?? p.nextCapture);
    const between =
      bracket?.previousCapture && bracket.nextCapture
        ? ` The archive supports only an interval: the change occurred somewhere between ` +
          `${bracket.previousCapture.date} and ${bracket.nextCapture.date}.`
        : ' The archive holds no capture bracketing this date on both sides, so it supports no interval either.';
    return (
      `The sentence asserts an act (${actVerbs.join(', ')}) on ${date.iso}, but no capture was taken ` +
      `that day.${between} Prose asserting the act happened ON that date claims more than the archive shows.${coverage}${ambiguity}`
    );
  }

  return (
    `A capture exists on ${date.iso}, so the page's state that day is observable. Note that a capture ` +
    'shows state at an instant and never the moment of an edit: the act itself is still located only ' +
    'between the previous capture and this one.' + coverage + ambiguity
  );
}

function auditIntervals(
  sentences: readonly string[],
  indexes: readonly PageIndex[],
  unavailable: readonly { url: string; reason: string }[],
): IntervalFinding[] {
  const findings: IntervalFinding[] = [];

  for (const sentence of sentences) {
    for (const interval of extractIntervals(sentence)) {
      const pages: IntervalFinding['pages'] = indexes.map((index) => {
        const between = index.captures.filter(
          (c) => c.date > interval.from.iso && c.date < interval.to.iso,
        );
        return {
          url: index.url,
          capturesStrictlyBetween: between.map((c) => c.waybackTimestamp),
          endpointsCaptured: {
            from: capturesOn(index.captures, interval.from.iso).length > 0,
            to: capturesOn(index.captures, interval.to.iso).length > 0,
          },
          verdict: between.length === 0 ? 'ADJACENT' : 'CAPTURES_BETWEEN',
        };
      });

      for (const page of unavailable) {
        pages.push({
          url: page.url,
          capturesStrictlyBetween: [],
          endpointsCaptured: { from: false, to: false },
          verdict: 'ARCHIVE_UNAVAILABLE',
        });
      }

      const withCapturesBetween = pages.filter((p) => p.verdict === 'CAPTURES_BETWEEN');
      const consulted = indexes.length > 0;
      const flagged = withCapturesBetween.length > 0;

      findings.push({
        sentence,
        raw: interval.raw,
        from: interval.from.iso,
        to: interval.to.iso,
        pages,
        flagged,
        note: !consulted
          ? 'Not checked: the archive did not answer for any page in scope, so whether a capture ' +
            'falls inside this interval is unknown. This is not a finding about the thesis.'
          : flagged
            ? `The archive holds ${String(withCapturesBetween[0].capturesStrictlyBetween.length)} capture(s) ` +
              `between ${interval.from.iso} and ${interval.to.iso}. The interval as written is therefore ` +
              'wider than the archive requires — the window can be narrowed using those captures.'
            : `No capture exists between ${interval.from.iso} and ${interval.to.iso}, so the endpoints ` +
              'are adjacent and this is the tightest interval the archive supports.',
      });
    }
  }

  return findings;
}

async function auditQuotations(
  sentences: readonly string[],
  indexes: readonly PageIndex[],
  maxChecks: number,
): Promise<QuoteFinding[]> {
  const findings: QuoteFinding[] = [];
  const cache: CaptureHtmlCache = new Map();
  let fetches = 0;

  for (const sentence of sentences) {
    const phrases = extractQuotedPhrases(sentence);
    if (phrases.length === 0) continue;
    const dates = extractDates(sentence);

    for (const phrase of phrases) {
      if (dates.length === 0) {
        findings.push({
          sentence,
          phrase,
          referencedDates: [],
          verdict: 'NO_CAPTURE_REFERENCED',
          reason:
            'The sentence names no date, so there is no capture to check this quotation against. ' +
            'Give the sentence a date, or check it directly with verify_claim_text.',
          checks: [],
        });
        continue;
      }

      const checks: (CaptureCheck & { url: string })[] = [];
      let capped = false;

      for (const index of indexes) {
        for (const date of dates) {
          const targets = capturesOn(index.captures, date.iso);
          if (targets.length === 0) continue;
          if (fetches + targets.length > maxChecks) {
            capped = true;
            continue;
          }
          fetches += targets.length;
          const result = await checkPhraseAtCaptures(
            index.url,
            index.trackedUrlId,
            targets,
            phrase,
            cache,
          );
          checks.push(...result.map((c) => ({ ...c, url: index.url })));
        }
      }

      findings.push({
        sentence,
        phrase,
        referencedDates: dates.map((d) => d.iso),
        ...quoteVerdict(checks, capped),
        checks,
      });
    }
  }

  return findings;
}

function quoteVerdict(
  checks: readonly (CaptureCheck & { url: string })[],
  capped: boolean,
): { verdict: QuoteFinding['verdict']; reason?: string } {
  const checked = checks.filter((c) => c.outcome === 'CHECKED');

  if (checked.length === 0) {
    const failure = checks.find((c) => c.outcome !== 'CHECKED');
    return {
      verdict: 'NOT_CHECKED',
      reason: capped
        ? `The per-audit fetch budget (${String(MAX_PHRASE_CHECKS)} captures) was reached before this ` +
          'quotation could be checked. Check it directly with verify_claim_text.'
        : failure
          ? `${failure.outcome}: ${failure.reason ?? 'no detail'}. Nothing was checked — this is not ` +
            'evidence that the quotation is absent.'
          : 'No capture was taken on any date this sentence names, so there is nothing to check the ' +
            'quotation against. This is not evidence that the quotation is absent.',
    };
  }

  // Divergence outranks presence: the phrase being in the raw page but not in
  // the platform's extraction is the condition that produced a false claim in a
  // real thesis, and it must not be smoothed into a plain PRESENT.
  if (checked.some((c) => c.extractionDivergence)) {
    return {
      verdict: 'EXTRACTION_DIVERGENCE',
      reason:
        'The raw archived page and this platform’s extraction of it disagree about this quotation. ' +
        'Whatever the diffs and trajectories say about it is derived from the extraction, and the ' +
        'extraction is blind here.',
    };
  }

  // A budget that bit mid-quotation means the verdict rests on a subset. PRESENT
  // survives that — one capture containing the text is enough. ABSENT does not,
  // and must not be reported as though every capture had been consulted.
  const partial = capped
    ? ' Note that the per-audit fetch budget stopped this before every referenced capture was checked.'
    : '';

  if (checked.some((c) => c.presentInRawArchive)) {
    return capped ? { verdict: 'PRESENT', reason: partial.trim() } : { verdict: 'PRESENT' };
  }

  if (capped) {
    return {
      verdict: 'NOT_CHECKED',
      reason:
        `The quotation was not found in the ${String(checked.length)} capture(s) that were checked, but ` +
        'the per-audit fetch budget stopped the rest. Absent from some captures is not absent from the ' +
        'page — check it directly with verify_claim_text.',
    };
  }

  return {
    verdict: 'ABSENT',
    reason:
      `Checked against ${String(checked.length)} capture(s) on the dates this sentence names; the quotation ` +
      'is in none of them, in the raw archived page.',
  };
}
