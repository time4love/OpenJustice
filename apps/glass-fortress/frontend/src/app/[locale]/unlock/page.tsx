import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getAppEnv } from '@/lib/appEnv';
import { UnlockForm } from './UnlockForm';

// The gate depends on runtime environment variables, so this page must never be
// prerendered into the build output.
export const dynamic = 'force-dynamic';

export default async function UnlockPage() {
  // Production is not gated, so the page does not exist there.
  if (getAppEnv() === 'production') notFound();

  const t = await getTranslations('unlock');

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-xl border border-slate-200 shadow-sm p-8 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{t('title')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
        </div>

        <UnlockForm />

        <p className="text-xs text-slate-400 leading-relaxed">{t('note')}</p>
      </div>
    </div>
  );
}
