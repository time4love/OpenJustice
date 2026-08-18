'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopNav } from '@/components/TopNav';
import { Link, useRouter, usePathname } from '@/i18n/navigation';
import { apiUrl } from '@/lib/api';
import { CategoryBadges } from '@/components/CategoryBadges';
import type { EvidenceMetadata, EvidencePerspective } from '@/types/evidence';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FigureItem {
  id: string;
  name: string;
  evidenceCount: number;
}

interface EvidenceRecord {
  content: string;
  metadata: EvidenceMetadata;
}

// ---------------------------------------------------------------------------
// Perspective styles
// ---------------------------------------------------------------------------

const PERSPECTIVE_STYLES: Record<EvidencePerspective, { dot: string; border: string; header: string }> = {
  'Internal Knowledge': { dot: 'bg-red-500', border: 'border-red-200', header: 'bg-red-50 border-red-100' },
  'Public Statement':   { dot: 'bg-blue-500', border: 'border-blue-200', header: 'bg-blue-50 border-blue-100' },
  'Citizen Experience': { dot: 'bg-slate-400', border: 'border-slate-200', header: 'bg-slate-100 border-slate-200' },
};

const FALLBACK_STYLES = { dot: 'bg-slate-400', border: 'border-slate-200', header: 'bg-slate-100 border-slate-200' };

function perspectiveStyles(p?: string) {
  return PERSPECTIVE_STYLES[p as EvidencePerspective] ?? FALLBACK_STYLES;
}

