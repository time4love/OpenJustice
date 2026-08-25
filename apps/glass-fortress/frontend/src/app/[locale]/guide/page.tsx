'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { GuideStatusBadge } from '@/components/GuideStatusBadge';
import {
  GUIDE_ARC_ACCENT,
  GUIDE_PHASES,
  guideMaturity,
  guideStatus,
  type GuideArc,
  type GuidePhase,
} from '@/lib/guide';

const ARC_ORDER: readonly GuideArc[] = ['prepare', 'collect', 'measure', 'argue'];

// ---------------------------------------------------------------------------
// PhaseCard
// ---------------------------------------------------------------------------

function PhaseCard({ phase }: { phase: GuidePhase }) {
  const t = useTranslations('guide');
  const accent = GUIDE_ARC_ACCENT[phase.arc];

  return (
    <Link
      href={`/guide/${phase.slug}`}
      className="group block bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all"
      style={{ borderTopColor: accent, borderTopWidth: 3 }}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <span
          className="font-mono text-[11px] font-bold px-2 py-0.5 rounded"
          style={{ backgroundColor: accent + '18', color: accent }}
        >
          {phase.phase === null ? t('prerequisiteLabel') : t('phaseLabel', { n: phase.phase })}
        </span>
        <GuideStatusBadge status={guideStatus(phase)} />
      </div>
      <h3 className="text-base font-semibold text-slate-900 mb-2 group-hover:text-slate-700 transition-colors">
        {t(`phases.${phase.slug}.title`)}
      </h3>
      <p className="text-sm text-slate-600 leading-relaxed">{t(`phases.${phase.slug}.summary`)}</p>
      {phase.irreversible && (
        <p className="mt-3 text-[11px] font-medium text-rose-600 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          {t('irreversibleLabel')}
        </p>
      )}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function GuideIndexPage() {
  const t = useTranslations('guide');
  const maturity = guideMaturity();

  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader current="guide" />

      {/* Hero */}
      <section className="bg-slate-900 text-white">
        <div className="max-w-4xl mx-auto px-6 py-16 sm:py-20">
          <span className="inline-block text-xs font-mono tracking-widest text-slate-400 uppercase mb-4 border border-slate-700 px-3 py-1 rounded-full">
            {t('badge')}
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold leading-tight mb-4">{t('title')}</h1>
          <p className="text-slate-300 text-base leading-relaxed max-w-2xl">{t('subtitle')}</p>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-6 py-14 space-y-14">
        {/* Maturity — the guide reporting on itself */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-bold text-slate-900">{t('maturityTitle')}</h2>
            <span className="font-mono text-xs text-slate-500">
              {t('maturityCount', { verified: maturity.verified, total: maturity.total })}
            </span>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">{t('maturityBody')}</p>
          <dl className="mt-4 grid sm:grid-cols-2 gap-3">
            <div className="flex items-start gap-2.5">
              <GuideStatusBadge status="draft" />
              <dd className="text-xs text-slate-500 leading-relaxed">{t('statusDraftMeaning')}</dd>
            </div>
            <div className="flex items-start gap-2.5">
              <GuideStatusBadge status="verified" />
              <dd className="text-xs text-slate-500 leading-relaxed">{t('statusVerifiedMeaning')}</dd>
            </div>
          </dl>
        </section>

        {/* Phases, grouped into the three arcs */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-8">
            {t('arcsTitle')}
          </h2>
          <div className="space-y-10">
            {ARC_ORDER.map((arc) => {
              const accent = GUIDE_ARC_ACCENT[arc];
              return (
                <div key={arc}>
                  <div className="flex items-baseline gap-3 mb-4">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: accent }} />
                    <h3 className="text-sm font-bold text-slate-900">{t(`arcs.${arc}.title`)}</h3>
                    <p className="text-xs text-slate-500">{t(`arcs.${arc}.body`)}</p>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {GUIDE_PHASES.filter((p) => p.arc === arc).map((p) => (
                      <PhaseCard key={p.slug} phase={p} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* How the conversation itself is run */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900 mb-3">{t('toolNoteTitle')}</h2>
          <p className="text-sm text-slate-600 leading-relaxed">{t('toolNoteBody')}</p>
        </section>

        {/* Redaction policy, stated on the surface it governs */}
        <section className="border-s-2 border-slate-300 ps-5">
          <h2 className="text-sm font-bold text-slate-900 mb-3">{t('redactionTitle')}</h2>
          <p className="text-sm text-slate-500 leading-relaxed">{t('redactionBody')}</p>
        </section>
      </div>
    </main>
  );
}
