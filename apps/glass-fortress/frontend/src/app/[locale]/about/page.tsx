'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { TopNav } from '@/components/TopNav';

// ---------------------------------------------------------------------------
// PillarCard
// ---------------------------------------------------------------------------

function PillarCard({
  icon,
  title,
  body,
  accent,
}: {
  icon: string;
  title: string;
  body: React.ReactNode;
  accent: string;
}) {
  return (
    <div
      className="bg-white border border-slate-200 rounded-xl p-7 shadow-sm space-y-4"
      style={{ borderTopColor: accent, borderTopWidth: 3 }}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl" role="img" aria-hidden>
          {icon}
        </span>
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      </div>
      <div className="text-sm text-slate-600 leading-relaxed space-y-3">{body}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TrustBadge
// ---------------------------------------------------------------------------

function TrustBadge({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-4 py-2.5 shadow-sm">
      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
      <span className="text-xs text-slate-700">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AboutPage() {
  const t = useTranslations('about');
  const tc = useTranslations('common');

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-slate-400 text-lg">⬡</span>
            <span className="font-mono text-sm font-semibold tracking-widest text-slate-900 uppercase">
              {tc('appName')}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <TopNav current="about" />
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-16 text-center">
          <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 text-blue-700 text-xs font-medium px-4 py-1.5 rounded-full mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            {t('badge')}
          </div>
          <h1 className="text-4xl font-bold text-slate-900 mb-4 leading-tight">
            {t('hero.title')}
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            {t('hero.subtitle')}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/submit"
              className="px-6 py-3 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition-colors"
            >
              {t('hero.ctaSubmit')}
            </Link>
            <Link
              href="/vault"
              className="px-6 py-3 rounded-lg text-sm font-semibold bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm transition-colors"
            >
              {t('hero.ctaVault')}
            </Link>
          </div>
        </div>
      </section>

      {/* 3 Pillars */}
      <section className="max-w-5xl mx-auto px-6 py-14">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest text-center mb-8">
          {t('pillarsHeading')}
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {/* Mission */}
          <PillarCard
            icon="⚖️"
            title={t('mission.title')}
            accent="#3b82f6"
            body={
              <>
                <p>{t('mission.p1')}</p>
                <p>{t('mission.p2')}</p>
                <div className="pt-1 space-y-1.5">
                  {(['item1', 'item2', 'item3'] as const).map((key) => (
                    <div key={key} className="flex items-start gap-2">
                      <span className="text-red-500 mt-0.5">›</span>
                      <span>{t(`mission.${key}`)}</span>
                    </div>
                  ))}
                </div>
              </>
            }
          />

          {/* Blockchain */}
          <PillarCard
            icon="🔗"
            title={t('blockchain.title')}
            accent="#10b981"
            body={
              <>
                <p>{t('blockchain.p1')}</p>
                <p>{t('blockchain.p2')}</p>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mt-2">
                  <p className="text-xs font-mono text-slate-500 break-all">
                    0x4e07408562bedb8b60ce05c1decfe3ad16589af8...
                  </p>
                  <p className="text-xs text-slate-400 mt-1">{t('blockchain.hashLabel')}</p>
                </div>
                <p className="text-xs text-slate-500">{t('blockchain.footer')}</p>
              </>
            }
          />

          {/* Dark Vault */}
          <PillarCard
            icon="🔒"
            title={t('vault.title')}
            accent="#8b5cf6"
            body={
              <>
                <p>{t('vault.p1')}</p>
                <p>{t('vault.p2')}</p>
                <div className="space-y-1.5 pt-1">
                  {(['item1', 'item2', 'item3'] as const).map((key) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-emerald-500">✓</span>
                      <span>{t(`vault.${key}`)}</span>
                    </div>
                  ))}
                </div>
              </>
            }
          />
        </div>
      </section>

      {/* Trust badges */}
      <section className="border-t border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest text-center mb-6">
            {t('trust.heading')}
          </h2>
          <div className="flex flex-wrap justify-center gap-3">
            {(['badge1', 'badge2', 'badge3', 'badge4', 'badge5'] as const).map((key) => (
              <TrustBadge key={key} label={t(`trust.${key}`)} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-5xl mx-auto px-6 py-14 text-center">
        <h2 className="text-2xl font-bold text-slate-900 mb-3">{t('cta.title')}</h2>
        <p className="text-slate-600 text-sm mb-7 max-w-xl mx-auto">{t('cta.body')}</p>
        <Link
          href="/submit"
          className="inline-block px-8 py-3.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-md transition-colors"
        >
          {t('cta.btn')}
        </Link>
        <p className="mt-5 text-xs text-slate-400">{t('cta.hint')}</p>
      </section>
    </main>
  );
}
