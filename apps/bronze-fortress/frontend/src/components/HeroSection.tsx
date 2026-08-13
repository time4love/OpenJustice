'use client';

import Image from 'next/image';
import hebLogo from '../../public/bronze_fortress_heb.png';
import engLogo from '../../public/bronze_fortress_eng.png';
import { useEffect, useRef } from 'react';
import { useLocale } from 'next-intl';
import { HomeCta } from './HomeCta';

interface Props {
  tagline: string;
  headline: string;
  subheadline: string;
}

export function HeroSection({ tagline, headline, subheadline }: Props) {
  const locale = useLocale();
  const logo = locale === 'he' ? hebLogo : engLogo;

  const logoRef = useRef<HTMLDivElement>(null);
  const taglineRef = useRef<HTMLParagraphElement>(null);
  const headlineGroupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId: number;

    const update = () => {
      const y = window.scrollY;

      if (logoRef.current) {
        const scale = Math.max(0.45, 1 - y / 550);
        logoRef.current.style.transform = `scale(${scale})`;
      }

      if (taglineRef.current) {
        taglineRef.current.style.opacity = String(Math.max(0, 1 - y / 120));
      }

      if (headlineGroupRef.current) {
        headlineGroupRef.current.style.transform = `translateY(${-y * 0.28}px)`;
      }
    };

    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(update);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div className="relative flex flex-col items-center justify-center text-center px-6 pt-8 pb-24 min-h-[92svh]">
      {/* Logo — scales down toward top as user scrolls */}
      <div
        ref={logoRef}
        className="mb-4"
        style={{ transformOrigin: 'top center', willChange: 'transform' }}
      >
        <Image
          src={logo}
          alt={locale === 'he' ? 'מבצר הנחושת' : 'Bronze Fortress'}
          width={logo.width}
          height={logo.height}
          style={{ width: 'min(300px, 85vw)', height: 'auto' }}
          priority
        />
      </div>

      {/* Tagline — fades out */}
      <p
        ref={taglineRef}
        className="text-sm text-amber-400/80 mb-10 leading-relaxed"
        style={{ willChange: 'opacity' }}
      >
        {tagline}
      </p>

      {/* Headline group — parallax (moves up slower than scroll) */}
      <div
        ref={headlineGroupRef}
        className="flex flex-col items-center gap-5"
        style={{ willChange: 'transform' }}
      >
        <h1 className="text-5xl font-bold leading-tight">{headline}</h1>
        <p className="text-lg text-slate-300 leading-relaxed max-w-xl">{subheadline}</p>
        <HomeCta />
      </div>

      {/* Scroll hint */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-slate-600 animate-bounce">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path d="M5 9l6 6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}
