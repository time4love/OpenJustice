'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter, usePathname } from '@/i18n/navigation';
import { getSession, signOut, type BFSession } from '@/lib/auth';

function HamburgerIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function NavBar() {
  const t = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<BFSession['user'] | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    setUser(getSession()?.user ?? null);
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'bf_session') setUser(getSession()?.user ?? null);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  async function handleSignOut() {
    await signOut();
    setUser(null);
    setOpen(false);
    router.push('/');
  }

  const drawer = (
    <div
      className={`fixed inset-0 z-[200] transition-opacity duration-300 ease-in-out md:hidden ${
        open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Panel — slides in from start edge (right in RTL, left in LTR) */}
      <div
        className={`absolute inset-y-0 start-0 w-72 max-w-[82vw] bg-slate-950 border-e border-slate-800 shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 h-[4.5rem] border-b border-slate-800 shrink-0">
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="font-bold text-lg tracking-tight text-amber-400"
          >
            {t('appName')}
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 transition-colors"
            aria-label="Close navigation menu"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-3">
          <Link
            href="/patterns"
            onClick={() => setOpen(false)}
            className="flex items-center mx-3 px-4 py-3.5 rounded-xl text-sm font-medium text-slate-200 hover:bg-slate-800 hover:text-white transition-colors mb-1"
          >
            {t('patterns')}
          </Link>
          {user ? (
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="flex items-center mx-3 px-4 py-3.5 rounded-xl text-sm font-medium text-slate-200 hover:bg-slate-800 hover:text-white transition-colors mb-1"
            >
              {t('dashboard')}
            </Link>
          ) : (
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="flex items-center mx-3 px-4 py-3.5 rounded-xl text-sm font-medium text-slate-200 hover:bg-slate-800 hover:text-white transition-colors mb-1"
            >
              כניסה
            </Link>
          )}
        </nav>

        {/* Open source link */}
        <div className="px-5 pb-3 shrink-0">
          <a
            href="https://github.com/time4love/OpenJustice"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-400 transition-colors font-mono"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            Open Source · MIT
          </a>
        </div>

        {/* Footer: locale switcher + primary CTA or sign out */}
        <div className="px-5 py-6 border-t border-slate-800 space-y-4 shrink-0">
          <div className="flex items-center gap-1.5 text-xs font-mono">
            {(['he', 'en'] as const).map((l) => (
              <button
                key={l}
                onClick={() => { router.replace(pathname, { locale: l }); setOpen(false); }}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  locale === l ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          {user ? (
            <button
              onClick={handleSignOut}
              className="w-full flex items-center justify-center px-4 py-3 rounded-xl text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              {t('signOut')}
            </button>
          ) : (
            <Link
              href="/register"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center px-4 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-colors"
            >
              הרשמה
            </Link>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <nav className="border-b border-slate-800 px-4 py-0">
        <div className="max-w-4xl mx-auto flex items-center justify-between h-[4.5rem]">
          <Link href="/" className="font-bold text-lg tracking-tight text-amber-400">
            {t('appName')}
          </Link>

          {/* Desktop nav (md+) */}
          <div className="hidden md:flex items-center gap-6 text-sm">
            <Link href="/patterns" className="text-slate-300 hover:text-white transition-colors">
              {t('patterns')}
            </Link>
            {user ? (
              <>
                <Link href="/dashboard" className="text-slate-300 hover:text-white transition-colors">
                  {t('dashboard')}
                </Link>
                <button
                  onClick={handleSignOut}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  {t('signOut')}
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="text-slate-300 hover:text-white transition-colors">
                  כניסה
                </Link>
                <Link
                  href="/register"
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-4 py-1.5 rounded-lg transition-colors"
                >
                  הרשמה
                </Link>
              </>
            )}
          </div>

          {/* Desktop: locale switcher + GitHub link */}
          <div className="hidden md:flex items-center gap-3 ms-2">
            <div className="flex items-center gap-1 text-xs font-mono">
              {(['he', 'en'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => router.replace(pathname, { locale: l })}
                  className={`px-2 py-1 rounded transition-colors ${
                    locale === l ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            <a
              href="https://github.com/time4love/OpenJustice"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-400 transition-colors font-mono"
              aria-label="View source on GitHub"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              <span className="hidden lg:inline">Open Source</span>
            </a>
          </div>

          {/* Mobile: hamburger button (< md) */}
          <button
            className="md:hidden flex items-center justify-center w-10 h-10 -me-1 rounded-lg text-slate-300 hover:bg-slate-800 transition-colors"
            onClick={() => setOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={open}
          >
            <HamburgerIcon />
          </button>
        </div>
      </nav>

      {/* Drawer (portaled to body to escape stacking contexts) */}
      {mounted && createPortal(drawer, document.body)}
    </>
  );
}