function formatHash(hash: string): string {
  if (hash.length <= 18) return hash;
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

// ---------------------------------------------------------------------------
// Evidence card (compact, inline)
// ---------------------------------------------------------------------------

function EvidenceCard({ record, index }: { record: EvidenceRecord; index: number }) {
  const { metadata } = record;
  const styles = perspectiveStyles(metadata.evidencePerspective);
  const isUnknown = metadata.evidenceDate === 'Unknown';

  return (
    <div className="flex gap-3 mb-4 last:mb-0">
      <div className="flex flex-col items-center shrink-0">
        <div className={`w-2.5 h-2.5 rounded-full ring-2 ring-slate-50 mt-[1.1rem] shrink-0 ${styles.dot}`} />
        <div className="w-px flex-1 bg-slate-200 mt-1 min-h-6" />
      </div>

      <div className={`flex-1 min-w-0 rounded-xl border shadow-sm overflow-hidden bg-white ${styles.border}`}>
        <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 border-b ${styles.header}`}>
          <span className={`font-mono text-xs shrink-0 ${isUnknown ? 'text-slate-300 italic' : 'text-slate-500 font-medium'}`}>
            {isUnknown ? '—' : metadata.evidenceDate}
          </span>
          {metadata.evidenceRole === 'Incriminating' && (
            <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border bg-red-50 text-red-600 border-red-200">
              מפלילה
            </span>
          )}
          <CategoryBadges categories={metadata.investigativeCategories} max={2} />
          <span className="ms-auto text-xs text-slate-300 font-mono shrink-0">#{index + 1}</span>
        </div>

        <div className="px-3 py-2.5 space-y-2">
          <p className="text-sm text-slate-700 leading-relaxed" dir="auto">{metadata.summary}</p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 border-t border-slate-100/80">
            <span className="text-xs text-slate-500">{metadata.targetEntity}</span>
            <span className="font-mono text-xs text-emerald-600" title={metadata.fileHash}>
              {formatHash(metadata.fileHash)}
            </span>
            {(metadata.sourceUrl ?? metadata.fileUrl) && (
              <a
                href={metadata.sourceUrl ?? metadata.fileUrl ?? ''}
                target="_blank"
                rel="noopener noreferrer"
                className="ms-auto text-xs font-medium text-blue-600 hover:underline"
              >
                מקור ↗
              </a>
            )}
            {metadata.trackedUrlId && (
              <Link
                href={`/forensics/${metadata.trackedUrlId}`}
                className="text-xs font-medium text-purple-600 hover:underline"
              >
                היסטוריה ↗
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Locale switcher
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FiguresPage() {
  const tc = useTranslations('common');
  const t = useTranslations('figures');
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [figures, setFigures] = useState<FigureItem[]>([]);
  const [figuresLoading, setFiguresLoading] = useState(true);
  const [figuresError, setFiguresError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('id'));
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  // Load figure list on mount
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(apiUrl('/api/figures'));
        const data = (await res.json()) as { figures?: FigureItem[]; message?: string };
        if (!res.ok) { setFiguresError(data.message ?? `Error ${res.status}`); return; }
        setFigures(data.figures ?? []);
      } catch {
        setFiguresError('Could not reach the backend.');
      } finally {
        setFiguresLoading(false);
      }
    })();
  }, []);

  // Load evidence when selectedId changes
  const loadEvidence = useCallback(async (id: string) => {
    setEvidenceLoading(true);
    setEvidenceError(null);
    setEvidence([]);
    try {
      const res = await fetch(apiUrl(`/api/figures/${id}`));
      const data = (await res.json()) as { evidence?: EvidenceRecord[]; message?: string };
      if (!res.ok) { setEvidenceError(data.message ?? `Error ${res.status}`); return; }
      setEvidence(data.evidence ?? []);
    } catch {
      setEvidenceError('Could not load evidence.');
    } finally {
      setEvidenceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadEvidence(selectedId);
  }, [selectedId, loadEvidence]);

  function selectFigure(id: string) {
    setSelectedId(id);
    router.replace(`${pathname}?id=${id}`);
  }

  const selectedFigure = figures.find((f) => f.id === selectedId) ?? null;

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <Image src="/icon_dove.png" alt="" width={24} height={24} className="w-5 h-5" />
            <span className="font-mono text-sm font-semibold tracking-widest text-slate-900 uppercase">
              {tc('appName')}
            </span>
            <span className="ms-2 text-xs text-slate-400 tracking-wide hidden sm:inline">
              {t('tagline')}
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <TopNav current="figures" />
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col sm:flex-row gap-6 items-start">

          {/* Left panel — figure list */}
          <div className="w-full sm:w-64 sm:shrink-0 sm:sticky sm:top-20">
            {figuresLoading && (
              <div className="animate-pulse space-y-2">
                {[1,2,3,4,5].map((i) => (
                  <div key={i} className="h-10 bg-white border border-slate-200 rounded-lg" />
                ))}
              </div>
            )}

            {figuresError && (
              <p className="text-xs text-red-600 px-3">{figuresError}</p>
            )}

            {!figuresLoading && !figuresError && figures.length === 0 && (
              <div className="text-center px-4 py-8 border border-dashed border-slate-200 rounded-xl bg-white">
                <p className="text-xs text-slate-400">{t('emptyTitle')}</p>
              </div>
            )}

            {!figuresLoading && figures.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest px-1 mb-3">
                  {figures.length} {tc('nav.figures').toLowerCase()}
                </p>
                {figures.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => selectFigure(f.id)}
                    className={`w-full text-start flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition-all ${
                      selectedId === f.id
                        ? 'bg-slate-900 text-white border-slate-700 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:text-blue-700'
                    }`}
                  >
                    <span className="font-medium truncate" dir="auto">{f.name}</span>
                    <span className={`shrink-0 ms-2 text-xs px-1.5 py-0.5 rounded-full ${
                      selectedId === f.id ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {f.evidenceCount}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right panel — evidence for selected figure */}
          <div className="flex-1 min-w-0">
            {!selectedId && (
              <div className="flex flex-col items-center justify-center text-center px-8 py-24 border border-dashed border-slate-200 rounded-xl bg-white shadow-sm">
                <div className="text-3xl mb-4 text-slate-300">◎</div>
                <p className="text-sm font-medium text-slate-500">בחר דמות מהרשימה</p>
                <p className="text-xs text-slate-400 mt-1">Select a figure from the list to view linked evidence</p>
              </div>
            )}

            {selectedId && selectedFigure && (
              <div className="space-y-4">
                {/* Selected figure header */}
                <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 shadow-sm">
                  <h2 className="text-xl font-bold text-slate-900" dir="auto">{selectedFigure.name}</h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {t('evidenceLinked', { count: selectedFigure.evidenceCount })}
                  </p>
                </div>

                {/* Evidence loading */}
                {evidenceLoading && (
                  <div className="animate-pulse space-y-4">
                    {[1,2,3].map((i) => (
                      <div key={i} className="flex gap-3">
                        <div className="flex flex-col items-center shrink-0">
                          <div className="w-2.5 h-2.5 rounded-full bg-slate-200 mt-[1.1rem]" />
                          <div className="w-px flex-1 bg-slate-200 mt-1 min-h-16" />
                        </div>
                        <div className="flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                          <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex gap-3">
                            <div className="h-2.5 bg-slate-200 rounded-full w-20" />
                            <div className="h-2.5 bg-slate-200 rounded-full w-28" />
                          </div>
                          <div className="px-3 py-2.5 space-y-1.5">
                            <div className="h-2 bg-slate-100 rounded" />
                            <div className="h-2 bg-slate-100 rounded w-5/6" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Evidence error */}
                {!evidenceLoading && evidenceError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                    <p className="text-sm text-red-700">{evidenceError}</p>
                  </div>
                )}

                {/* Empty */}
                {!evidenceLoading && !evidenceError && evidence.length === 0 && (
                  <div className="flex flex-col items-center justify-center text-center px-8 py-16 border border-dashed border-slate-200 rounded-xl bg-white">
                    <p className="text-sm font-medium text-slate-500">{t('emptyTitle')}</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs">{t('emptySub')}</p>
                  </div>
                )}

                {/* Evidence list */}
                {!evidenceLoading && !evidenceError && evidence.length > 0 && (
                  <div>
                    {evidence.map((record, i) => (
                      <EvidenceCard key={record.metadata.fileHash} record={record} index={i} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </main>
  );
}
