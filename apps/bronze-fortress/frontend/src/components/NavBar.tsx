'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

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
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
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
    const supabase = createClient();
    await supabase.auth.signOut();
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
            <>
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="flex items-center mx-3 px-4 py-3.5 rounded-xl text-sm font-medium text-slate-200 hover:bg-slate-800 hover:text-white transition-colors mb-1"
              >
                {t('dashboard')}
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="flex items-center mx-3 px-4 py-3.5 rounded-xl text-sm font-medium text-slate-200 hover:bg-slate-800 hover:text-white transition-colors mb-1"
              >
                כניסה
              </Link>
            </>
          )}
        </nav>

        {/* Footer: primary CTA or sign out */}
        <div className="px-5 py-6 border-t border-slate-800 shrink-0">
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

          {/* Desktop nav (md+) — unchanged */}
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
