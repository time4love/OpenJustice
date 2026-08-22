import { prisma } from './prisma';
import { SUMMARY_VERSION } from './classifierVersion';

// ---------------------------------------------------------------------------
// What a stored summary's classifier version does NOT tell you on its face.
//
// This is provenance surfacing, not defect detection. classifierVersion already
// records which prompt produced a row; this states what that prompt permitted, at
// the moment the row is handed to something that will reason over it.
//
// The case that made it necessary: until v3-self-contained-summary the
// classification prompt instructed the model to "EXPLICITLY cross-reference"
// correlated evidence inside legalSignificance — and that prose becomes
// Evidence.summary verbatim. So a forensic record's public text could assert
// things unverifiable against its own source, and every thesis-stage agent read
// it as an independent observation. A thesis could be corroborated by its own
// premise, reflected back through a record it cites.
//
// Which rows are affected is DERIVABLE, not assumed: any diff whose
// classifierVersion is not the self-contained one was written under that
// instruction, and classifierPromptHash proves which prompt that was.
//
// This is expected to become dead code, and that is the point. When no row
// predates the fix, `loadSummaryCaveat` returns null and nothing renders. It
// describes history; it does not compensate for an ongoing defect.
// ---------------------------------------------------------------------------

/**
 * Keyed on summaryVersion, not classifierVersion.
 *
 * They move independently: `forensics:resummarize` rewrites the prose without
 * re-extracting, so a row can carry a self-contained summary over v2-extracted
 * items. Reading classifierVersion here would warn about rows already fixed and
 * stay silent about rows that were not.
 */
const SELF_CONTAINED_VERSION = SUMMARY_VERSION;

export interface SummaryCaveat {
  /** fileHashes whose summary predates the self-contained rule. */
  affected: string[];
  /** Distinct classifier versions involved, for the record. */
  versions: string[];
}

export async function loadSummaryCaveat(
  evidence: readonly { fileHash: string }[],
): Promise<SummaryCaveat | null> {
  if (evidence.length === 0) return null;

  const rows = await prisma.evidence.findMany({
    where: { fileHash: { in: evidence.map((e) => e.fileHash) }, NOT: { urlVersionDiffId: null } },
    select: { fileHash: true, urlVersionDiff: { select: { summaryVersion: true } } },
  });

  const affected = rows.filter((r) => r.urlVersionDiff?.summaryVersion !== SELF_CONTAINED_VERSION);
  if (affected.length === 0) return null;

  return {
    affected: affected.map((r) => r.fileHash),
    versions: [
      ...new Set(affected.map((r) => r.urlVersionDiff?.summaryVersion ?? 'pre-self-contained')),
    ],
  };
}

export function formatSummaryCaveat(caveat: SummaryCaveat | null, lang: 'he' | 'en' = 'he'): string {
  if (!caveat) return '';
  const hashes = caveat.affected.join(', ');
  const versions = caveat.versions.join(', ');

  if (lang === 'en') {
    return (
      '--- PROVENANCE WARNING: SUMMARIES THAT MAY NOT BE SELF-CONTAINED ---\n' +
      `These records (${versions}) were summarised under a prompt that instructed the classifier to\n` +
      'cross-reference OTHER evidence records inside the summary. Their prose may therefore assert\n' +
      "facts, dates, names or events drawn from a different record — not from the page it describes.\n" +
      'Treat any cross-source claim in these summaries as UNVERIFIED, and do not count such a claim\n' +
      'as independent support: it may be another cited record, restated.\n' +
      `Affected: ${hashes}`
    );
  }
  return (
    '--- אזהרת מקור: סיכומים שאינם בהכרח עומדים בפני עצמם ---\n' +
    `הרשומות הבאות (${versions}) סוכמו תחת הנחיה שדרשה מן המסווג להצליב ראיות אחרות\n` +
    'בתוך הסיכום עצמו. לפיכך ייתכן שהניסוח שלהן קובע עובדות, תאריכים, שמות או אירועים\n' +
    'שמקורם ברשומה אחרת — ולא בדף שהן מתארות.\n' +
    'יש להתייחס לכל טענה חוצת-מקורות בסיכומים אלה כלא מאומתת, ואין לספור אותה כאישוש\n' +
    'עצמאי: ייתכן שהיא רשומה אחרת שכבר צוטטה, בניסוח אחר.\n' +
    `הרשומות: ${hashes}`
  );
}
