'use client';

import { useState, useEffect, useRef, Suspense, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiUrl } from '@/lib/api';
import { TipTapRenderer, type EvidenceInfo } from '@/components/TipTapRenderer';

// ---------------------------------------------------------------------------
// Types matching the versioned thesis API
// ---------------------------------------------------------------------------

interface ThesisMention {
  id: string;
  type: 'KEY_FIGURE' | 'EVIDENCE' | 'TRACKED_URL';
  refId: string;
}

interface CounterArgument {
  claim: string;
  counterArgument: string;
  strengthOfCounter: string;
}

interface EvidenceGap {
  description: string;
  impact: string;
  suggestedSearch: string;
}

interface AIAnalysis {
  counterArguments: CounterArgument[];
  evidenceGaps: EvidenceGap[];
  alternativeInterpretations: string[];
  overallStrengthAssessment: 'WEAK' | 'MODERATE' | 'STRONG' | 'COMPELLING';
  summaryHe: string;
}

interface HeadVersion {
  id: string;
  status: 'PENDING_AI' | 'COMPLETE';
  contentHash: string;
  userContent: Record<string, unknown>;
  aiAnalysis: AIAnalysis | null;
  mentions: ThesisMention[];
  createdAt: string;
}

interface Thesis {
  id: string;
  headVersionId: string | null;
  createdAt: string;
  headVersion: HeadVersion | null;
}


// ---------------------------------------------------------------------------
// GapSearchPanel — inline vault search + Add to Thesis action
// ---------------------------------------------------------------------------

interface VaultHit {
  fileHash: string;
  summary: string;
  category: string;
  tier: string;
  evidenceDate: string;
  targetEntity: string;
}

const GAP_TIER_DOT: Record<string, string> = {
  '1': 'bg-red-500', '2': 'bg-orange-500', '3': 'bg-yellow-500', '4': 'bg-slate-400',
};
function gapTierDot(tier: string) {
  const num = tier?.match(/\d/)?.[0] ?? '';
  return GAP_TIER_DOT[num] ?? 'bg-slate-300';
}

function appendEvidenceMention(
  doc: Record<string, unknown>,
  fileHash: string,
  label: string,
): Record<string, unknown> {
  const content = [...((doc.content as unknown[]) ?? [])];
  content.push({
    type: 'paragraph',
    content: [{ type: 'evidenceMention', attrs: { id: fileHash, label: label.slice(0, 30) } }],
  });
  return { ...doc, content };
}

