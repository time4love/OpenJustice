'use client';

import { useState, FormEvent } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link, useRouter, usePathname } from '@/i18n/navigation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Category =
  | 'Side Effect Withholding'
  | 'Regulatory Misleading'
  | 'Coercion'
  | 'Other';

const CATEGORIES: Category[] = [
  'Side Effect Withholding',
  'Regulatory Misleading',
  'Coercion',
  'Other',
];

interface ArgumentResult {
  title: string;
  legalTheory: string;
  draftedText: string;
  citedHashes: string[];
}

interface ArgumentError {
  error: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatHash(hash: string): string {
  if (hash.length <= 18) return hash;
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

// ---------------------------------------------------------------------------
// Language switcher
// ---------------------------------------------------------------------------

function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function switchLocale(next: string) {
    router.replace(pathname, { locale: next });
  }

  return (
    <div className="flex items-center gap-1 text-xs font-mono">
      {(['he', 'en'] as const).map((l) => (
        <button
          key={l}
          onClick={() => switchLocale(l)}
          className={`px-2 py-1 rounded transition-colors ${
            locale === l
              ? 'bg-slate-200 text-slate-800'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LegalPaper({
  result,
  t,
}: {
  result: ArgumentResult;
  t: ReturnType<typeof useTranslations<'caseBuilder.paper'>>;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
      {/* Paper header */}
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
        <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">
          {t('generatedLabel')}
        </p>
        <h2 className="text-base font-semibold text-slate-900 leading-snug">{result.title}</h2>
      </div>

      <div className="p-6 space-y-6">
        {/* Legal theory */}
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">{t('theoryLabel')}</p>
          <p
            style={{ borderInlineStartColor: 'var(--color-slate-300)' }}
            className="text-sm text-slate-600 italic leading-relaxed border-s-2 ps-4"
          >
            {result.legalTheory}
          </p>
        </div>

        {/* Drafted text */}
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-3">
            {t('argumentLabel')}
          </p>
          <div className="text-sm text-slate-800 leading-loose whitespace-pre-wrap font-serif">
            {result.draftedText}
          </div>
        </div>

        {/* Citations */}
        {result.citedHashes.length > 0 && (
          <div className="border-t border-slate-100 pt-5">
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-3">
              {t('citedLabel')} ({t('citations', { count: result.citedHashes.length })})
            </p>
            <ul className="space-y-1.5">
              {result.citedHashes.map((hash, i) => (
                <li key={hash} className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 w-5 text-end shrink-0">[{i + 1}]</span>
                  <span
                    className="font-mono text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5"
                    title={hash}
                  >
                    {formatHash(hash)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-8 py-24 border border-dashed border-slate-200 rounded-lg bg-white shadow-sm">
      <div className="text-3xl mb-4 text-slate-300">⚖</div>
      <p className="text-sm text-slate-400 max-w-xs leading-relaxed">{text}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden animate-pulse shadow-sm">
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 space-y-2">
        <div className="h-2 bg-slate-200 rounded w-32" />
        <div className="h-4 bg-slate-200 rounded w-3/4" />
      </div>
      <div className="p-6 space-y-6">
        <div className="space-y-2">
          <div className="h-2 bg-slate-100 rounded w-24" />
          <div className="h-12 bg-slate-100 rounded" />
        </div>
        <div className="space-y-2">
          <div className="h-2 bg-slate-100 rounded w-20" />
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-3 bg-slate-100 rounded" style={{ width: `${100 - i * 5}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CaseBuilderPage() {
  const t = useTranslations('caseBuilder');
  const tc = useTranslations('common');

  const [category, setCategory] = useState<Category>('Side Effect Withholding');
  const [targetEntity, setTargetEntity] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ArgumentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch('/api/arguments/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, targetEntity }),
      });

      if (!res.ok) {
        const data = (await res.json()) as ArgumentError;
        setError(data.message ?? `Request failed with status ${res.status}`);
        return;
      }

      const data = (await res.json()) as ArgumentResult;
      setResult(data);
    } catch {
      setError('Could not reach the backend. Is the server running?');
    } finally {
      setLoading(false);
    }
  }

  const tPaper = useTranslations('caseBuilder.paper');

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-slate-400 text-lg">⬡</span>
            <div>
              <span className="font-mono text-sm font-semibold tracking-widest text-slate-900 uppercase">
                {tc('appName')}
              </span>
              <span className="ms-3 text-xs text-slate-400 tracking-wide hidden sm:inline">
                {t('tagline')}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {tc('operational')}
            </span>
            <nav className="flex items-center gap-1">
              <Link
                href="/"
                className="px-3 py-1.5 rounded text-xs font-medium text-slate-600 border border-transparent hover:bg-slate-100 hover:text-slate-900 hover:border-slate-200 transition-colors"
              >
                {tc('nav.evidenceVault')}
              </Link>
              <Link
                href="/timeline"
                className="px-3 py-1.5 rounded text-xs font-medium text-slate-600 border border-transparent hover:bg-slate-100 hover:text-slate-900 hover:border-slate-200 transition-colors"
              >
                {tc('nav.timeline')}
              </Link>
              <span className="px-3 py-1.5 rounded text-xs font-medium bg-slate-900 text-white border border-slate-700">
                {tc('nav.caseBuilder')}
              </span>
            </nav>
            <LocaleSwitcher />
          </div>
        </div>
      </header>

      {/* Two-pane layout */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="lg:grid lg:grid-cols-[360px_1fr] lg:gap-8 space-y-6 lg:space-y-0">

          {/* Control Panel */}
          <aside className="space-y-6">
            <div>
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
                {t('params.title')}
              </h2>
              <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Category selector */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-600 uppercase tracking-widest">
                      {t('params.categoryLabel')}
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as Category)}
                      className="w-full bg-white border border-slate-300 rounded px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-300/50 appearance-none shadow-sm"
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Target entity input */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-600 uppercase tracking-widest">
                      {t('params.entityLabel')}
                    </label>
                    <input
                      type="text"
                      required
                      value={targetEntity}
                      onChange={(e) => setTargetEntity(e.target.value)}
                      placeholder={t('params.entityPlaceholder')}
                      className="w-full bg-white border border-slate-300 rounded px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-300/50 font-mono shadow-sm"
                    />
                    <p className="text-xs text-slate-400">{t('params.entityHint')}</p>
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={loading || !targetEntity.trim()}
                    className="w-full py-2.5 rounded text-sm font-semibold bg-blue-600 text-white border border-blue-700 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-3 h-3 rounded-full border-2 border-white/60 border-t-white animate-spin" />
                        {t('params.draftingBtn')}
                      </span>
                    ) : (
                      t('params.draftBtn')
                    )}
                  </button>
                </form>
              </div>
            </div>

            {/* Info box */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                {t('howItWorks.title')}
              </p>
              <ul className="space-y-1.5 text-xs text-slate-500 leading-relaxed">
                <li>{t('howItWorks.step1')}</li>
                <li>{t('howItWorks.step2')}</li>
                <li>{t('howItWorks.step3')}</li>
              </ul>
            </div>
          </aside>

          {/* Legal Paper View */}
          <section>
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                {tPaper('title')}
              </h2>
              {result && (
                <span className="text-xs font-mono text-slate-400">
                  {tPaper('citations', { count: result.citedHashes.length })}
                </span>
              )}
            </div>

            {loading && <LoadingSkeleton />}

            {!loading && error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-5 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-sm font-medium text-red-700">{t('error.title')}</span>
                </div>
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {!loading && !error && !result && <EmptyState text={t('empty.text')} />}

            {!loading && !error && result && <LegalPaper result={result} t={tPaper} />}
          </section>
        </div>
      </div>
    </main>
  );
}
