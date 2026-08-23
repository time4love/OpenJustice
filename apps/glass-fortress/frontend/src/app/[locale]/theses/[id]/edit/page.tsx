'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiUrl, authHeaders } from '@/lib/api';
import { ThesisEditor, type ThesisEditorHandle } from '@/components/ThesisEditor';
import { useAuth } from '@/context/AuthContext';

export default function EditThesisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('theses');
  const router = useRouter();
  const { researcher } = useAuth();

  const editorRef = useRef<ThesisEditorHandle>(null);
  const [initialContent, setInitialContent] = useState<Record<string, unknown> | undefined>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load current head version content to pre-populate the editor
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(apiUrl(`/api/thesis/${id}`), { headers: authHeaders() });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as {
          thesis: { version: { userContent: Record<string, unknown> } | null };
        };
        setInitialContent(data.thesis.version?.userContent ?? undefined);
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleSubmit() {
    if (!editorRef.current || editorRef.current.isEmpty()) return;

    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch(apiUrl(`/api/thesis/${id}/version`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userContent: editorRef.current.getJSON() }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push(`/theses/${id}`);
    } catch {
      setSubmitError(t('errorSave'));
      setSubmitting(false);
    }
  }

  if (!researcher?.approved) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-slate-500">{t('researcherOnlyNotice')}</p>
        <Link href="/researchers" className="text-sm font-medium text-violet-700 hover:underline">
          {t('researcherOnlyCta')} →
        </Link>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-red-600">{t('errorEvaluate')}</p>
          <Link href={`/theses/${id}`} className="text-slate-600 hover:text-slate-900 text-sm transition-colors">
            ← {t('pageTitle')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <Link
            href={`/theses/${id}`}
            className="text-slate-600 hover:text-slate-900 text-sm transition-colors"
          >
            ← {t('pageTitle')}
          </Link>
          <span className="text-slate-400 text-xs hidden sm:block">{t('tagline')}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">{t('editBtn')}</h1>

        <p className="text-sm text-slate-500">{t('editHint')}</p>

        {/* Editor — only mount once initialContent is resolved to avoid a flash */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="px-4 py-10 text-center text-slate-400 text-sm">{t('savingBtn')}</div>
          ) : (
            <ThesisEditor ref={editorRef} initialContent={initialContent} />
          )}
        </div>

        {submitError && <p className="text-red-600 text-sm">{submitError}</p>}

        <div className="flex items-center gap-3">
          <button
            onClick={handleSubmit}
            disabled={submitting || loading}
            className="px-5 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 rounded-lg text-sm font-medium text-white transition-colors"
          >
            {submitting ? t('savingBtn') : t('submitBtn')}
          </button>
          <Link
            href={`/theses/${id}`}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-medium text-slate-700 transition-colors"
          >
            {t('cancelBtn')}
          </Link>
        </div>
      </main>
    </div>
  );
}
