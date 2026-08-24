'use client';

import React from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import tederDove from '../../public/teder-dove.png';
import { LightParticlesCanvas } from '@/components/LightParticlesCanvas';

// ---------------------------------------------------------------------------
// The frame for every page in the sign-in and connector flows.
//
// These pages are reached from outside the site — a magic link, a Google
// return, or Claude's connector settings — so they carry no site header and
// arrive with no context. A bare white box on a grey field could belong to
// anyone. The dove is the only thing on them that says whose sign-in this is.
//
// Shared rather than copied into each page: the four surfaces (login, the auth
// callback, and the two OAuth interaction states) already drifted apart once,
// which is how one of them ended up showing internal terminology to users.
//
// Dark, like the home page hero, because it carries the same rising-lights
// animation — that palette is warm light on near-black and would simply be
// invisible over the pale grey these pages used to use.
// ---------------------------------------------------------------------------

export function AuthShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('common');

  return (
    <div className="relative overflow-hidden min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 gap-5">
      <LightParticlesCanvas />
      {/* Static import, so Next serves an optimised variant of the source
          artwork rather than the 770 KB original. */}
      <Image
        src={tederDove}
        alt={t('appName')}
        priority
        sizes="128px"
        className="relative z-10 w-24 h-24 sm:w-32 sm:h-32 object-contain"
      />
      <div className="relative z-10 w-full flex justify-center">{children}</div>
    </div>
  );
}

/** The white box these flows put their content in. */
export function AuthCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <AuthShell>
      <div className="w-full max-w-sm bg-white rounded-xl border border-slate-200 shadow-sm p-8 space-y-4">
        {title && <h1 className="text-xl font-semibold text-slate-900">{title}</h1>}
        {children}
      </div>
    </AuthShell>
  );
}

/** A line of status with no box — "signing you in", "connecting". */
export function AuthMessage({ text, spinner }: { text: string; spinner?: boolean }) {
  return (
    <AuthShell>
      <div className="flex flex-col items-center gap-3">
        {spinner && (
          <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
        )}
        {/* Light on dark now — slate-500 on the old pale background became
            unreadable the moment this page went dark. */}
        <p className="text-sm text-slate-300">{text}</p>
      </div>
    </AuthShell>
  );
}
