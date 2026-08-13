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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const t = useTranslations('home');

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
    <section className="relative overflow-hidden bg-[#070707] text-white">
      {/* Dove watermark — flying upward */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={tederDoveLogo.src}
        alt=""
        aria-hidden
        className="hero-dove-fly absolute left-1/2 top-1/2 h-[120vh] w-auto pointer-events-none select-none"
      />

      {/* Particle canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* Content */}
      <div className="relative z-10 max-w-4xl mx-auto px-6 py-20 sm:py-28 text-center flex flex-col items-center gap-6">
        <Image
          src={tederDoveLogo}
          alt="יונת צדק לעם"
          width={120}
          height={120}
          className="hero-dove-float w-20 h-20 sm:w-28 sm:h-28 drop-shadow-lg"
          priority
        />

        <div className="space-y-3">
          <h1 className="hero-title-gradient font-[family-name:var(--font-frank-ruhl)] text-6xl sm:text-8xl font-black leading-tight tracking-tight">
            {t('heroTitle')}
          </h1>
          <p className="hero-tag-gradient font-[family-name:var(--font-frank-ruhl)] text-2xl sm:text-3xl font-bold">
            {t('heroTag')}
          </p>
        </div>

        <p className="text-lg sm:text-xl text-slate-200 font-semibold max-w-2xl">
          {t('heroClaim')}
        </p>
        <p className="text-base sm:text-lg text-slate-400 max-w-2xl leading-relaxed">
          {t('heroSubtitle')}
        </p>
      </div>
    </section>
  );
}
