'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { TopNav } from '@/components/TopNav';

// ─── Sub-components ───────────────────────────────────────────────────────────

function PrincipleCard({
  number,
  icon,
  title,
  body1,
  body2,
  items,
  accent,
}: {
  number: string;
  icon: string;
  title: string;
  body1: string;
  body2: string;
  items: string[];
  accent: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-6 py-4 flex items-center gap-3" style={{ backgroundColor: accent + '12', borderBottom: `2px solid ${accent}` }}>
        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: accent + '20', color: accent }}>
          {number}
        </span>
        <span className="text-xl" role="img" aria-hidden>{icon}</span>
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      </div>
      <div className="px-6 py-5 space-y-3">
        <p className="text-sm text-slate-600 leading-relaxed">{body1}</p>
        <p className="text-sm text-slate-500 leading-relaxed italic">{body2}</p>
        <ul className="pt-1 space-y-2">
          {items.map((item, i) => (
            <li key={i} className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: accent + '15' }}>
                <span className="text-xs font-bold" style={{ color: accent }}>✓</span>
              </span>
              <span className="text-xs text-slate-700">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function StorageRow({
  item,
  location,
  who,
  safe,
}: {
  item: string;
  location: string;
  who: string;
  safe: boolean;
}) {
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="py-3 px-4 text-sm text-slate-700 font-medium">{item}</td>
      <td className="py-3 px-4 text-sm text-slate-500">{location}</td>
      <td className="py-3 px-4">
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
            safe ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${safe ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          {who}
        </span>
      </td>
    </tr>
  );
}

function OpsecCard({
  icon,
  title,
  body,
  extra,
}: {
  icon: string;
  title: string;
  body: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex gap-4 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="text-2xl shrink-0 mt-0.5" role="img" aria-hidden>{icon}</div>
      <div className="space-y-1.5 min-w-0">
        <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
        <p className="text-sm text-slate-500 leading-relaxed">{body}</p>
        {extra}
      </div>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <div className="border-b border-slate-100 last:border-0 py-5">
      <p className="text-sm font-semibold text-slate-900 mb-2">{q}</p>
      <p className="text-sm text-slate-500 leading-relaxed">{a}</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SafetyPage() {
  const t = useTranslations('safety');
  const tc = useTranslations('common');

  return (
    <main className="min-h-screen bg-slate-50">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-slate-400 text-lg">⬡</span>
            <span className="font-mono text-sm font-semibold tracking-widest text-slate-900 uppercase">
              {tc('appName')}
            </span>
          </div>
          <TopNav current="safety" />
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="bg-slate-900 text-white">
        <div className="max-w-5xl mx-auto px-6 py-20 text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium px-4 py-1.5 rounded-full mb-7">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {t('badge')}
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-6 max-w-3xl mx-auto">
            {t('hero.title')}
          </h1>

          <p className="text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed mb-10">
            {t('hero.subtitle')}
          </p>

          {/* Tagline chips */}
          <div className="flex flex-wrap justify-center gap-3 mb-10">
            {t('tagline').split(' · ').map((chip, i) => (
              <span key={i} className="flex items-center gap-2 bg-slate-800 border border-slate-700 text-slate-300 text-xs px-4 py-2 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                {chip}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/submit"
              className="px-7 py-3 rounded-xl text-sm font-semibold bg-emerald-500 text-white hover:bg-emerald-400 shadow-lg transition-colors"
            >
              {t('hero.ctaSubmit')}
            </Link>
            <a
              href="#how-it-works"
              className="px-7 py-3 rounded-xl text-sm font-semibold bg-white/10 text-white hover:bg-white/20 border border-white/20 transition-colors"
            >
              {t('hero.ctaLearnMore')}
            </a>
          </div>
        </div>
      </section>

      {/* ── Three Principles ───────────────────────────────────────────── */}
      <section id="how-it-works" className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest text-center mb-10">
          {t('principlesHeading')}
        </h2>

        <div className="grid md:grid-cols-3 gap-6">
          <PrincipleCard
            number="01"
            icon="⚖️"
            title={t('p1.title')}
            body1={t('p1.body1')}
            body2={t('p1.body2')}
            items={[t('p1.item1'), t('p1.item2'), t('p1.item3')]}
            accent="#10b981"
          />
          <PrincipleCard
            number="02"
            icon="💾"
            title={t('p2.title')}
            body1={t('p2.body1')}
            body2={t('p2.body2')}
            items={[t('p2.item1'), t('p2.item2'), t('p2.item3')]}
            accent="#3b82f6"
          />
          <PrincipleCard
            number="03"
            icon="🔗"
            title={t('p3.title')}
            body1={t('p3.body1')}
            body2={t('p3.body2')}
            items={[t('p3.item1'), t('p3.item2'), t('p3.item3')]}
            accent="#8b5cf6"
          />
        </div>
      </section>

      {/* ── Storage Table ──────────────────────────────────────────────── */}
      <section className="bg-white border-y border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-14">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest text-center mb-8">
            {t('storageHeading')}
          </h2>

          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
            <table className="w-full text-start">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 text-start">{t('storageTable.col1')}</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 text-start">{t('storageTable.col2')}</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 text-start">{t('storageTable.col3')}</th>
                </tr>
              </thead>
              <tbody>
                <StorageRow item={t('storageTable.r1c1')} location={t('storageTable.r1c2')} who={t('storageTable.r1c3')} safe />
                <StorageRow item={t('storageTable.r2c1')} location={t('storageTable.r2c2')} who={t('storageTable.r2c3')} safe />
                <StorageRow item={t('storageTable.r3c1')} location={t('storageTable.r3c2')} who={t('storageTable.r3c3')} safe={false} />
                <StorageRow item={t('storageTable.r4c1')} location={t('storageTable.r4c2')} who={t('storageTable.r4c3')} safe={false} />
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Operational Security ───────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-14">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest text-center mb-8">
          {t('opsecHeading')}
        </h2>

        <div className="grid sm:grid-cols-2 gap-4">
          <OpsecCard
            icon="🧅"
            title={t('opsec.tor.title')}
            body={t('opsec.tor.body')}
            extra={
              <a
                href="https://www.torproject.org/download/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-800 transition-colors mt-1"
              >
                {t('opsec.tor.link')}
                <span aria-hidden>↗</span>
              </a>
            }
          />
          <OpsecCard
            icon="💻"
            title={t('opsec.device.title')}
            body={t('opsec.device.body')}
          />
          <OpsecCard
            icon="👤"
            title={t('opsec.account.title')}
            body={t('opsec.account.body')}
          />
          <OpsecCard
            icon="🤫"
            title={t('opsec.silence.title')}
            body={t('opsec.silence.body')}
          />
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────── */}
      <section className="bg-white border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-14">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest text-center mb-8">
            {t('faqHeading')}
          </h2>
          <div className="rounded-xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100 bg-white px-6">
            <FaqItem q={t('faq.q1')} a={t('faq.a1')} />
            <FaqItem q={t('faq.q2')} a={t('faq.a2')} />
            <FaqItem q={t('faq.q3')} a={t('faq.a3')} />
            <FaqItem q={t('faq.q4')} a={t('faq.a4')} />
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────── */}
      <section className="bg-slate-900 text-white">
        <div className="max-w-5xl mx-auto px-6 py-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-6">
            <span className="text-emerald-400 text-xl" role="img" aria-hidden>🔒</span>
          </div>
          <h2 className="text-2xl font-bold mb-3">{t('cta.title')}</h2>
          <p className="text-slate-300 text-sm mb-8 max-w-lg mx-auto leading-relaxed">{t('cta.body')}</p>
          <Link
            href="/submit"
            className="inline-block px-8 py-3.5 rounded-xl text-sm font-semibold bg-emerald-500 text-white hover:bg-emerald-400 shadow-lg transition-colors"
          >
            {t('cta.btn')}
          </Link>
          <p className="mt-5 text-xs text-slate-500">{t('cta.hint')}</p>
        </div>
      </section>

    </main>
  );
}