function GapSearchPanel({
  gap, thesisId, thesisContent, onVersionAdded,
}: {
  gap: EvidenceGap;
  thesisId: string;
  thesisContent: Record<string, unknown>;
  onVersionAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<VaultHit[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<Set<string>>(new Set());

  async function search() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (hits.length > 0) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/evidence/search?q=${encodeURIComponent(gap.suggestedSearch)}&limit=5`));
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { results: { metadata: VaultHit }[] };
      setHits((data.results ?? []).map(r => r.metadata));
    } catch {
      setHits([]);
    } finally {
      setLoading(false);
    }
  }

  async function addToThesis(hit: VaultHit) {
    setAdding(prev => new Set(prev).add(hit.fileHash));
    try {
      const newContent = appendEvidenceMention(thesisContent, hit.fileHash, hit.summary);
      const res = await fetch(apiUrl(`/api/thesis/${thesisId}/version`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userContent: newContent }),
      });
      if (!res.ok) throw new Error();
      setAdded(prev => new Set(prev).add(hit.fileHash));
      onVersionAdded();
    } finally {
      setAdding(prev => { const s = new Set(prev); s.delete(hit.fileHash); return s; });
    }
  }

  return (
    <div className="border border-amber-200 rounded-xl overflow-hidden">
      <div className="bg-amber-50 p-4 flex items-start justify-between gap-4">
        <p className="text-sm text-amber-800 flex-1">{gap.description}</p>
        <button
          onClick={search}
          className="shrink-0 text-xs font-semibold px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg transition-colors"
        >
          {open ? 'Hide' : 'Search Vault'}
        </button>
      </div>

      {open && (
        <div className="bg-white border-t border-amber-200">
          {gap.suggestedSearch && (
            <p className="text-xs text-slate-400 px-4 pt-3 pb-1 font-mono">{gap.suggestedSearch}</p>
          )}
          {loading && <p className="text-xs text-slate-500 px-4 py-3">Searching vault…</p>}
          {!loading && hits.length === 0 && (
            <p className="text-xs text-slate-400 px-4 py-3">
              No matching evidence in vault — submit new evidence via MCP or the evidence form.
            </p>
          )}
          {!loading && hits.map(hit => (
            <div key={hit.fileHash} className="flex items-start gap-3 px-4 py-3 border-b border-slate-100 last:border-0">
              <span className={`mt-1 shrink-0 w-2 h-2 rounded-full ${gapTierDot(hit.tier)}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 leading-snug">{hit.summary.slice(0, 120)}</p>
                <p className="text-xs text-slate-400 mt-0.5">{hit.category} · {hit.evidenceDate}</p>
              </div>
              <button
                disabled={added.has(hit.fileHash) || adding.has(hit.fileHash)}
                onClick={() => void addToThesis(hit)}
                className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                  added.has(hit.fileHash)
                    ? 'bg-emerald-100 text-emerald-700 cursor-default'
                    : adding.has(hit.fileHash)
                    ? 'bg-slate-100 text-slate-400 cursor-wait'
                    : 'bg-violet-100 hover:bg-violet-200 text-violet-700'
                }`}
              >
                {added.has(hit.fileHash) ? 'Added ✓' : adding.has(hit.fileHash) ? '…' : 'Add to Thesis'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const STRENGTH_STYLES: Record<string, string> = {
  WEAK: 'bg-red-50 border-red-200 text-red-700',
  MODERATE: 'bg-amber-50 border-amber-200 text-amber-700',
  STRONG: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  COMPELLING: 'bg-violet-50 border-violet-200 text-violet-700',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function ThesisPageInner({ id }: { id: string }) {
  const t = useTranslations('theses');
  const tc = useTranslations('common');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const historicalVersionId = searchParams.get('v');
  const isHistorical = !!historicalVersionId;

  const [thesis, setThesis] = useState<Thesis | null>(null);
  const [evidenceMap, setEvidenceMap] = useState<Record<string, EvidenceInfo>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  type RevisionState =
    | null
    | 'loading'
    | { suggestedContent: Record<string, unknown>; revisionsExplained: string; newEvidenceCount: number };

  const [revision, setRevision] = useState<RevisionState>(null);
  const [savingRevision, setSavingRevision] = useState(false);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function loadThesis() {
    const url = historicalVersionId
      ? apiUrl(`/api/thesis/${id}/versions/${historicalVersionId}`)
      : apiUrl(`/api/thesis/${id}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const data = (await res.json()) as { thesis: Thesis; evidenceMap: Record<string, EvidenceInfo> };
    setThesis(data.thesis);
    setEvidenceMap(data.evidenceMap ?? {});
    return data.thesis;
  }

  useEffect(() => {
    loadThesis()
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, historicalVersionId]);

  async function runRevision() {
    setRevision('loading');
    try {
      const res = await fetch(apiUrl(`/api/thesis/${id}/suggest-revision`), { method: 'POST' });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as {
        suggestedContent: Record<string, unknown>;
        revisionsExplained: string;
        newEvidenceCount: number;
      };
      setRevision(data);
    } catch {
      setRevision(null);
    }
  }

  async function acceptRevision() {
    if (!revision || revision === 'loading') return;
    setSavingRevision(true);
    try {
      const res = await fetch(apiUrl(`/api/thesis/${id}/version`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userContent: revision.suggestedContent }),
      });
      if (!res.ok) throw new Error();
      setRevision(null);
      await loadThesis();
    } finally {
      setSavingRevision(false);
    }
  }

  async function runAnalysis() {
    setAnalyzing(true);
    try {
      await fetch(apiUrl(`/api/thesis/${id}/analyze`), { method: 'POST' });
      pollRef.current = setInterval(async () => {
        try {
          const thesis = await loadThesis();
          if (thesis.headVersion?.status === 'COMPLETE') {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setAnalyzing(false);
          }
        } catch { /* keep polling */ }
      }, 3000);
    } catch {
      setAnalyzing(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-500 text-sm">{t('savingBtn')}</p>
      </div>
    );
  }

  if (error || !thesis) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-red-600">{t('errorEvaluate')}</p>
          <Link href="/theses" className="text-slate-600 hover:text-slate-900 text-sm transition-colors">
            ← {t('pageTitle')}
          </Link>
        </div>
      </div>
    );
  }

  const hv = thesis.headVersion;
  const analysis = hv?.aiAnalysis ?? null;
  const keyFigureMentions = hv?.mentions.filter(m => m.type === 'KEY_FIGURE') ?? [];
  const evidenceMentions = hv?.mentions.filter(m => m.type === 'EVIDENCE') ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <Link href="/theses" className="text-slate-600 hover:text-slate-900 text-sm transition-colors">
            ← {t('pageTitle')}
          </Link>
          <span className="text-slate-300">·</span>
          <span className="text-slate-500 text-xs">{tc('appName')}</span>
          <div className="ms-auto flex items-center gap-2">
            {isHistorical ? (
              <Link
                href={`/theses/${id}/history`}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-medium text-slate-700 transition-colors"
              >
                {t('historyBtn')}
              </Link>
            ) : (
              <>
                <Link
                  href={`/theses/${id}/edit`}
                  className="px-3 py-1.5 bg-violet-700 hover:bg-violet-600 rounded-lg text-xs font-medium text-white transition-colors"
                >
                  {t('editBtn')}
                </Link>
                <Link
                  href={`/theses/${id}/history`}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-medium text-slate-700 transition-colors"
                >
                  {t('historyBtn')}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {/* Historical version banner */}
        {isHistorical && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
            <span>📋</span>
            <span>{locale === 'he' ? 'צפייה בגרסה היסטורית — לקריאה בלבד' : 'Viewing historical version — read only'}</span>
            <Link href={`/theses/${id}`} className="ms-auto font-medium text-amber-900 hover:underline shrink-0">
              {locale === 'he' ? 'לגרסה הנוכחית ←' : 'Current version →'}
            </Link>
          </div>
        )}

        {/* Status + date */}
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span
            className={`font-semibold px-3 py-1 rounded-full border ${
              hv?.status === 'COMPLETE'
                ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                : 'bg-amber-100 text-amber-700 border-amber-300'
            }`}
          >
            {hv?.status === 'COMPLETE' ? 'AI reviewed' : 'Pending AI'}
          </span>
          <span>
            {new Date(thesis.createdAt).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US')}
          </span>
        </div>

        {/* Thesis body */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          {hv ? <TipTapRenderer doc={hv.userContent} evidenceMap={evidenceMap} /> : null}
        </div>

        {/* Mentioned key figures */}
        {keyFigureMentions.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {t('keyFiguresLabel')}
            </h3>
            <div className="flex flex-wrap gap-2">
              {keyFigureMentions.map(m => (
                <span
                  key={m.id}
                  className="bg-violet-100 text-violet-700 text-xs px-3 py-1 rounded-full"
                >
                  @{m.refId}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Mentioned evidence */}
        {evidenceMentions.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {t('evidenceSuggestion')} ({evidenceMentions.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {evidenceMentions.map(m => {
                const info = evidenceMap[m.refId];
                const tierDotClass = gapTierDot(info?.evidenceTier ?? '');
                const label = info?.summary?.slice(0, 35) || m.refId.slice(0, 8);
                return (
                  <Link
                    key={m.id}
                    href={`/timeline?hash=${m.refId}`}
                    className="inline-flex items-center gap-1.5 bg-amber-100 hover:bg-amber-200 text-amber-700 text-xs px-3 py-1 rounded-full transition-colors"
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${tierDotClass}`} />
                    #{label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* AI analysis — DevilsAdvocate */}
        {analysis && (
          <section className="space-y-5 pt-4 border-t border-slate-200">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-slate-900">{t('aiAnalysisTitle')}</h2>
              <span
                className={`text-xs font-semibold px-3 py-1 rounded-full border ${
                  STRENGTH_STYLES[analysis.overallStrengthAssessment] ?? ''
                }`}
              >
                {analysis.overallStrengthAssessment}
              </span>
            </div>

            {/* Hebrew summary */}
            {analysis.summaryHe && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4" dir="rtl">
                <p className="text-sm text-slate-700 leading-relaxed">{analysis.summaryHe}</p>
              </div>
            )}

            {/* Counter-arguments */}
            {analysis.counterArguments.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t('counterArgumentsLabel')}
                </h3>
                {analysis.counterArguments.map((ca, i) => (
                  <div
                    key={i}
                    className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-sm"
                  >
                    <p className="text-sm text-slate-900 font-medium">{ca.claim}</p>
                    <p className="text-sm text-red-700">{ca.counterArgument}</p>
                    <span className="inline-block text-xs text-slate-400 font-medium">
                      {ca.strengthOfCounter}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Evidence gaps */}
            {analysis.evidenceGaps.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t('evidenceGapsLabel')}
                </h3>
                {analysis.evidenceGaps.map((gap, i) => (
                  isHistorical
                    ? (
                      <div key={i} className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1">
                        <p className="text-sm text-slate-800 font-medium">{gap.description}</p>
                        {gap.suggestedSearch && (
                          <p className="text-xs text-slate-500 font-mono">{gap.suggestedSearch}</p>
                        )}
                      </div>
                    )
                    : (
                      <GapSearchPanel
                        key={i}
                        gap={gap}
                        thesisId={id}
                        thesisContent={hv?.userContent ?? {}}
                        onVersionAdded={() => { void loadThesis(); }}
                      />
                    )
                ))}
              </div>
            )}

            {/* Alternative interpretations */}
            {analysis.alternativeInterpretations.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t('alternativeInterpretationsLabel')}
                </h3>
                <ul className="space-y-1.5">
                  {analysis.alternativeInterpretations.map((interp, i) => (
                    <li key={i} className="text-sm text-slate-700 flex gap-2">
                      <span className="text-slate-400 shrink-0">↔</span>
                      <span>{interp}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Suggest Revision button — hidden for historical versions */}
            {!isHistorical && revision === null && (
              <div className="pt-2">
                <button
                  onClick={() => void runRevision()}
                  className="px-4 py-2 bg-violet-700 hover:bg-violet-600 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  Suggest Revision
                </button>
              </div>
            )}

            {/* Revision loading */}
            {revision === 'loading' && (
              <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 flex items-center gap-3 text-violet-700 text-sm">
                <span className="animate-spin">⏳</span>
                <span>Drafting revision… this takes ~30 seconds</span>
              </div>
            )}

            {/* Revision preview */}
            {revision !== null && revision !== 'loading' && (
              <div className="space-y-4 border border-violet-200 rounded-2xl overflow-hidden">
                <div className="bg-violet-50 px-5 py-4 space-y-1">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-sm font-bold text-violet-900">Suggested Revision</h3>
                    {revision.newEvidenceCount > 0 && (
                      <span className="text-xs bg-violet-200 text-violet-800 px-2 py-0.5 rounded-full font-semibold">
                        +{revision.newEvidenceCount} evidence
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-violet-800 leading-relaxed">{revision.revisionsExplained}</p>
                </div>

                <div className="bg-white border-t border-violet-100 px-5 py-4">
                  <TipTapRenderer doc={revision.suggestedContent} evidenceMap={evidenceMap} />
                </div>

                <div className="bg-slate-50 border-t border-violet-200 px-5 py-3 flex gap-3">
                  <button
                    disabled={savingRevision}
                    onClick={() => void acceptRevision()}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    {savingRevision ? 'Saving…' : 'Accept & Save'}
                  </button>
                  <button
                    disabled={savingRevision}
                    onClick={() => setRevision(null)}
                    className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Pending AI notice + trigger button — hidden for historical versions */}
        {!isHistorical && hv?.status === 'PENDING_AI' && !analyzing && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
            <p className="text-amber-700 text-sm">{t('pendingAiNotice')}</p>
            <button
              onClick={runAnalysis}
              className="shrink-0 px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              Run AI Analysis
            </button>
          </div>
        )}
        {analyzing && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3 text-amber-700 text-sm">
            <span className="animate-spin">⏳</span>
            <span>Running Devil&apos;s Advocate analysis… this takes ~30 seconds</span>
          </div>
        )}
      </main>
    </div>
  );
}

export default function ThesisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <ThesisPageInner id={id} />
    </Suspense>
  );
}
