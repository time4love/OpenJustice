'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAppEnv } from '@/lib/appEnv';
import {
  STAGING_ACCESS_COOKIE,
  STAGING_ACCESS_MAX_AGE_SECONDS,
  deriveAccessToken,
  isCorrectSecret,
} from '@/lib/stagingAccess';

export type UnlockError = 'missing' | 'incorrect' | 'unconfigured';
export type UnlockState = { error: UnlockError } | null;

export async function unlockAction(
  _previous: UnlockState,
  formData: FormData,
): Promise<UnlockState> {
  // Production has no gate, so it has nothing to unlock. Re-check here rather
  // than trusting the page: a server action is reachable independently of it.
  if (getAppEnv() === 'production') return { error: 'unconfigured' };

  const secret = process.env.STAGING_ACCESS_SECRET;
  if (!secret) return { error: 'unconfigured' };

  const submitted = formData.get('password');
  if (typeof submitted !== 'string' || submitted.length === 0) return { error: 'missing' };
  if (!isCorrectSecret(submitted, secret)) return { error: 'incorrect' };

  const store = await cookies();
  store.set({
    name: STAGING_ACCESS_COOKIE,
    value: deriveAccessToken(secret),
    httpOnly: true,
    sameSite: 'lax',
    // `next start` sets NODE_ENV=production, so every deployed environment gets
    // a Secure cookie while `next dev` over http://localhost still works.
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: STAGING_ACCESS_MAX_AGE_SECONDS,
  });

  redirect('/');
}
