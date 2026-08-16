'use client';

import { useState, useEffect, useRef } from 'react';
import { HeroSection } from '@/components/HeroSection';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { TopNav } from '@/components/TopNav';
import { apiUrl } from '@/lib/api';
import { animate, useInView } from 'framer-motion';
import { ScrollReveal, StaggerContainer, StaggerItem } from '@/components/ScrollReveal';
import { STRENGTH_RANK } from '@/components/StrengthBadge';
import { ThesisHighlightCard, type ThesisSummary } from '@/components/ThesisHighlightCard';
import { EvidenceHighlightCard, type EvidenceHighlight } from '@/components/EvidenceHighlightCard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlatformStats {
  evidenceCount: number;
  thesisCount: number;
  forensicDiffCount: number;
}

const ZERO_STATS: PlatformStats = { evidenceCount: 0, thesisCount: 0, forensicDiffCount: 0 };

const MISSION_PILLARS = [
  { icon: '⚖️', titleKey: 'missionPillar1Title', bodyKey: 'missionPillar1Body' },
  { icon: '🔗', titleKey: 'missionPillar2Title', bodyKey: 'missionPillar2Body' },
  { icon: '🔒', titleKey: 'missionPillar3Title', bodyKey: 'missionPillar3Body' },
] as const;

// ---------------------------------------------------------------------------
// Stat count-up — starts once the number is both in view AND loaded, so it
// never freezes at 0 if the fetch resolves after the section scrolls into view.
// ---------------------------------------------------------------------------

