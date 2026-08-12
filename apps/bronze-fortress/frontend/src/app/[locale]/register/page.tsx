'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { signUp, getSession } from '@/lib/auth';

function generatePublicKeyHex(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

type Step = 'form' | 'check-email' | 'creating-vault' | 'done';

export default function RegisterPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('form');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { hasSession, error: authError } = await signUp(email, password);

    if (authError) {
      setError(authError);
      setLoading(false);
      return;
    }

    if (!hasSession) {
      setStep('check-email');
      setLoading(false);
      return;
    }

    const session = getSession();
    if (!session) {
      setError('Session error — please sign in manually');
      setLoading(false);
      return;
    }

    await createCaseVault(session.access_token);
  }

  async function createCaseVault(accessToken: string) {
    setStep('creating-vault');

    const res = await fetch('/api/cases', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ publicKeyHex: generatePublicKeyHex() }),
    });

    if (!res.ok && res.status !== 409) {
      const body = await res.json().catch(() => ({}));
      setError((body as { error?: string }).error ?? 'Failed to create case vault');
      setStep('form');
      setLoading(false);
      return;
    }

    setStep('done');
    router.push('/dashboard');
  }

  if (step === 'check-email') {
    return (
      <div className="max-w-sm mx-auto px-6 py-16 text-center">
        <div className="text-4xl mb-4">✉️</div>
        <h1 className="text-xl font-bold mb-3">{t('checkEmail')}</h1>
        <p className="text-slate-400 text-sm">לאחר האישור, חזור לדף זה להתחברות.</p>
        <Link href="/login" className="text-amber-400 hover:text-amber-300 text-sm mt-4 inline-block">
          {t('signInLink')}
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold mb-2 text-center">{t('registerHeadline')}</h1>
      <p className="text-slate-400 text-sm text-center mb-8">
        הנתונים מוצפנים בצד הלקוח. השרת לא רואה תוכן.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1">{t('emailLabel')}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1">{t('passwordLabel')}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        {step === 'creating-vault' && (
          <p className="text-slate-400 text-sm text-center">יוצר את הכספת...</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold px-6 py-2.5 rounded-lg transition-colors"
        >
          {loading ? '...' : t('signUp')}
        </button>
      </form>

      <p className="text-center text-sm text-slate-400 mt-6">
        {t('signInPrompt')}{' '}
        <Link href="/login" className="text-amber-400 hover:text-amber-300">
          {t('signInLink')}
        </Link>
      </p>
    </div>
  );
}
