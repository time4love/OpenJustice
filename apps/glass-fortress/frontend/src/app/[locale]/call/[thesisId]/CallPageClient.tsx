'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { apiUrl } from '@/lib/api';
import { FoiaModal, type FoiaModalState } from '@/components/FoiaModal';
import { WhistleblowerModal } from '@/components/WhistleblowerModal';
import { LegalDisclaimer } from '@/components/LegalDisclaimer';
import type { EvidenceGap, CounterArgument, AIAnalysis } from '@/types/thesis';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ThesisMention {
  type: 'KEY_FIGURE' | 'EVIDENCE' | 'TRACKED_URL';
  refId: string;
}

interface HeadVersion {
  id: string;
  status: 'PENDING_AI' | 'COMPLETE';
  aiAnalysis: AIAnalysis | null;
  mentions: ThesisMention[];
}

interface Thesis {
  id: string;
  title: string | null;
  headVersion: HeadVersion | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STRENGTH_STYLES: Record<string, { pill: string; label: string }> = {
  WEAK:      { pill: 'bg-red-100 text-red-700 border-red-200',       label: 'חלש' },
  MODERATE:  { pill: 'bg-amber-100 text-amber-700 border-amber-200', label: 'בינוני' },
  STRONG:    { pill: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'חזק' },
  COMPELLING:{ pill: 'bg-violet-100 text-violet-700 border-violet-200', label: 'משכנע' },
};

const NEXT_STRENGTH: Record<string, string> = {
  WEAK: 'MODERATE', MODERATE: 'STRONG', STRONG: 'COMPELLING', COMPELLING: 'COMPELLING',
};

// ---------------------------------------------------------------------------
// Share button — Web Share API with clipboard fallback
// ---------------------------------------------------------------------------

function ShareBar({ thesisTitle }: { thesisTitle: string }) {
  const t = useTranslations('call');
  const [copied, setCopied] = useState(false);

  const url = typeof window !== 'undefined' ? window.location.href : '';
  const shareText = t('shareMessage', { title: thesisTitle });

  async function share() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: thesisTitle, text: shareText, url });
        return;
      } catch {
        // user cancelled or not supported — fall through to clipboard
      }
    }
    await navigator.clipboard.writeText(`${shareText}\n${url}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const waText = encodeURIComponent(`${shareText}\n${url}`);

  return (
    <div className="flex flex-wrap gap-3 items-center" dir="rtl">
      <button
        onClick={() => void share()}
        className="flex items-center gap-2 px-4 py-2 bg-violet-700 hover:bg-violet-600 text-white text-sm font-semibold rounded-xl transition-colors active:scale-95"
      >
        {copied ? t('copiedBtn') : t('shareBtn')}
      </button>
      <a
        href={`https://wa.me/?text=${waText}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors active:scale-95"
      >
        {t('whatsappBtn')}
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gap card — specific evidence ask with FOIA + Tip CTAs
// ---------------------------------------------------------------------------

function GapCard({
  gap,
  gapIndex,
  thesisId,
  t,
}: {
  gap: EvidenceGap;
  gapIndex: number;
  thesisId: string;
  t: ReturnType<typeof useTranslations<'call'>>;
}) {
  const [foiaModal, setFoiaModal] = useState<FoiaModalState | null>(null);
  const [tipOpen, setTipOpen] = useState(false);
  const [foiaError, setFoiaError] = useState(false);

  async function generateFoia() {
    setFoiaError(false);
    setFoiaModal({ status: 'loading', gapIndex });
    try {
      const res = await fetch(apiUrl(`/api/thesis/${thesisId}/foia-request`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gapIndex }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as {
        letterText: string;
        targetMinistry: string;
        legalBasis: string;
        targetEmail?: string;
        targetAddress?: string;
      };
      setFoiaModal({ status: 'ready', gapIndex, ...data });
    } catch {
      setFoiaError(true);
      setFoiaModal(null);
    }
  }

  return (
    <>
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-4" dir="rtl">
        <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">
          {t('gapAsk')} {gapIndex + 1}
        </p>
        <p className="text-sm text-slate-800 leading-relaxed font-medium">{gap.description}</p>

        {foiaError && (
          <p className="text-xs text-red-600">{t('foiaError')}</p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void generateFoia()}
            disabled={foiaModal?.status === 'loading'}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-100 hover:bg-sky-200 text-sky-800 text-xs font-semibold rounded-lg transition-colors active:scale-95 disabled:opacity-50"
          >
            📄 {foiaModal?.status === 'loading' ? t('foiaGenerating') : t('foiaBtn')}
          </button>
          <button
            onClick={() => setTipOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-100 hover:bg-violet-200 text-violet-800 text-xs font-semibold rounded-lg transition-colors active:scale-95"
          >
            🔒 {t('tipBtn')}
          </button>
        </div>
      </div>

      {foiaModal !== null && (
        <FoiaModal state={foiaModal} onClose={() => setFoiaModal(null)} />
      )}
      {tipOpen && (
        <WhistleblowerModal
          gapIndex={gapIndex}
          gap={gap}
          thesisId={thesisId}
          onClose={() => setTipOpen(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Counter-argument card
// ---------------------------------------------------------------------------

function CounterArgCard({ ca }: { ca: CounterArgument }) {
  const t = useTranslations('call');
  const strengthColors: Record<string, string> = {
    STRONG:   'bg-red-50 border-red-200',
    MODERATE: 'bg-amber-50 border-amber-200',
    WEAK:     'bg-slate-50 border-slate-200',
  };

  return (
    <div className={`border rounded-xl p-4 space-y-2 ${strengthColors[ca.strength] ?? 'bg-slate-50 border-slate-200'}`} dir="rtl">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('theyWillClaim')}</p>
      <p className="text-sm text-slate-800 font-medium leading-snug">{ca.claim}</p>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-2">{t('whatRefutesIt')}</p>
      <p className="text-sm text-red-700 leading-snug">{ca.rebuttal}</p>
      <span className="inline-block text-xs text-slate-400 font-medium mt-1">{t('counterStrength')}: {ca.strength}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function CallPageClient({ thesisId }: { thesisId: string }) {
  const t = useTranslations('call');
  const [thesis, setThesis] = useState<Thesis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(apiUrl(`/api/thesis/${thesisId}`))
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data: { thesis: Thesis }) => setThesis(data.thesis))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [thesisId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin text-4xl">⏳</div>
      </div>
    );
  }

  if (error || !thesis?.headVersion) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500 text-sm">{t('loadError')}</p>
      </div>
    );
  }

  const analysis = thesis.headVersion.aiAnalysis;
  const keyFigures = [...new Set(
    thesis.headVersion.mentions
      .filter((m) => m.type === 'KEY_FIGURE')
      .map((m) => m.refId)
  )];
  const evidenceCount = thesis.headVersion.mentions.filter((m) => m.type === 'EVIDENCE').length;
  const strength = analysis?.overallStrengthAssessment ?? 'MODERATE';
  const strengthStyle = STRENGTH_STYLES[strength] ?? STRENGTH_STYLES['MODERATE']!;
  const nextStrength = NEXT_STRENGTH[strength] ?? 'COMPELLING';
  const thesisTitle = thesis.title ?? t('defaultTitle');

  return (
    <div className="min-h-screen bg-slate-950 text-white">

      {/* ------------------------------------------------------------------ */}
      {/* Hero                                                                 */}
      {/* ------------------------------------------------------------------ */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-950 via-slate-950 to-slate-900" />
        <div className="relative max-w-3xl mx-auto px-5 sm:px-8 py-16 sm:py-24 space-y-6" dir="rtl">

          <p className="text-xs font-semibold text-violet-400 uppercase tracking-widest">
            Glass Fortress · {t('heroLabel')}
          </p>

          <h1 className="text-2xl sm:text-3xl font-bold text-white leading-snug">
            {thesisTitle}
          </h1>

          {/* Strength badge + upgrade arrow */}
          <div className="flex flex-wrap items-center gap-3">
            <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${strengthStyle.pill}`}>
              {t('strengthLabel')}: {strengthStyle.label}
            </span>
            {strength !== 'COMPELLING' && (
              <span className="text-xs text-slate-400">
                {t('upgradeHint', { next: nextStrength })}
              </span>
            )}
          </div>

          {/* Stat strip */}
          <div className="flex flex-wrap gap-4 text-xs text-slate-400 pt-1">
            {evidenceCount > 0 && (
              <span>{evidenceCount} {t('statEvidence')}</span>
            )}
            {keyFigures.length > 0 && (
              <span>{keyFigures.length} {t('statFigures')}</span>
            )}
            {analysis?.evidenceGaps && (
              <span>{analysis.evidenceGaps.length} {t('statGaps')}</span>
            )}
          </div>

          <p className="text-base text-slate-300 leading-relaxed max-w-2xl">
            {t('heroSubtitle')}
          </p>

          <ShareBar thesisTitle={thesisTitle} />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 sm:px-8 py-12 space-y-14">

        {/* ---------------------------------------------------------------- */}
        {/* What we already know                                              */}
        {/* ---------------------------------------------------------------- */}
        {analysis?.summaryHe && (
          <section className="space-y-5" dir="rtl">
            <h2 className="text-lg font-bold text-white">{t('whatWeKnowTitle')}</h2>
            <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-5">
              <p className="text-sm text-slate-300 leading-relaxed">{analysis.summaryHe}</p>
            </div>

            {keyFigures.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {keyFigures.map((name) => (
                  <span
                    key={name}
                    className="text-xs px-3 py-1 bg-slate-800 border border-slate-700 rounded-full text-slate-300"
                  >
                    {name}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* What they'll argue — and what refutes each claim                  */}
        {/* ---------------------------------------------------------------- */}
        {analysis && analysis.counterArguments.length > 0 && (
          <section className="space-y-5">
            <div dir="rtl">
              <h2 className="text-lg font-bold text-white">{t('counterClaimsTitle')}</h2>
              <p className="text-xs text-slate-400 mt-1">{t('counterClaimsSubtitle')}</p>
            </div>
            <div className="space-y-3">
              {analysis.counterArguments.map((ca, i) => (
                <CounterArgCard key={i} ca={ca} />
              ))}
            </div>
          </section>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* What's missing — the call to whistleblowers                       */}
        {/* ---------------------------------------------------------------- */}
        {analysis && analysis.evidenceGaps.length > 0 && (
          <section className="space-y-5">
            <div dir="rtl">
              <h2 className="text-lg font-bold text-white">{t('gapsTitle')}</h2>
              <p className="text-sm text-slate-400 mt-1 leading-relaxed">{t('gapsSubtitle')}</p>
            </div>
            <div className="space-y-4">
              {analysis.evidenceGaps.map((gap, i) => (
                <GapCard
                  key={i}
                  gap={gap}
                  gapIndex={i}
                  thesisId={thesisId}
                  t={t}
                />
              ))}
            </div>
          </section>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Privacy & legal protection                                         */}
        {/* ---------------------------------------------------------------- */}
        <section className="space-y-4" dir="rtl">
          <h2 className="text-lg font-bold text-white">{t('privacyTitle')}</h2>
          <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-5 space-y-3">
            <p className="text-sm font-semibold text-emerald-400">🔒 {t('privacyLine1')}</p>
            <p className="text-sm text-slate-300 leading-relaxed">{t('privacyLine2')}</p>
            <p className="text-sm text-slate-300 leading-relaxed">{t('privacyLine3')}</p>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Share again at the bottom                                          */}
        {/* ---------------------------------------------------------------- */}
        <section className="space-y-4 pb-8" dir="rtl">
          <h2 className="text-base font-bold text-white">{t('shareTitle')}</h2>
          <p className="text-sm text-slate-400">{t('shareSubtitle')}</p>
          <ShareBar thesisTitle={thesisTitle} />
        </section>

        {/* Legal disclaimer — compliance requirement */}
        <div className="pb-8">
          <LegalDisclaimer />
        </div>

      </main>
    </div>
  );
}