function CountUp({ value, ready }: { value: number; ready: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView || !ready) return;
    const controls = animate(0, value, {
      duration: 1.2,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, ready, value]);

  return <span ref={ref}>{ready ? display.toLocaleString() : '—'}</span>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HomePage() {
  const t = useTranslations('home');
  const tc = useTranslations('common');

  const [stats, setStats] = useState<PlatformStats>(ZERO_STATS);
  const [theses, setTheses] = useState<ThesisSummary[]>([]);
  const [evidence, setEvidence] = useState<EvidenceHighlight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      fetch(apiUrl('/api/stats'))
        .then((r) => r.ok ? r.json() as Promise<PlatformStats> : null)
        .catch(() => null),
      fetch(apiUrl('/api/thesis'))
        .then((r) => r.ok ? r.json() as Promise<{ theses: ThesisSummary[] }> : null)
        .catch(() => null),
      fetch(apiUrl('/api/evidence/latest?limit=6'))
        .then((r) => r.ok ? r.json() as Promise<{ results: EvidenceHighlight[] }> : null)
        .catch(() => null),
    ]).then(([statsData, thesisData, evidenceData]) => {
      if (statsData) setStats(statsData);
      if (thesisData?.theses) {
        const sorted = thesisData.theses
          .filter((thesis) => thesis.headVersion?.status === 'COMPLETE')
          .sort((a, b) => {
            const rankA = STRENGTH_RANK[a.headVersion?.strength ?? ''] ?? -1;
            const rankB = STRENGTH_RANK[b.headVersion?.strength ?? ''] ?? -1;
            if (rankB !== rankA) return rankB - rankA;
            return (b.headVersion?.mentionCount ?? 0) - (a.headVersion?.mentionCount ?? 0);
          });
        setTheses(sorted);
      }
      if (evidenceData?.results) setEvidence(evidenceData.results);
    }).finally(() => setLoading(false));
  }, []);

  const featuredThesis = theses[0];
  const secondaryTheses = theses.slice(1, 5);

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
      <HeroSection />

      {/* ── Live Stats ───────────────────────────────────────────────────── */}
      <ScrollReveal className="bg-slate-800 border-y border-slate-700">
        <div className="max-w-4xl mx-auto px-6 py-8 grid grid-cols-3 gap-6 text-center">
          <div>
            <div className="text-3xl sm:text-4xl font-mono font-bold text-emerald-400 tabular-nums">
              <CountUp value={stats.evidenceCount} ready={!loading} />
            </div>
            <div className="text-xs text-slate-400 mt-1.5 uppercase tracking-widest">
              {t('statEvidence')}
            </div>
          </div>
          <div>
            <div className="text-3xl sm:text-4xl font-mono font-bold text-blue-400 tabular-nums">
              <CountUp value={stats.thesisCount} ready={!loading} />
            </div>
            <div className="text-xs text-slate-400 mt-1.5 uppercase tracking-widest">
              {t('statTheses')}
            </div>
          </div>
          <div>
            <div className="text-3xl sm:text-4xl font-mono font-bold text-orange-400 tabular-nums">
              <CountUp value={stats.forensicDiffCount} ready={!loading} />
            </div>
            <div className="text-xs text-slate-400 mt-1.5 uppercase tracking-widest">
              {t('statForensicDiffs')}
            </div>
          </div>
        </div>
      </ScrollReveal>

      {/* ── Mission teaser ───────────────────────────────────────────────── */}
      <ScrollReveal className="bg-white py-16">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-10">
            {t('missionHeading')}
          </h2>
          <StaggerContainer className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {MISSION_PILLARS.map((pillar) => (
              <StaggerItem key={pillar.titleKey} className="flex flex-col items-center text-center gap-3">
                <div className="text-4xl">{pillar.icon}</div>
                <h3 className="text-base font-semibold text-slate-900">{t(pillar.titleKey)}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{t(pillar.bodyKey)}</p>
              </StaggerItem>
            ))}
          </StaggerContainer>
          <div className="text-center mt-10">
            <Link href="/about" className="text-sm font-medium text-blue-600 hover:underline">
              {t('missionCta')} →
            </Link>
          </div>
        </div>
      </ScrollReveal>

      {/* ── Top Theses ───────────────────────────────────────────────────── */}
      <ScrollReveal className="bg-slate-50 py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-end justify-between mb-8 gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{t('warBoardTitle')}</h2>
              <p className="text-sm text-slate-500 mt-1 max-w-xl">{t('warBoardSubtitle')}</p>
            </div>
            <Link href="/call" className="shrink-0 text-xs font-medium text-blue-600 hover:underline">
              {t('seeAllCases')} →
            </Link>
          </div>

          {loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 h-56 bg-white border border-slate-200 rounded-2xl animate-pulse" />
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-48 bg-white border border-slate-200 rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {!loading && theses.length === 0 && (
            <p className="text-slate-500 text-sm">{t('warBoardEmpty')}</p>
          )}

          {!loading && featuredThesis && (
            <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <StaggerItem className="sm:col-span-2">
                <ThesisHighlightCard thesis={featuredThesis} featured t={t} />
              </StaggerItem>
              {secondaryTheses.map((thesis) => (
                <StaggerItem key={thesis.id}>
                  <ThesisHighlightCard thesis={thesis} t={t} />
                </StaggerItem>
              ))}
            </StaggerContainer>
          )}
        </div>
      </ScrollReveal>

      {/* ── Latest Evidence ──────────────────────────────────────────────── */}
      <ScrollReveal className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-end justify-between mb-8 gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{t('latestEvidenceTitle')}</h2>
              <p className="text-sm text-slate-500 mt-1 max-w-xl">{t('latestEvidenceSubtitle')}</p>
            </div>
            <Link href="/vault" className="shrink-0 text-xs font-medium text-blue-600 hover:underline">
              {t('seeAllEvidence')} →
            </Link>
          </div>

          {loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-48 bg-white border border-slate-200 rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {!loading && evidence.length === 0 && (
            <p className="text-slate-500 text-sm">{t('latestEvidenceEmpty')}</p>
          )}

          {!loading && evidence.length > 0 && (
            <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {evidence.map((ev) => (
                <StaggerItem key={ev.evidenceId}>
                  <EvidenceHighlightCard evidence={ev} t={t} />
                </StaggerItem>
              ))}
            </StaggerContainer>
          )}
        </div>
      </ScrollReveal>

      {/* ── Whistleblower CTA ────────────────────────────────────────────── */}
      <ScrollReveal className="bg-slate-900 py-20">
        <div className="max-w-3xl mx-auto px-6 text-center flex flex-col items-center gap-6">
          <h2 className="text-3xl font-bold text-white">{t('wbCtaHeading')}</h2>
          <p className="text-slate-300 leading-relaxed">{t('wbCtaBody')}</p>
          <div className="flex flex-wrap justify-center gap-3">
            {[t('wbCtaChip1'), t('wbCtaChip2'), t('wbCtaChip3')].map((chip) => (
              <span
                key={chip}
                className="px-3 py-1 rounded-full text-xs font-medium bg-white/10 text-slate-200 border border-white/20"
              >
                {chip}
              </span>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4 mt-2">
            <Link
              href="/submit"
              className="px-6 py-3 rounded-lg bg-white text-slate-900 text-sm font-semibold hover:bg-slate-100 transition-colors"
            >
              {t('wbCtaBtnPrimary')}
            </Link>
            <Link href="/safety" className="text-sm font-medium text-slate-300 hover:text-white hover:underline">
              {t('wbCtaBtnSecondary')} →
            </Link>
          </div>
        </div>
      </ScrollReveal>

      {/* ── Get Involved ─────────────────────────────────────────────────── */}
      <ScrollReveal className="py-16 border-t border-slate-200">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-8">
            {t('getInvolvedHeading')}
          </h2>
          <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Whistleblower door */}
            <StaggerItem>
              <div className="h-full bg-slate-900 rounded-2xl p-8 text-white flex flex-col gap-4">
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
            </StaggerItem>

            {/* Researcher door */}
            <StaggerItem>
              <div className="h-full bg-white border-2 border-slate-200 rounded-2xl p-8 flex flex-col gap-4">
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
            </StaggerItem>
          </StaggerContainer>
        </div>
      </ScrollReveal>
    </main>
  );
}
