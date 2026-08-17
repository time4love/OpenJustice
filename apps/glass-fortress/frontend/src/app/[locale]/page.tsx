'use client';

import { useState, useEffect, useRef, useId } from 'react';
import Image from 'next/image';
import { HeroSection } from '@/components/HeroSection';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { TopNav } from '@/components/TopNav';
import { apiUrl } from '@/lib/api';
import { animate, useInView } from 'framer-motion';
import { ScrollReveal, StaggerContainer, StaggerItem, ParallaxLayer } from '@/components/ScrollReveal';
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
  { icon: '/icon_case.png', titleKey: 'missionPillar1Title', bodyKey: 'missionPillar1Body', variant: 'left' },
  { icon: '/icon_blockchain.png', titleKey: 'missionPillar2Title', bodyKey: 'missionPillar2Body', variant: 'scale' },
  { icon: '/icon_vault.png', titleKey: 'missionPillar3Title', bodyKey: 'missionPillar3Body', variant: 'right' },
] as const;

// A faint diagonal rule-and-dot texture — case-file paper, not a stock grid —
// used behind a couple of sections via ParallaxLayer for scroll depth.
function DossierTexture({ tint = 'rgba(148,163,184,0.35)' }: { tint?: string }) {
  const patternId = useId();
  return (
    <svg className="w-full h-[140%] -translate-y-[10%]" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <pattern id={patternId} width="120" height="120" patternUnits="userSpaceOnUse" patternTransform="rotate(8)">
          <line x1="0" y1="0" x2="0" y2="120" stroke={tint} strokeWidth="1" />
          <circle cx="0" cy="60" r="1.6" fill={tint} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}

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
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Image src="/icon_dove.png" alt="" width={24} height={24} className="w-5 h-5" />
            <span className="font-mono text-sm font-semibold tracking-widest text-slate-900 uppercase">
              {tc('appName')}
            </span>
          </Link>
          <TopNav current="home" />
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <HeroSection />

      {/* ── Live Stats ───────────────────────────────────────────────────── */}
      <ScrollReveal className="bg-slate-800 border-y border-slate-700">
        <div className="max-w-4xl mx-auto px-6 py-8 grid grid-cols-3 gap-6 text-center">
          <div>
            <div className="text-3xl sm:text-4xl font-mono font-bold text-amber-300 tabular-nums">
              <CountUp value={stats.evidenceCount} ready={!loading} />
            </div>
            <div className="text-xs text-slate-400 mt-1.5 uppercase tracking-widest">
              {t('statEvidence')}
            </div>
          </div>
          <div>
            <div className="text-3xl sm:text-4xl font-mono font-bold text-amber-500 tabular-nums">
              <CountUp value={stats.thesisCount} ready={!loading} />
            </div>
            <div className="text-xs text-slate-400 mt-1.5 uppercase tracking-widest">
              {t('statTheses')}
            </div>
          </div>
          <div>
            <div className="text-3xl sm:text-4xl font-mono font-bold text-red-400 tabular-nums">
              <CountUp value={stats.forensicDiffCount} ready={!loading} />
            </div>
            <div className="text-xs text-slate-400 mt-1.5 uppercase tracking-widest">
              {t('statForensicDiffs')}
            </div>
          </div>
        </div>
      </ScrollReveal>

      {/* ── Mission teaser ───────────────────────────────────────────────── */}
      <div className="relative bg-white py-16 overflow-hidden">
        <ParallaxLayer speed={0.4} className="opacity-[0.4]">
          <DossierTexture />
        </ParallaxLayer>
        <div className="relative max-w-5xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-10">
            {t('missionHeading')}
          </h2>
          <StaggerContainer className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {MISSION_PILLARS.map((pillar) => (
              <StaggerItem
                key={pillar.titleKey}
                variant={pillar.variant}
                className="flex flex-col items-center text-center gap-3 bg-white/70 backdrop-blur-sm rounded-2xl p-2"
              >
                <Image
                  src={pillar.icon}
                  alt=""
                  width={88}
                  height={88}
                  className="w-20 h-20 drop-shadow-[0_6px_10px_rgba(15,23,42,0.15)]"
                />
                <h3 className="text-base font-semibold text-slate-900">{t(pillar.titleKey)}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{t(pillar.bodyKey)}</p>
              </StaggerItem>
            ))}
          </StaggerContainer>
          <div className="text-center mt-10">
            <Link href="/about" className="text-sm font-medium text-amber-700 hover:underline">
              {t('missionCta')} →
            </Link>
          </div>
        </div>
      </div>

      {/* ── Top Theses ───────────────────────────────────────────────────── */}
      <div className="relative bg-slate-50 pt-16 pb-16 overflow-hidden">
        <ParallaxLayer speed={0.5} className="opacity-[0.5]">
          <DossierTexture />
        </ParallaxLayer>
        {/* White panel laid over the section above it — a deliberate stacked-
            layer seam, not a flat band boundary. */}
        <div className="relative max-w-7xl mx-auto px-6 -mt-6 mb-8">
          <div className="bg-white rounded-2xl shadow-lg shadow-slate-900/5 px-6 py-5 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{t('warBoardTitle')}</h2>
              <p className="text-sm text-slate-500 mt-1 max-w-xl">{t('warBoardSubtitle')}</p>
            </div>
            <Link href="/call" className="shrink-0 text-xs font-medium text-amber-700 hover:underline">
              {t('seeAllCases')} →
            </Link>
          </div>
        </div>

        <div className="relative max-w-7xl mx-auto px-6">
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
              <StaggerItem variant="scale" className="sm:col-span-2" whileHover={{ y: -5 }}>
                <ThesisHighlightCard thesis={featuredThesis} featured t={t} />
              </StaggerItem>
              {secondaryTheses.map((thesis, i) => (
                <StaggerItem
                  key={thesis.id}
                  variant={i % 2 === 0 ? 'left' : 'right'}
                  whileHover={{ y: -5 }}
                >
                  <ThesisHighlightCard thesis={thesis} t={t} />
                </StaggerItem>
              ))}
            </StaggerContainer>
          )}
        </div>
      </div>

      {/* ── Latest Evidence ──────────────────────────────────────────────── */}
      <div className="relative bg-white py-16 overflow-hidden">
        <ParallaxLayer speed={0.35} className="opacity-[0.35]">
          <DossierTexture />
        </ParallaxLayer>
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="flex items-end justify-between mb-8 gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{t('latestEvidenceTitle')}</h2>
              <p className="text-sm text-slate-500 mt-1 max-w-xl">{t('latestEvidenceSubtitle')}</p>
            </div>
            <Link href="/vault" className="shrink-0 text-xs font-medium text-amber-700 hover:underline">
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
              {evidence.map((ev, i) => (
                <StaggerItem
                  key={ev.evidenceId}
                  variant={i % 2 === 0 ? 'left' : 'right'}
                  whileHover={{ y: -5 }}
                >
                  <EvidenceHighlightCard evidence={ev} t={t} />
                </StaggerItem>
              ))}
            </StaggerContainer>
          )}
        </div>
      </div>

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
      <ScrollReveal className="py-16 border-t border-slate-200 overflow-x-hidden">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-8">
            {t('getInvolvedHeading')}
          </h2>
          <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Whistleblower door */}
            <StaggerItem variant="left" whileHover={{ y: -5 }}>
              <div className="h-full bg-slate-900 rounded-2xl p-8 text-white flex flex-col gap-4">
                <Image
                  src="/icon_submit.png"
                  alt=""
                  width={64}
                  height={64}
                  className="w-14 h-14 drop-shadow-[0_6px_10px_rgba(0,0,0,0.35)]"
                />
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
            <StaggerItem variant="right" whileHover={{ y: -5 }}>
              <div className="h-full bg-white border-2 border-slate-200 rounded-2xl p-8 flex flex-col gap-4">
                <Image
                  src="/icon_research.png"
                  alt=""
                  width={64}
                  height={64}
                  className="w-14 h-14 drop-shadow-[0_6px_10px_rgba(15,23,42,0.15)]"
                />
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
