'use client';

import Image from 'next/image';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { TopNav } from '@/components/TopNav';
import { useState, useCallback } from 'react';

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
        <Image src={icon} alt="" width={24} height={24} className="w-6 h-6" />
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

function CopyUrlButton({ label, copiedLabel, path }: { label: string; copiedLabel: string; path: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    const url = window.location.origin + path;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [path]);
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
    >
      {copied ? copiedLabel : label}
    </button>
  );
}

function StepItem({
  num,
  title,
  body,
  children,
  isLast = false,
}: {
  num: string;
  title: string;
  body: string;
  children?: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <div className="flex gap-5">
      <div className="flex flex-col items-center shrink-0">
        <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center text-base font-bold">
          {num}
        </div>
        {!isLast && <div className="w-0.5 bg-slate-200 flex-1 mt-2" style={{ minHeight: '3rem' }} />}
      </div>
      <div className={`min-w-0 flex-1 ${isLast ? '' : 'pb-8'}`}>
        <h3 className="text-base font-bold text-slate-900 mb-1.5">{title}</h3>
        <p className="text-sm text-slate-500 leading-relaxed">{body}</p>
        {children && <div className="mt-3">{children}</div>}
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
  const locale = useLocale();

  return (
    <main className="min-h-screen bg-slate-50">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <Image src="/icon_dove.png" alt="" width={24} height={24} className="w-5 h-5" />
            <span className="font-mono text-sm font-semibold tracking-widest text-slate-900 uppercase">
              {tc('appName')}
            </span>
          </Link>
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
            icon="/icon_case.png"
            title={t('p1.title')}
            body1={t('p1.body1')}
            body2={t('p1.body2')}
            items={[t('p1.item1'), t('p1.item2'), t('p1.item3')]}
            accent="#10b981"
          />
          <PrincipleCard
            number="02"
            icon="/icon_ephemeral.png"
            title={t('p2.title')}
            body1={t('p2.body1')}
            body2={t('p2.body2')}
            items={[t('p2.item1'), t('p2.item2'), t('p2.item3')]}
            accent="#3b82f6"
          />
          <PrincipleCard
            number="03"
            icon="/icon_blockchain.png"
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

      {/* ── Step-by-step guide ─────────────────────────────────────────── */}
      <section className="max-w-2xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
            {t('stepsHeading')}
          </h2>
          <p className="text-slate-500 text-sm leading-relaxed">{t('stepsSubheading')}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm px-8 pt-8 pb-6">
          <StepItem num="1" title={t('steps.s1.title')} body={t('steps.s1.body')}>
            <a
              href="https://www.torproject.org/download/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 transition-colors shadow-sm"
            >
              {t('steps.s1.cta')} ↗
            </a>
          </StepItem>

          <StepItem num="2" title={t('steps.s2.title')} body={t('steps.s2.body')} />

          <StepItem num="3" title={t('steps.s3.title')} body={t('steps.s3.body')}>
            <CopyUrlButton label={t('steps.s3.cta')} copiedLabel={t('steps.s3.copied')} path={`/${locale}/submit`} />
          </StepItem>

          <StepItem num="4" title={t('steps.s4.title')} body={t('steps.s4.body')} isLast>
            <Link
              href="/submit"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-emerald-500 text-white hover:bg-emerald-400 transition-colors shadow-sm"
            >
              {t('steps.s4.cta')}
            </Link>
          </StepItem>
        </div>

        <p className="text-xs text-slate-400 text-center mt-5 leading-relaxed">
          {t('stepsNote')}
        </p>
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
            <Image src="/icon_vault.png" alt="" width={28} height={28} className="w-7 h-7" />
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
