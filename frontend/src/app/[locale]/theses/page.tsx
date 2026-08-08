'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link, useRouter, usePathname } from '@/i18n/navigation';
import { apiUrl } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ThesisSummary {
  id: string;
  title: string;
  authorAddress: string;
  publishedAt: string | null;
  createdAt: string;
  taggedFigures: { id: string; name: string }[];
  evidenceCount: number;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ThesesPage() {
  const t = useTranslations('theses');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const [theses, setTheses] = useState<ThesisSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(apiUrl('/api/thesis'));
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { theses: ThesisSummary[] };
        setTheses(data.theses);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function switchLocale(next: string) {
    router.replace(pathname, { locale: next });
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <Link href="/" className="text-slate-400 hover:text-white text-sm font-medium transition-colors">
            {tc('appName')}
          </Link>
          <span className="text-slate-700">·</span>
          <span className="text-white text-sm font-medium">{t('pageTitle')}</span>

          <div className="ms-auto flex items-center gap-4">
            <nav className="hidden sm:flex items-center gap-4 text-sm">
              <Link href="/timeline" className="text-slate-400 hover:text-white transition-colors">
                {tc('nav.timeline')}
              </Link>
              <Link href="/forensics" className="text-slate-400 hover:text-white transition-colors">
                {tc('nav.forensics')}
              </Link>
              <Link href="/figures" className="text-slate-400 hover:text-white transition-colors">
                {tc('nav.figures')}
              </Link>
            </nav>
            <div className="flex items-center gap-1 text-xs">
              <button
                onClick={() => switchLocale('he')}
                className={`px-2 py-0.5 rounded ${locale === 'he' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-white'}`}
              >
                HE
              </button>
              <button
                onClick={() => switchLocale('en')}
                className={`px-2 py-0.5 rounded ${locale === 'en' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-white'}`}
              >
                EN
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        {/* Title row */}
        <div className="flex items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{t('pageTitle')}</h1>
            <p className="text-slate-500 text-sm mt-1">{t('tagline')}</p>
          </div>
          <Link
            href="/theses/new"
            className="shrink-0 px-4 py-2 bg-violet-700 hover:bg-violet-600 rounded-lg text-sm font-medium text-white transition-colors"
          >
            + {t('newThesisHeading')}
          </Link>
        </div>

        {/* States */}
        {loading && (
          <div className="text-slate-500 text-sm">{t('savingBtn')}</div>
        )}

        {error && (
          <div className="text-red-400 text-sm">{t('errorSave')}</div>
        )}

        {!loading && !error && theses.length === 0 && (
          <div className="text-center py-24 space-y-3">
            <p className="text-slate-400 text-lg">{t('noSurvivingClaims')}</p>
            <Link
              href="/theses/new"
              className="inline-block px-4 py-2 bg-violet-700 hover:bg-violet-600 rounded-lg text-sm font-medium text-white transition-colors"
            >
              {t('newThesisHeading')}
            </Link>
          </div>
        )}

        {/* Theses list */}
        {theses.length > 0 && (
          <div className="space-y-4">
            {theses.map(thesis => (
              <Link
                key={thesis.id}
                href={`/theses/${thesis.id}`}
                className="block bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-2xl p-5 transition-colors group"
              >
                <h2 className="text-lg font-semibold text-white group-hover:text-violet-300 transition-colors">
                  {thesis.title}
                </h2>

                <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-slate-500">
                  {thesis.authorAddress && (
                    <span className="font-mono truncate max-w-[12rem]">{thesis.authorAddress}</span>
                  )}
                  {thesis.publishedAt && (
                    <span>
                      {new Date(thesis.publishedAt).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US')}
                    </span>
                  )}
                  <span className="text-slate-600">·</span>
                  <span>{t('evidenceSuggestion')}: {thesis.evidenceCount}</span>
                  {thesis.taggedFigures.length > 0 && (
                    <>
                      <span className="text-slate-600">·</span>
                      <span className="flex gap-1 flex-wrap">
                        {thesis.taggedFigures.slice(0, 3).map(f => (
                          <span
                            key={f.id}
                            className="bg-violet-900/50 text-violet-300 px-2 py-0.5 rounded-full"
                          >
                            @{f.name}
                          </span>
                        ))}
                        {thesis.taggedFigures.length > 3 && (
                          <span className="text-slate-500">+{thesis.taggedFigures.length - 3}</span>
                        )}
                      </span>
                    </>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
