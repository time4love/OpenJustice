'use client';

import { useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiUrl } from '@/lib/api';
import { ThesisEditor, type ThesisEditorHandle } from '@/components/ThesisEditor';

export default function NewThesisPage() {
  const t = useTranslations('theses');
  const router = useRouter();

  const editorRef = useRef<ThesisEditorHandle>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!editorRef.current || editorRef.current.isEmpty()) return;

    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(apiUrl('/api/thesis'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userContent: editorRef.current.getJSON() }),
      });

      if (!res.ok) throw new Error(await res.text());

      const data = (await res.json()) as { thesis: { id: string } };
      router.push(`/theses/${data.thesis.id}`);
    } catch {
      setError(t('errorSave'));
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <Link
            href="/theses"
            className="text-slate-600 hover:text-slate-900 text-sm transition-colors"
          >
            ← {t('pageTitle')}
          </Link>
          <span className="text-slate-400 text-xs hidden sm:block">{t('tagline')}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">{t('newThesisHeading')}</h1>

        <p className="text-sm text-slate-500">{t('contentPlaceholder')}</p>

        {/* Editor card */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <ThesisEditor ref={editorRef} />
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-5 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 rounded-lg text-sm font-medium text-white transition-colors"
          >
            {submitting ? t('savingBtn') : t('submitBtn')}
          </button>
        </div>
      </main>
    </div>
  );
}
