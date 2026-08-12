'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter, usePathname } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';

export type NavPage =
  | 'home'
  | 'vault'
  | 'timeline'
  | 'forensics'
  | 'figures'
  | 'theses'
  | 'about'
  | 'researchers'
  | 'call';

type NavLabel =
  | 'nav.home'
  | 'nav.evidenceVault'
  | 'nav.timeline'
  | 'nav.forensics'
  | 'nav.theses'
  | 'nav.calls'
  | 'nav.about';

const ALL_NAV_ITEMS: { key: NavPage; href: string; label: NavLabel }[] = [
  { key: 'home', href: '/', label: 'nav.home' },
  { key: 'theses', href: '/theses', label: 'nav.theses' },
  { key: 'call', href: '/call', label: 'nav.calls' },
  { key: 'vault', href: '/vault', label: 'nav.evidenceVault' },
  { key: 'timeline', href: '/timeline', label: 'nav.timeline' },
  { key: 'forensics', href: '/forensics', label: 'nav.forensics' },
  { key: 'about', href: '/about', label: 'nav.about' },
];

// Desktop omits Home — the logo already links there.
const DESKTOP_NAV_ITEMS = ALL_NAV_ITEMS.filter(({ key }) => key !== 'home');

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

export function TopNav({ current }: { current: NavPage }) {
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { researcher, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

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

  const authNode = !loading && (
    researcher ? (
      <Link
        href="/profile"
        onClick={() => setOpen(false)}
        className="px-2.5 py-1 rounded text-xs font-mono text-slate-500 border border-slate-200 hover:bg-slate-100 hover:text-slate-800 transition-colors"
        title="Profile"
      >
        {researcher.handle}
      </Link>
    ) : (
      <Link
        href="/login"
        onClick={() => setOpen(false)}
        className="px-2.5 py-1 rounded text-xs font-medium text-slate-500 border border-slate-200 hover:bg-slate-100 hover:text-slate-800 transition-colors"
      >
        {tc('nav.login' as Parameters<typeof tc>[0])}
      </Link>
    )
  );

  const drawer = (
    <div
      className={`fixed inset-0 z-[200] transition-opacity duration-300 ease-in-out lg:hidden ${
        open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Panel — slides in from start edge (left in LTR, right in RTL) */}
      <div
        className={`absolute inset-y-0 start-0 w-72 max-w-[82vw] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        {/* Drawer header — logo links home */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-slate-200 shrink-0">
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="font-mono text-sm font-semibold tracking-widest text-slate-900 uppercase hover:text-slate-600 transition-colors"
          >
            {tc('appName' as Parameters<typeof tc>[0])}
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
            aria-label="Close navigation menu"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Nav items — all items including Home */}
        <nav className="flex-1 overflow-y-auto py-3">
          {ALL_NAV_ITEMS.map(({ key, href, label }) => (
            <Link
              key={key}
              href={href}
              onClick={() => setOpen(false)}
              aria-current={key === current ? 'page' : undefined}
              className={`flex items-center mx-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-colors mb-1 ${
                key === current
                  ? 'bg-slate-900 text-white font-semibold'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {tc(label as Parameters<typeof tc>[0])}
            </Link>
          ))}
        </nav>

        {/* Footer: auth + locale switcher */}
        <div className="px-5 py-5 border-t border-slate-200 space-y-4 shrink-0">
          <div>{authNode}</div>
          <a
            href="https://github.com/time4love/OpenJustice"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-700 transition-colors font-mono"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            Open Source · MIT
          </a>
          <div className="flex items-center gap-1.5 text-xs font-mono">
            {(['he', 'en'] as const).map((l) => (
              <button
                key={l}
                onClick={() => { router.replace(pathname, { locale: l }); setOpen(false); }}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  locale === l ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-700'
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* ── Desktop nav (lg+) ──────────────────────────────────────────── */}
      <div className="hidden lg:flex items-center gap-3">
        <nav className="flex items-center gap-1">
          {/* Home excluded — logo already navigates there. All items render
              as <Link> (same element type) to prevent baseline alignment shifts. */}
          {DESKTOP_NAV_ITEMS.map(({ key, href, label }) => (
            <Link
              key={key}
              href={href}
              aria-current={key === current ? 'page' : undefined}
              className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                key === current
                  ? 'bg-slate-900 text-white border-slate-700'
                  : 'text-slate-600 border-transparent hover:bg-slate-100 hover:text-slate-900 hover:border-slate-200'
              }`}
            >
              {tc(label as Parameters<typeof tc>[0])}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {authNode}
          <div className="flex items-center gap-1 text-xs font-mono">
            {(['he', 'en'] as const).map((l) => (
              <button
                key={l}
                onClick={() => router.replace(pathname, { locale: l })}
                className={`px-2 py-1 rounded transition-colors ${
                  locale === l ? 'bg-slate-200 text-slate-800' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Mobile: hamburger button (< lg) ───────────────────────────── */}
      <button
        className="lg:hidden flex items-center justify-center w-10 h-10 -me-1 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={open}
      >
        <HamburgerIcon />
      </button>

      {/* ── Drawer (portaled to body to escape stacking contexts) ─────── */}
      {mounted && createPortal(drawer, document.body)}
    </>
  );
}
