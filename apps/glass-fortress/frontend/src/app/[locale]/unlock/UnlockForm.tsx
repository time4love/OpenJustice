'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { unlockAction, type UnlockError, type UnlockState } from './actions';

const ERROR_KEY: Record<UnlockError, 'errorMissing' | 'errorIncorrect' | 'errorUnconfigured'> = {
  missing: 'errorMissing',
  incorrect: 'errorIncorrect',
  unconfigured: 'errorUnconfigured',
};

export function UnlockForm() {
  const t = useTranslations('unlock');
  const [state, formAction, pending] = useActionState<UnlockState, FormData>(unlockAction, null);

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
          {t('passwordLabel')}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          dir="ltr"
          className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
      </div>
      {state && <p className="text-sm text-red-600">{t(ERROR_KEY[state.error])}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full py-2 px-4 bg-slate-900 text-white text-sm font-medium rounded hover:bg-slate-700 disabled:opacity-50 transition-colors"
      >
        {pending ? t('submitting') : t('submit')}
      </button>
    </form>
  );
}
