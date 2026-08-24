'use client';

import { useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// The rising lights.
//
// Several independent masses of particles gather from below, merge, float up
// and dissolve at the top border — and the instant one is absorbed, a gold ray
// pours down from exactly where it vanished:
//
//   "אמת מארץ תצמח וצדק משמים נשקף"
//
// Truth springs from the earth as the lights rise; righteousness answers from
// above. Every phase length, size and position is randomised per mass per
// cycle, so the masses never fall into step with each other.
//
// Extracted from HeroSection so the sign-in and connector pages can carry it
// too — those pages are reached from outside the site and had nothing on them
// that said whose sign-in this was. Drawn on a canvas behind the content, and
// purely decorative: it is aria-hidden and never receives pointer events.
//
// Assumes a DARK backdrop. The palette is warm light on near-black, so a host
// that renders it over a pale background will produce an invisible animation
// rather than an obviously broken one.
// ---------------------------------------------------------------------------

const PALETTE = [
  { r: 245, g: 240, b: 232 },
  { r: 245, g: 240, b: 232 },
  { r: 245, g: 240, b: 232 },
  { r: 245, g: 240, b: 232 },
  { r: 235, g: 165, b: 44  },
  { r: 200, g: 42,  b: 28  },
] as const;

// Several independent masses, each with its own location, size and timing.
const MASS_COUNT          = 4;
const PARTICLES_PER_MASS  = 22;

// Cycle phases: particles rise & converge (GATHER) → the instant it's fully
// merged it floats up and dissolves (RISE) → a beat of nothing (PAUSE) →
// repeat. Each mass randomizes every phase length independently each cycle,
// so gather pace, rise speed and ball size/position never line up.
const GATHER_MS_RANGE = [4200, 6600] as const;
const RISE_MS_RANGE   = [2600, 6800] as const; // wide range → visibly different float speeds
const PAUSE_MS_RANGE  = [700, 1800] as const;
const BALL_R_RANGE    = [30, 100] as const;    // wide range → some masses visibly bigger than others

// "אמת מארץ תצמח וצדק משמים נשקף" — truth (the rising light) springs from
// below; the instant a mass is absorbed at the top border, righteousness
// answers from above: a gold ray pours down from exactly where it vanished,
// sized and lit to match how much "mass" arrived, then fades.
const RAY_DESCEND_MS_RANGE = [700, 1400] as const;  // time for the ray to pour down to full length
const RAY_HOLD_MS_RANGE    = [200, 500] as const;
const RAY_FADE_MS_RANGE    = [1800, 3400] as const;
const RAY_PEAK_ALPHA_RANGE = [0.28, 0.85] as const; // scaled by ball size
const RAY_TOP_WIDTH_RANGE  = [20, 70] as const;      // scaled by ball size
const RAY_LEN_FRAC_RANGE   = [0.28, 0.55] as const;  // scaled by ball size, fraction of H

const randIn = ([lo, hi]: readonly [number, number]) => lo + Math.random() * (hi - lo);

interface Particle {
  xFrac: number;    // start x, as a fraction of width (resize-safe)
  yOffset: number;  // start y, px below the bottom edge
  jitterX: number;  // offset from the convergence point it settles into
  jitterY: number;
  r: number;
  op: number;
  arrivalFrac: number; // fraction of GATHER_MS at which this particle reaches the mass
  wobbleSeed: number;
  c: typeof PALETTE[number];
}

function makeParticle(): Particle {
  const c = PALETTE[Math.floor(Math.random() * PALETTE.length)];
  return {
    xFrac:       Math.random(),
    yOffset:     8 + Math.random() * 140,
    jitterX:     (Math.random() - 0.5) * 100,
    jitterY:     (Math.random() - 0.5) * 60,
    r:           0.6 + Math.random() * 1.7,
    op:          0.10 + Math.random() * 0.32,
    arrivalFrac: 0.55 + Math.random() * 0.4,
    wobbleSeed:  Math.random() * 1000,
    c,
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

interface Mass {
  cycleStart: number;   // local elapsed ms at which the current cycle began
  gatherMs: number; riseMs: number; pauseMs: number; // this cycle's phase lengths
  particles: Particle[];
  cx: number; cy: number; // this cycle's convergence point (fraction-based, resize-safe)
  cxFrac: number; cyFrac: number;
  ballR: number;          // this cycle's mass size
  pulsed: boolean;        // whether this cycle's absorption has already fired
}

function createMass(): Mass {
  const m: Mass = {
    cycleStart: -Math.random() * 8000, // random head start so masses desync immediately on mount
    gatherMs: 0, riseMs: 0, pauseMs: 0,
    particles: [],
    cx: 0, cy: 0,
    cxFrac: 0.5, cyFrac: 0.5,
    ballR: 64,
    pulsed: false,
  };
  regenerateMass(m);
  return m;
}

function regenerateMass(m: Mass) {
  m.gatherMs = randIn(GATHER_MS_RANGE);
  m.riseMs   = randIn(RISE_MS_RANGE);
  m.pauseMs  = randIn(PAUSE_MS_RANGE);
  m.particles = Array.from({ length: PARTICLES_PER_MASS }, makeParticle);
  m.cxFrac = 0.15 + Math.random() * 0.7;
  m.cyFrac = 0.32 + Math.random() * 0.36;
  m.ballR  = randIn(BALL_R_RANGE);
  m.pulsed = false;
}

interface RayBurst {
  x: number;         // px, the exact column where the mass vanished
  bornAt: number;    // elapsedTotal ms at spawn
  descendMs: number; // time to pour down to targetLen
  holdMs: number;    // time at full length/brightness before fading
  fadeMs: number;    // time to fade out after the hold
  topWidth: number;
  fan: number;
  targetLen: number; // px
  peakAlpha: number;
  seed: number;
}

function spawnRayBurst(x: number, ballR: number, bornAt: number, H: number): RayBurst {
  const sizeT = clamp01((ballR - BALL_R_RANGE[0]) / (BALL_R_RANGE[1] - BALL_R_RANGE[0]));
  return {
    x,
    bornAt,
    descendMs: lerp(RAY_DESCEND_MS_RANGE[0], RAY_DESCEND_MS_RANGE[1], sizeT),
    holdMs:    lerp(RAY_HOLD_MS_RANGE[0], RAY_HOLD_MS_RANGE[1], sizeT),
    fadeMs:    lerp(RAY_FADE_MS_RANGE[0], RAY_FADE_MS_RANGE[1], sizeT),
    topWidth:  lerp(RAY_TOP_WIDTH_RANGE[0], RAY_TOP_WIDTH_RANGE[1], sizeT),
    fan:       1.6 + Math.random() * 1.2,
    targetLen: H * lerp(RAY_LEN_FRAC_RANGE[0], RAY_LEN_FRAC_RANGE[1], sizeT),
    peakAlpha: lerp(RAY_PEAK_ALPHA_RANGE[0], RAY_PEAK_ALPHA_RANGE[1], sizeT),
    seed:      Math.random() * 1000,
  };
}

export function LightParticlesCanvas({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0, H = 0, dpr = 1;
    const masses: Mass[] = Array.from({ length: MASS_COUNT }, createMass);
    let activeRays: RayBurst[] = [];
    let rafId: number;
    let startTs: number | null = null;

    function resize() {
      dpr = window.devicePixelRatio || 1;
      const rect = canvas!.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      canvas!.width  = W * dpr;
      canvas!.height = H * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawBall(x: number, y: number, r: number, opacity: number) {
      if (r <= 0 || opacity <= 0) return;
      const grad = ctx!.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0,    `rgba(255,250,240,${(0.85 * opacity).toFixed(3)})`);
      grad.addColorStop(0.35, `rgba(245,210,150,${(0.55 * opacity).toFixed(3)})`);
      grad.addColorStop(0.7,  `rgba(235,165,44,${(0.28 * opacity).toFixed(3)})`);
      grad.addColorStop(1,    `rgba(200,42,28,0)`);
      ctx!.fillStyle = grad;
      ctx!.beginPath();
      ctx!.arc(x, y, r, 0, Math.PI * 2);
      ctx!.fill();
    }

    function drawActiveRays(bursts: RayBurst[], elapsedTotal: number) {
      // Rays start well above the canvas so we only ever see their soft
      // mid-glow, never the sharp flat edge where the beam "begins" — that
      // hard edge, seen through the blur, is what read as a seam.
      const OVERSHOOT = 70;

      const visible = bursts.filter((b) => {
        const age = elapsedTotal - b.bornAt;
        return age >= 0 && age <= b.descendMs + b.holdMs + b.fadeMs;
      });
      if (!visible.length) return;

      ctx!.save();
      ctx!.filter = 'blur(22px)';
      for (const b of visible) {
        const age = elapsedTotal - b.bornAt;

        // The beam pours downward from the vanish point, decelerating into place.
        const descendT = clamp01(age / b.descendMs);
        const len = b.targetLen * easeOutCubic(descendT);

        // Fade in fast, hold at peak brightness, then fade slowly as it dissipates.
        const fadeInMs = Math.min(250, b.descendMs);
        const fadeIn = clamp01(age / fadeInMs);
        const fadeOutStart = b.descendMs + b.holdMs;
        const fadeOut = age <= fadeOutStart ? 1 : 1 - clamp01((age - fadeOutStart) / b.fadeMs);
        const alpha = b.peakAlpha * fadeIn * fadeOut;

        if (alpha <= 0.003 || len <= 1) continue;

        const topHalf = b.topWidth / 2;
        const botHalf = topHalf * b.fan;

        const grad = ctx!.createLinearGradient(0, -OVERSHOOT, 0, len);
        grad.addColorStop(0,    `rgba(255,214,120,${alpha.toFixed(3)})`);
        grad.addColorStop(0.55, `rgba(235,165,44,${(alpha * 0.5).toFixed(3)})`);
        grad.addColorStop(1,    `rgba(235,165,44,0)`);
        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.moveTo(b.x - topHalf, -OVERSHOOT);
        ctx!.lineTo(b.x + topHalf, -OVERSHOOT);
        ctx!.lineTo(b.x + botHalf, len);
        ctx!.lineTo(b.x - botHalf, len);
        ctx!.closePath();
        ctx!.fill();
      }
      ctx!.restore();
    }

    function drawMass(m: Mass, elapsed: number) {
      const gatherMs = m.gatherMs;
      const riseMs   = m.riseMs;

      const cx = m.cx;
      const cy = m.cy;

      if (elapsed < gatherMs) {
        // Particles rise from below and converge toward this mass.
        for (const p of m.particles) {
          const x0 = p.xFrac * W;
          const y0 = H + p.yOffset;
          const tx = cx + p.jitterX;
          const ty = cy + p.jitterY;

          const tRaw = elapsed / (gatherMs * p.arrivalFrac);
          const t = clamp01(tRaw);
          const te = easeOutCubic(t);

          const wobble = (1 - te) * Math.sin(elapsed / 400 + p.wobbleSeed) * 3;
          const x = lerp(x0, tx, te) + wobble;
          const y = lerp(y0, ty, te);

          const fadeIn  = clamp01(tRaw * 4);
          const fadeOut = 1 - clamp01((t - 0.75) / 0.25);
          const alpha = p.op * fadeIn * fadeOut;
          const r = p.r * (1 - 0.4 * clamp01((t - 0.75) / 0.25));

          if (alpha > 0.002) {
            ctx!.beginPath();
            ctx!.arc(x, y, r, 0, Math.PI * 2);
            ctx!.fillStyle = `rgba(${p.c.r},${p.c.g},${p.c.b},${alpha.toFixed(3)})`;
            ctx!.fill();
          }
        }

        // The mass itself crossfades in as the last particles arrive.
        const ballT = clamp01((elapsed - gatherMs * 0.6) / (gatherMs * 0.4));
        drawBall(cx, cy, m.ballR * easeOutCubic(ballT), ballT);
      } else if (elapsed < gatherMs + riseMs) {
        // The instant it's fully merged, it floats upward and dissolves.
        const riseT = (elapsed - gatherMs) / riseMs;
        const y = cy - riseT * (H * 1.15 + m.ballR + 80);
        const shrink = clamp01((riseT - 0.7) / 0.3);
        const r = m.ballR * (1 - 0.5 * shrink);
        const opacity = 1 - clamp01((riseT - 0.6) / 0.4);
        drawBall(cx, y, r, opacity);
      }
      // else: PAUSE — nothing drawn, a beat of stillness before this mass's cycle repeats.
    }

    function loop(ts: number) {
      if (startTs === null) startTs = ts;
      const elapsedTotal = ts - startTs;

      ctx!.clearRect(0, 0, W, H);
      drawActiveRays(activeRays, elapsedTotal);
      if (activeRays.length) {
        activeRays = activeRays.filter(
          (b) => elapsedTotal - b.bornAt <= b.descendMs + b.holdMs + b.fadeMs
        );
      }

      for (const m of masses) {
        let total = m.gatherMs + m.riseMs + m.pauseMs;
        let elapsed = elapsedTotal - m.cycleStart;
        while (elapsed >= total) {
          m.cycleStart += total;
          regenerateMass(m);
          elapsed = elapsedTotal - m.cycleStart;
          total = m.gatherMs + m.riseMs + m.pauseMs;
        }

        m.cx = m.cxFrac * W;
        m.cy = m.cyFrac * H;

        // Absorbed at the top of its rise — a ray pours down from exactly
        // where it vanished, sized and lit to match how much mass arrived.
        if (!m.pulsed && elapsed >= m.gatherMs + m.riseMs) {
          activeRays.push(spawnRayBurst(m.cx, m.ballR, elapsedTotal, H));
          m.pulsed = true;
        }

        drawMass(m, elapsed);
      }

      rafId = requestAnimationFrame(loop);
    }

    resize();
    rafId = requestAnimationFrame(loop);

    const onResize = () => resize();
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className ?? 'absolute inset-0 w-full h-full pointer-events-none'}
    />
  );
}
