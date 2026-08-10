'use client';

import { use, useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiUrl } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VersionSummary {
  id: string;
  parentVersionId: string | null;
  status: 'PENDING_AI' | 'COMPLETE';
  contentHash: string;
  userContent: Record<string, unknown>;
  preview: string;
  mentionCount: number;
  isHead: boolean;
  createdAt: string;
  createdByHandle: string | null;
}

// ---------------------------------------------------------------------------
// Word-level diff helpers
// ---------------------------------------------------------------------------

function extractText(node: Record<string, unknown>): string {
  if (node.type === 'text') return String(node.text ?? '');
  const children = node.content as Record<string, unknown>[] | undefined;
  return (children ?? []).map(extractText).join(' ');
}

type DiffChunk = { type: 'equal' | 'delete' | 'insert'; text: string };

function wordDiff(before: string, after: string): DiffChunk[] {
  const wA = before.split(/\s+/).filter(Boolean);
  const wB = after.split(/\s+/).filter(Boolean);
  const m = wA.length, n = wB.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = wA[i - 1] === wB[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);

  const raw: DiffChunk[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && wA[i - 1] === wB[j - 1]) {
      raw.unshift({ type: 'equal', text: wA[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.unshift({ type: 'insert', text: wB[j - 1] });
      j--;
    } else {
      raw.unshift({ type: 'delete', text: wA[i - 1] });
      i--;
    }
  }
  // Merge adjacent same-type chunks
  return raw.reduce<DiffChunk[]>((acc, chunk) => {
    const last = acc[acc.length - 1];
    if (last?.type === chunk.type) { last.text += ' ' + chunk.text; return acc; }
    return [...acc, { ...chunk }];
  }, []);
}

// ---------------------------------------------------------------------------
// VersionDiff — inline word-level diff panel
// ---------------------------------------------------------------------------

function VersionDiff({ before, after }: { before: Record<string, unknown>; after: Record<string, unknown> }) {
  const textBefore = extractText(before);
  const textAfter = extractText(after);
  const chunks = wordDiff(textBefore, textAfter);
  const hasChanges = chunks.some(c => c.type !== 'equal');

  if (!hasChanges) {
    return <p className="text-xs text-slate-400 italic px-1">No text changes (only structure or mentions changed)</p>;
  }

  return (
    <p className="text-sm leading-relaxed text-slate-700 font-mono whitespace-pre-wrap break-words">
      {chunks.map((chunk, i) => {
        if (chunk.type === 'equal') return <span key={i}>{chunk.text} </span>;
        if (chunk.type === 'delete') return (
          <span key={i} className="bg-red-100 text-red-700 line-through rounded px-0.5 me-0.5">{chunk.text} </span>
        );
        return (
          <span key={i} className="bg-emerald-100 text-emerald-700 rounded px-0.5 me-0.5">{chunk.text} </span>
        );
      })}
    </p>
  );
}

interface HistoryResponse {
  thesisId: string;
  headVersionId: string | null;
  versions: VersionSummary[];
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ThesisHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('theses');
  const locale = useLocale();

  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expandedDiff, setExpandedDiff] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(apiUrl(`/api/thesis/${id}/versions`));
        if (!res.ok) throw new Error();
        setData((await res.json()) as HistoryResponse);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <Link
            href={`/theses/${id}`}
            className="text-slate-600 hover:text-slate-900 text-sm transition-colors"
          >
            ← {t('pageTitle')}
          </Link>
          <span className="text-slate-300">·</span>
          <span className="text-slate-500 text-sm font-medium">{t('historyBtn')}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">{t('historyHeading')}</h1>

        {loading && (
          <p className="text-slate-500 text-sm">{t('savingBtn')}</p>
        )}

        {error && (
          <p className="text-red-600 text-sm">{t('errorEvaluate')}</p>
        )}

        {data && data.versions.length === 0 && (
          <p className="text-slate-500 text-sm">{t('historyEmpty')}</p>
        )}

        {/* Version list — oldest first, newest (head) at bottom */}
        {data && data.versions.length > 0 && (
          <div className="relative">
            {/* Vertical connector line */}
            <div className="absolute start-[19px] top-6 bottom-6 w-px bg-slate-200" aria-hidden />

            <ol className="space-y-4">
              {data.versions.map((v, index) => (
                <li key={v.id} className="relative flex gap-4">
                  {/* Timeline dot */}
                  <div
                    className={`relative z-10 mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      v.isHead
                        ? 'border-violet-600 bg-violet-600'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {v.isHead && <span className="h-2 w-2 rounded-full bg-white" />}
                  </div>

                  {/* Card — fully tappable, navigates to formatted version view */}
                  <Link
                    href={v.isHead ? `/theses/${id}` : `/theses/${id}?v=${v.id}`}
                    className={`flex-1 block rounded-2xl border p-4 shadow-sm active:scale-[0.99] transition-transform ${
                      v.isHead
                        ? 'border-violet-300 bg-violet-50 hover:border-violet-400'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    {/* Version header */}
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="text-xs font-mono text-slate-400">v{index + 1}</span>
                      {v.isHead && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-300">
                          {t('currentVersion')}
                        </span>
                      )}
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                          v.status === 'COMPLETE'
                            ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                            : 'bg-amber-100 text-amber-700 border-amber-300'
                        }`}
                      >
                        {v.status === 'COMPLETE' ? 'AI reviewed' : 'Pending AI'}
                      </span>
                      <span className="ms-auto text-xs text-slate-400">
                        {new Date(v.createdAt).toLocaleString(locale === 'he' ? 'he-IL' : 'en-US', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </span>
                    </div>

                    {/* Preview */}
                    <p className="text-sm text-slate-700 leading-relaxed line-clamp-3">
                      {v.preview || '—'}
                    </p>

                    {/* Footer */}
                    <div className="flex items-center gap-3 mt-3 text-xs text-slate-400">
                      <span>{v.mentionCount} {t('mentions')}</span>
                      <span className="font-mono truncate max-w-[100px]">{v.contentHash.slice(0, 12)}…</span>
                      {v.createdByHandle && (
                        <span className="font-mono text-slate-500">{v.createdByHandle}</span>
                      )}
                      <span className="ms-auto text-slate-400">
                        {locale === 'he' ? 'לצפייה ←' : 'View →'}
                      </span>
                    </div>
                  </Link>

                  {/* Diff toggle — separate from the card link */}
                  {index > 0 && (
                    <div className="mt-2 ms-0">
                      <button
                        onClick={() => setExpandedDiff(expandedDiff === v.id ? null : v.id)}
                        className="text-xs text-slate-400 hover:text-slate-700 font-medium transition-colors px-1"
                      >
                        {expandedDiff === v.id ? 'Hide diff' : `Diff v${index}→v${index + 1}`}
                      </button>
                      {expandedDiff === v.id && (
                        <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 space-y-1">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                            Changes v{index} → v{index + 1}
                          </p>
                          <VersionDiff
                            before={data.versions[index - 1].userContent}
                            after={v.userContent}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
      </main>
    </div>
  );
}
