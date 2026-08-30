import { prisma } from '../lib/prisma';
import { ARCHIVED_CAPTURES_ONLY } from '../lib/archivedCaptures';
import { DECODABLE_CAPTURE_SELECT, captureHtml } from '../lib/captureDocument';

/**
 * Were there href-only changes across the stored captures?
 *
 * LEVEL 4 RECONNAISSANCE — what the view keeps — written before Level 1 closed
 * but deliberately NOT run until it has. It answers a question the old pipeline
 * was structurally incapable of asking, because until the payloads were stored
 * no link target existed anywhere in this platform.
 *
 * Why it matters here rather than as a curiosity: `htmlToText` strips every tag
 * with `.replace(/<[^>]*>/g, '')`, keeping anchor text and discarding targets.
 * Diffs, trajectories, the classifier and the verification tools all read the
 * derived TEXT. So every finding this corpus has ever produced — including the
 * central one, that the adverse-event REPORTING CHANNEL was removed — rests
 * entirely on anchor text. Two blind spots follow, and neither has ever been
 * looked for:
 *
 *   - A link whose TARGET changed while its text stayed identical is INVISIBLE.
 *     The reporting channel could have been redirected rather than removed and
 *     nothing would have been recorded.
 *   - A link whose TEXT changed while its target stayed is recorded as a removal
 *     PLUS an addition — one edit reported as two.
 *
 * Purely local and deterministic: no Archive, no model, no cost. It reads stored
 * payloads and compares href sets between consecutive captures.
 *
 * A non-zero answer is a class of change this platform has never been able to
 * see, on the page its whole argument is about. A zero answer is worth having
 * too, and costs one run.
 *
 * Acting on the result is a `textExtractionVersion` bump — precisely what that
 * axis was built for — and a Level 4 decision about what the view keeps. This
 * module only measures.
 */

export interface HrefChange {
  beforeTimestamp: string;
  afterTimestamp: string;
  beforeDate: string;
  afterDate: string;
  added: string[];
  removed: string[];
  /**
   * The derived TEXT is identical across this pair while the href set is not.
   *
   * This is the invisible case: a change no diff, trajectory or classifier in
   * this platform could ever have reported, because none of them sees a target.
   */
  invisibleToText: boolean;
}

export interface HrefChangeReport {
  url: string;
  capturesExamined: number;
  pairsCompared: number;
  changes: HrefChange[];
  /** Pairs whose hrefs changed while the derived text did not. */
  invisibleToTextCount: number;
}

/**
 * Every href target in a payload, in document order, deduplicated.
 *
 * Deliberately naive and deliberately not a parser: this is a measurement, and a
 * regex over stored bytes is reproducible by anyone with the same payload. It
 * captures the attribute value verbatim rather than resolving it — a relative
 * link becoming absolute IS a change worth seeing, and resolving would hide it.
 */
export function extractHrefs(html: string): string[] {
  const out = new Set<string>();
  const re = /<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s">]+))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    // Exactly one of the three quoting alternatives matches; the other two are
    // `undefined` at RUNTIME even though the compiler types them as `string`
    // (this project does not enable noUncheckedIndexedAccess). `find` over a
    // slice keeps the runtime truth and the declared type in agreement, where
    // `m[2] ?? m[3] ?? m[4]` reads to the linter as three redundant checks.
    const groups: (string | undefined)[] = m.slice(2, 5);
    const value = groups.find((group) => group !== undefined) ?? '';
    if (value.length > 0) out.add(value);
  }
  return [...out];
}

export async function measureHrefChanges(url: string): Promise<HrefChangeReport> {
  const tracked = await prisma.trackedUrl.findUnique({ where: { url }, select: { id: true } });
  if (!tracked) throw new Error(`No tracked URL found for: ${url}`);

  const captures = await prisma.urlSnapshot.findMany({
    where: { trackedUrlId: tracked.id, ...ARCHIVED_CAPTURES_ONLY },
    // capturedAt, not snapshotDate: same-day captures sort equal on a day-granular
    // key and Postgres may then return them in any order, which would pair the
    // wrong captures against each other.
    orderBy: { capturedAt: 'asc' },
    select: {
      waybackTimestamp: true,
      snapshotDate: true,
      // Spread, never listed. This query named its own payload columns and left
      // out `documentContentEncoding`, so every gzip-served capture decoded to
      // compressed bytes and reported zero hrefs.
      ...DECODABLE_CAPTURE_SELECT,
      textHash: true,
    },
  });

  const changes: HrefChange[] = [];
  let pairs = 0;

  for (let i = 1; i < captures.length; i++) {
    const before = captures[i - 1];
    const after = captures[i];
    pairs++;

    const beforeHrefs = new Set(extractHrefs(captureHtml(before)));
    const afterHrefs = new Set(extractHrefs(captureHtml(after)));

    const added = [...afterHrefs].filter((h) => !beforeHrefs.has(h));
    const removed = [...beforeHrefs].filter((h) => !afterHrefs.has(h));
    if (added.length === 0 && removed.length === 0) continue;

    changes.push({
      beforeTimestamp: before.waybackTimestamp ?? '',
      afterTimestamp: after.waybackTimestamp ?? '',
      beforeDate: before.snapshotDate,
      afterDate: after.snapshotDate,
      added,
      removed,
      invisibleToText: before.textHash === after.textHash,
    });
  }

  return {
    url,
    capturesExamined: captures.length,
    pairsCompared: pairs,
    changes,
    invisibleToTextCount: changes.filter((c) => c.invisibleToText).length,
  };
}
