import type { ReactNode } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { TopNav, type NavPage } from './TopNav';

export function SiteHeader({
  current,
  maxWidth = 'max-w-7xl',
  tagline,
  showOperational = false,
  actions,
}: {
  current: NavPage;
  maxWidth?: string;
  tagline?: string;
  showOperational?: boolean;
  actions?: ReactNode;
}) {
  const tc = useTranslations('common');

  return (
    <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
      <div className={`${maxWidth} mx-auto px-4 sm:px-6 h-14 flex items-center justify-between`}>
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <Image src="/icon_dove.png" alt="" width={24} height={24} className="w-5 h-5" />
          {tagline ? (
            <div>
              <span className="font-mono text-sm font-semibold tracking-widest text-slate-900 uppercase">
                {tc('appName')}
              </span>
              <span className="ms-3 text-xs text-slate-400 tracking-wide hidden sm:inline">
                {tagline}
              </span>
            </div>
          ) : (
            <span className="font-mono text-sm font-semibold tracking-widest text-slate-900 uppercase">
              {tc('appName')}
            </span>
          )}
        </Link>
        <div className="flex items-center gap-4">
          {showOperational && (
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {tc('operational')}
            </span>
          )}
          {/* actions before TopNav so the hamburger button always lands at the
              true outer edge on mobile — with actions after it, a wide
              actions block (e.g. multiple page buttons) stranded the
              hamburger in the middle of the bar instead of the edge. */}
          {actions}
          <TopNav current={current} />
        </div>
      </div>
    </header>
  );
}
