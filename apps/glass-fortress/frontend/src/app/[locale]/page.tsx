'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { TopNav } from '@/components/TopNav';
import { apiUrl } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlatformStats {
  evidenceCount: number;
  thesisCount: number;
  forensicDiffCount: number;
}

interface ThesisSummary {
  id: string;
  title: string | null;
  createdAt: string;
  openGapCount: number;
  headVersion: {
    id: string;
    status: string;
    preview: string;
    mentionCount: number;
    strength: string | null;
    createdAt: string;
  } | null;
}

// ---------------------------------------------------------------------------
// Strength badge
// ---------------------------------------------------------------------------

const STRENGTH_STYLES: Record<string, { badge: string; dot: string }> = {
  WEAK:       { badge: 'bg-red-100 text-red-700 border-red-200',     dot: 'bg-red-400' },
  MODERATE:   { badge: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-400' },
  STRONG:     { badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  COMPELLING: { badge: 'bg-blue-100 text-blue-700 border-blue-200',  dot: 'bg-blue-500' },
};

function StrengthBadge({ strength }: { strength: string }) {
  const s = STRENGTH_STYLES[strength] ?? STRENGTH_STYLES.MODERATE;
  return (
    <span className={`inline-flex items-center gap-1 shrink-0 px-2 py-0.5 rounded border text-xs font-medium ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {strength.charAt(0) + strength.slice(1).toLowerCase()}
    </span>
  );
}

// ---------------------------------------------------------------------------
// War board card
// ---------------------------------------------------------------------------

function ThesisCard({ thesis, t }: { thesis: ThesisSummary; t: ReturnType<typeof useTranslations<'home'>> }) {
  const strength = thesis.headVersion?.strength;
  return (
    <Link
      href={`/call/${thesis.id}`}
      className="group flex flex-col bg-white border border-slate-200 rounded-xl p-5 gap-3 hover:border-slate-400 hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 leading-snug">
          {thesis.title ?? t('noTitle')}
        </h3>
        {strength && <StrengthBadge strength={strength} />}
      </div>

      {thesis.headVersion?.preview && (
        <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed flex-1">
          {thesis.headVersion.preview}
        </p>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-auto">
        {thesis.openGapCount > 0 ? (
          <span className="text-xs font-medium text-red-600">
            {t('warBoardGaps', { count: thesis.openGapCount })}
          </span>
        ) : (
          <span />
        )}
        <span className="text-xs text-blue-600 font-medium group-hover:underline">
          {t('warBoardView')} →
        </span>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const ZERO_STATS: PlatformStats = { evidenceCount: 0, thesisCount: 0, forensicDiffCount: 0 };

export default function HomePage() {
  const t = useTranslations('home');
  const tc = useTranslations('common');

  const [stats, setStats] = useState<PlatformStats>(ZERO_STATS);
  const [theses, setTheses] = useState<ThesisSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      fetch(apiUrl('/api/stats'))
        .then((r) => r.ok ? r.json() as Promise<PlatformStats> : null)
        .catch(() => null),
      fetch(apiUrl('/api/thesis'))
        .then((r) => r.ok ? r.json() as Promise<{ theses: ThesisSummary[] }> : null)
        .catch(() => null),
    ]).then(([statsData, thesisData]) => {
      if (statsData) setStats(statsData);
      if (thesisData?.theses) {
        const sorted = thesisData.theses
          .filter((thesis) => thesis.headVersion?.status === 'COMPLETE')
          .sort((a, b) => b.openGapCount - a.openGapCount);
        setTheses(sorted);
      }
    }).finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-white">
      {/* Sticky nav header */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-lg">⬡</span>
            <span className="font-mono text-sm font-semibold tracking-widest text-slate-900 uppercase">
              {tc('appName')}
            </span>
          </div>
          <TopNav current="home" />
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="bg-slate-900 text-white">
        <div className="max-w-4xl mx-auto px-6 py-20 sm:py-28 text-center space-y-6">
          <p className="text-xs font-mono tracking-[0.2em] text-slate-400 uppercase">
            {t('heroTag')}
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight tracking-tight">
            {t('heroTitle')}
          </h1>
          <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
            {t('heroSubtitle')}
          </p>
        </div>
      </section>

      {/* ── Live Stats ───────────────────────────────────────────────────── */}
      <section className="bg-slate-800 border-y border-slate-700">
        <div className="max-w-4xl mx-auto px-6 py-8 grid grid-cols-3 gap-6 text-center">
          <div>
            <div className="text-3xl sm:text-4xl font-mono font-bold text-emerald-400 tabular-nums">
              {loading ? '—' : stats.evidenceCount.toLocaleString()}
            </div>
            <div className="text-xs text-slate-400 mt-1.5 uppercase tracking-widest">
              {t('statEvidence')}
            </div>
          </div>
          <div>
            <div className="text-3xl sm:text-4xl font-mono font-bold text-blue-400 tabular-nums">
              {loading ? '—' : stats.thesisCount.toLocaleString()}
            </div>
            <div className="text-xs text-slate-400 mt-1.5 uppercase tracking-widest">
              {t('statTheses')}
            </div>
          </div>
          <div>
            <div className="text-3xl sm:text-4xl font-mono font-bold text-orange-400 tabular-nums">
              {loading ? '—' : stats.forensicDiffCount.toLocaleString()}
            </div>
            <div className="text-xs text-slate-400 mt-1.5 uppercase tracking-widest">
              {t('statForensicDiffs')}
            </div>
          </div>
        </div>
      </section>

      {/* ── War Board ────────────────────────────────────────────────────── */}
      <section className="bg-slate-50 py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-end justify-between mb-8 gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{t('warBoardTitle')}</h2>
              <p className="text-sm text-slate-500 mt-1 max-w-xl">{t('warBoardSubtitle')}</p>
            </div>
            <Link
              href="/call"
              className="shrink-0 text-xs font-medium text-blue-600 hover:underline"
            >
              {t('seeAllCases')} →
            </Link>
          </div>

          {loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-48 bg-white border border-slate-200 rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {!loading && theses.length === 0 && (
            <p className="text-slate-500 text-sm">{t('warBoardEmpty')}</p>
          )}

          {!loading && theses.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {theses.slice(0, 9).map((thesis) => (
                <ThesisCard key={thesis.id} thesis={thesis} t={t} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Two Doors ────────────────────────────────────────────────────── */}
      <section className="py-16 border-t border-slate-200">
        <div className="max-w-4xl mx-auto px-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Whistleblower door */}
          <div className="bg-slate-900 rounded-2xl p-8 text-white flex flex-col gap-4">
            <div className="text-3xl">🔒</div>
            <h3 className="text-xl font-bold">{t('door1Title')}</h3>
            <p className="text-slate-300 text-sm leading-relaxed flex-1">{t('door1Body')}</p>
            <Link
              href="/call"
              className="self-start px-5 py-2.5 rounded-lg bg-white text-slate-900 text-sm font-semibold hover:bg-slate-100 transition-colors"
            >
              {t('door1Btn')}
            </Link>
          </div>

          {/* Researcher door */}
          <div className="bg-white border-2 border-slate-200 rounded-2xl p-8 flex flex-col gap-4">
            <div className="text-3xl">🔬</div>
            <h3 className="text-xl font-bold text-slate-900">{t('door2Title')}</h3>
            <p className="text-slate-500 text-sm leading-relaxed flex-1">{t('door2Body')}</p>
            <Link
              href="/researchers"
              className="self-start px-5 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
            >
              {t('door2Btn')}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
