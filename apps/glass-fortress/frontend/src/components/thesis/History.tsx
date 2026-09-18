'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { fetchJson } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { movedPins, textDiff, type DiffRun, type MovedPin } from '@/lib/textDiff';
import { parseVersionBody } from '@/lib/thesisBody';
import type { CitationRef, HistoryEntry } from '@/types/thesis';
import { Fold } from './Fold';

// ---------------------------------------------------------------------------
// HISTORY, AND THE ONE THING THE FRONTEND DERIVES — docs/gf-ui-flows.md §17 :553–:555, §18 :583–:586;
// thesis T6 :898–:901, A5 :1570.
//
// EVERY VERSION THAT WAS PUBLISHED, NEWEST FIRST. The body lists them oldest first (HISTORY(t) is in createdAt
// order, A3 :1407), and THIS is the one place the order is reversed. Each row is the date and the author's handle
// — one author per thesis (thesis flows :1001), which is why one handle serves every row.
//
// A WITHDRAWAL SITS BETWEEN THE VERSIONS IT SEPARATES (§17 :555; T6 :917–:918): the row for a version that was
// withdrawn is preceded, in newest-first order, by the withdrawal itself.
//
// "WHAT CHANGED" IS THE READER'S ACT, and only then is a second read made (§16 :513–:515): the older version's
// text is fetched, the diff computed here from two immutable texts, and every citation whose pin moved listed
// beneath it. No pair spans a withdrawal — a version a Withdrawal names answers the notice, never its text.
// ---------------------------------------------------------------------------

export interface HistoryProps {
  thesisId: string;
  history: readonly HistoryEntry[];
  current: { versionId: string; text: string; citations: readonly CitationRef[] };
  author: string;
  locale: string;
}

interface Diff {
  runs: DiffRun[];
  moved: MovedPin[];
  from: string;
  to: string;
}

const isWithdrawn = (entry: HistoryEntry): entry is Extract<HistoryEntry, { withdrawn: true }> => 'withdrawn' in entry;

export function History({ thesisId, history, current, author, locale }: HistoryProps) {
  const t = useTranslations('theses.history');
  const [diff, setDiff] = useState<Diff | null>(null);
  const [failed, setFailed] = useState(false);
  const rows = [...history].reverse();

  async function versionOf(versionId: string): Promise<{ text: string; citations: readonly CitationRef[] }> {
    // The current version's text is already on the page: the reader's act costs ONE read, never two.
    if (versionId === current.versionId) return current;
    const body = parseVersionBody(
      await fetchJson<unknown>(`/api/thesis/${thesisId}/versions/${versionId}`, { offline: t('diffUnavailable') }),
    );
    if ('withdrawn' in body) throw new Error('that version answers the notice, never its text');
    return body;
  }

  async function open(older: HistoryEntry, newer: HistoryEntry): Promise<void> {
    setFailed(false);
    try {
      const before = await versionOf(older.versionId);
      const after = await versionOf(newer.versionId);
      setDiff({
        runs: textDiff(before.text, after.text),
        moved: movedPins(before.citations, after.citations),
        from: formatDate(older.publishedAt, locale),
        to: formatDate(newer.publishedAt, locale),
      });
    } catch {
      setFailed(true);
    }
  }

  return (
    <Fold summary={t('heading')}>
      <ol className="space-y-2">
        {rows.map((entry, index) => {
          const newer = rows[index - 1];
          const comparable = newer !== undefined && !isWithdrawn(entry) && !isWithdrawn(newer);
          return (
            <li key={entry.versionId} className="space-y-1">
              {isWithdrawn(entry) ? (
                <p data-history-row="withdrawal" data-published-at={entry.withdrawnAt} className="text-sm text-amber">
                  {t('withdrawn', { date: formatDate(entry.withdrawnAt, locale) })}
                </p>
              ) : null}
              <p data-history-row="version" data-published-at={entry.publishedAt} className="text-sm text-ink">
                <bdi dir="ltr">{formatDate(entry.publishedAt, locale)}</bdi> · <bdi>{author}</bdi>
                {entry.versionId === current.versionId ? ` · ${t('current')}` : ''}
              </p>
              {comparable ? (
                <button
                  type="button"
                  data-what-changed
                  onClick={() => void open(entry, newer)}
                  className="rounded border border-line px-2 py-1 text-xs text-ink"
                >
                  {t('whatChanged')}
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
      {failed ? <p className="text-sm text-amber">{t('diffUnavailable')}</p> : null}
      {diff === null ? null : (
        <div data-testid="version-diff" className="space-y-2 rounded-lg border border-line p-3">
          <p className="text-sm text-ink-muted">{t('diffHeading', { from: diff.from, to: diff.to })}</p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed" dir="auto">
            {diff.runs.map((run, index) => (
              <span
                key={`${run.kind}-${String(index)}`}
                data-run={run.kind}
                className={run.kind === 'removed' ? 'bg-seal-tint line-through' : run.kind === 'added' ? 'bg-olive-tint' : undefined}
              >
                {run.text}
              </span>
            ))}
          </p>
          {diff.moved.length === 0 ? null : (
            <div className="text-sm text-ink-muted">
              <p className="font-semibold">{t('movedPins')}</p>
              <ul className="list-disc ps-6">
                {diff.moved.map((pin) => (
                  <li key={`${pin.kind}:${pin.name}`} data-moved-pin={pin.name}>
                    {t('pinMoved')}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Fold>
  );
}
