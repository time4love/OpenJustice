'use client';

import { useRef } from 'react';
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type Variants,
  type HTMLMotionProps,
} from 'framer-motion';

// he is the default locale and the whole site is RTL — reveal motion stays
// vertical (y) only, never horizontal, so nothing appears to slide in from
// the "wrong" side depending on locale.
function useRevealVariants(): Variants {
  const reduceMotion = useReducedMotion();
  return {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 28 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: reduceMotion ? 0.2 : 0.55, ease: [0.16, 1, 0.3, 1] },
    },
  };
}

// Decorative left/right entrance for staggered grid items. Unlike a
// directional affordance (e.g. "next" arrows, back gestures) this alternation
// is purely rhythmic — it doesn't assert a reading order — so, unique among
// the motion in this file, it does not need to flip for RTL.
function useSideRevealVariants(side: 'left' | 'right'): Variants {
  const reduceMotion = useReducedMotion();
  const x = reduceMotion ? 0 : side === 'left' ? -40 : 40;
  return {
    hidden: { opacity: 0, x, y: reduceMotion ? 0 : 16 },
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      transition: { duration: reduceMotion ? 0.2 : 0.7, ease: [0.16, 1, 0.3, 1] },
    },
  };
}

function useScaleRevealVariants(): Variants {
  const reduceMotion = useReducedMotion();
  return {
    hidden: { opacity: 0, scale: reduceMotion ? 1 : 0.94, y: reduceMotion ? 0 : 18 },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: { duration: reduceMotion ? 0.2 : 0.6, ease: [0.16, 1, 0.3, 1] },
    },
  };
}

interface ScrollRevealProps extends Omit<HTMLMotionProps<'div'>, 'initial' | 'whileInView' | 'viewport' | 'variants'> {
  delay?: number;
}

export function ScrollReveal({ children, delay = 0, transition, ...rest }: ScrollRevealProps) {
  const variants = useRevealVariants();
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      variants={variants}
      transition={{ delay, ...transition }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

// Wrap a grid/list container in this, then give each child item the plain
// `revealItemVariants` (no own whileInView) so children stagger in together
// under one IntersectionObserver instead of N independent ones.
export function useStaggerContainerVariants(staggerChildren = 0.08): Variants {
  const reduceMotion = useReducedMotion();
  return {
    hidden: {},
    visible: { transition: { staggerChildren: reduceMotion ? 0 : staggerChildren } },
  };
}

export function StaggerContainer({
  children,
  staggerChildren,
  ...rest
}: HTMLMotionProps<'div'> & { staggerChildren?: number }) {
  const variants = useStaggerContainerVariants(staggerChildren);
  return (
    <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }} variants={variants} {...rest}>
      {children}
    </motion.div>
  );
}

export function useRevealItemVariants(): Variants {
  return useRevealVariants();
}

type StaggerItemVariant = 'up' | 'left' | 'right' | 'scale';

export function StaggerItem({
  children,
  variant = 'up',
  ...rest
}: HTMLMotionProps<'div'> & { variant?: StaggerItemVariant }) {
  // Hooks must run unconditionally — compute all three, pick one.
  const up = useRevealItemVariants();
  const left = useSideRevealVariants('left');
  const right = useSideRevealVariants('right');
  const scale = useScaleRevealVariants();
  const variants = { up, left, right, scale }[variant];
  return (
    <motion.div variants={variants} {...rest}>
      {children}
    </motion.div>
  );
}

// Slow-moving background layer for scroll depth. `speed` < 1 lags the page
// scroll (reads as "further back"); keep decorative content only — it must
// never carry information the fold-swipe could hide.
export function ParallaxLayer({
  children,
  speed = 0.3,
  className,
}: {
  children: React.ReactNode;
  speed?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const range = reduceMotion ? ['0%', '0%'] : [`${-15 * speed}%`, `${15 * speed}%`];
  const y = useTransform(scrollYProgress, [0, 1], range);

  return (
    <div ref={ref} className={`absolute inset-0 overflow-hidden pointer-events-none ${className ?? ''}`}>
      <motion.div style={{ y }} className="absolute inset-0">
        {children}
      </motion.div>
    </div>
  );
}
