'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import tederDoveLogo from '../../public/teder-dove.png';

const PALETTE = [
  { r: 245, g: 240, b: 232 },
  { r: 245, g: 240, b: 232 },
  { r: 245, g: 240, b: 232 },
  { r: 245, g: 240, b: 232 },
  { r: 235, g: 165, b: 44  },
  { r: 200, g: 42,  b: 28  },
] as const;

const PARTICLE_COUNT = 90;

interface Particle {
  x: number; y: number; r: number;
  vy: number; vx: number; op: number;
  c: typeof PALETTE[number];
}

function makeParticle(W: number, H: number, scatter: boolean): Particle {
  const c = PALETTE[Math.floor(Math.random() * PALETTE.length)];
  return {
    x:  Math.random() * W,
    y:  scatter ? Math.random() * H : H + 8 + Math.random() * 60,
    r:  0.6 + Math.random() * 1.7,
    vy: 0.20 + Math.random() * 0.42,
    vx: (Math.random() - 0.5) * 0.10,
    op: 0.06 + Math.random() * 0.28,
    c,
  };
}

export function HeroSection() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0, H = 0, dpr = 1;
    const particles: Particle[] = [];
    let rafId: number;

    function resize() {
      dpr = window.devicePixelRatio || 1;
      const rect = canvas!.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      canvas!.width  = W * dpr;
      canvas!.height = H * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function loop() {
      ctx!.clearRect(0, 0, W, H);

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p = particles[i];
        p.y -= p.vy;
        p.x += p.vx;
        p.vx += (Math.random() - 0.5) * 0.022;
        if (p.vx >  0.28) p.vx =  0.28;
        if (p.vx < -0.28) p.vx = -0.28;

        const ratio = Math.max(0, Math.min(1, (H - p.y) / H));
        const alpha = p.op * Math.sin(ratio * Math.PI);

        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(${p.c.r},${p.c.g},${p.c.b},${alpha.toFixed(3)})`;
        ctx!.fill();

        if (p.y < -20 || p.x < -30 || p.x > W + 30) {
          particles[i] = makeParticle(W, H, false);
        }
      }

      rafId = requestAnimationFrame(loop);
    }

    resize();
    for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(makeParticle(W, H, true));
    rafId = requestAnimationFrame(loop);

    const onResize = () => {
      resize();
      particles.forEach((p, i) => {
        if (p.x > W) particles[i] = makeParticle(W, H, true);
      });
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <section className="relative overflow-hidden bg-slate-900 text-white">
      {/* Particle canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

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
