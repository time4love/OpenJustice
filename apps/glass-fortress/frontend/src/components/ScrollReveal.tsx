'use client';

import { motion, useReducedMotion, type Variants, type HTMLMotionProps } from 'framer-motion';

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

export function StaggerItem({ children, ...rest }: HTMLMotionProps<'div'>) {
  const variants = useRevealItemVariants();
  return (
    <motion.div variants={variants} {...rest}>
      {children}
    </motion.div>
  );
}
