'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import tederDoveLogo from '../../public/teder-dove.png';
import { LightParticlesCanvas } from '@/components/LightParticlesCanvas';

export function HeroSection() {
  const doveRef    = useRef<HTMLDivElement>(null);
  const textRef    = useRef<HTMLDivElement>(null);
  const t = useTranslations('home');

  // Parallax: dove rises slower, text rises faster
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const dove = doveRef.current;
    const text = textRef.current;
    if (!dove || !text) return;

    function onScroll() {
      const y = window.scrollY;
      dove!.style.transform = `translateY(${y * 0.45}px)`;   // held back — rises slower
      text!.style.transform  = `translateY(${y * -0.15}px)`;  // pushed forward — rises faster
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <section className="relative overflow-hidden bg-slate-900 text-white">
      <LightParticlesCanvas />

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-20 sm:py-28 text-center space-y-6">
        {/* Dove — rises slower on scroll */}
        <div ref={doveRef} className="flex justify-center will-change-transform">
          <Image src={tederDoveLogo} alt="תדר ישראל" width={260} height={260} priority />
        </div>

        {/* Text — rises faster on scroll */}
        <div ref={textRef} className="space-y-6 will-change-transform">
          <div className="space-y-2">
            <h1 className="text-6xl sm:text-7xl font-bold leading-tight tracking-tight">
              {t('heroTitle')}
            </h1>
            <p className="text-xl sm:text-2xl text-slate-300 font-medium">
              {t('heroTag')}
            </p>
          </div>
          <p className="text-lg sm:text-xl text-slate-200 font-semibold">
            {t('heroClaim')}
          </p>
          <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            {t('heroSubtitle')}
          </p>
        </div>
      </div>
    </section>
  );
}
