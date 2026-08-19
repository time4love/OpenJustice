import rateLimit from 'express-rate-limit';
import { getAppEnv } from '../lib/appEnv';

// ---------------------------------------------------------------------------
// Cost-exposure guardrails. No route in this backend was previously rate
// limited, and several trigger a paid Claude call (or, for /evidence/confirm,
// an on-chain write) per request with no auth in front of them — see
// docs/gf-cost-exposure-dev-plan.md. Two tiers:
//
//   generalLimiter — mounted on all of /api/*, catches naive scripted
//     hammering of any route.
//   aiCostLimiter  — mounted in addition, only on routes that trigger an LLM
//     or blockchain call. Deliberately tight: legitimate usage of these
//     routes (submitting evidence, drafting a thesis) is low-frequency.
//
// Both are per-IP (in-memory store — fine for GF's single Railway instance;
// would need a shared store like redis if this ever runs multi-instance).
// Per-IP limiting doesn't stop a distributed/rotating-IP attacker; a global
// cap independent of IP is tracked as a fast-follow in the dev plan.
//
// Skipped outside production: production has no other gate on these routes
// at all (requireStagingAccess no-ops there by design), so these limiters
// are its only protection. Staging and local dev already sit behind
// requireStagingAccess's bearer token (or aren't reachable publicly at all),
// so stacking a tight limiter on top there only blocks legitimate testing
// without adding real protection.
// ---------------------------------------------------------------------------

const skipOutsideProduction = (): boolean => getAppEnv() !== 'production';

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipOutsideProduction,
  message: { error: 'Too many requests. Please slow down and try again shortly.' },
});

export const aiCostLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipOutsideProduction,
  message: {
    error: 'Too many AI-analysis requests from this address. Please try again in a few minutes.',
  },
});

/**
 * `/api/chat` is inherently conversational — a real user can easily exceed
 * `aiCostLimiter`'s 10/15min in one sitting. Looser cap, still an LLM call
 * per request so still bounded rather than left uncapped.
 */
export const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipOutsideProduction,
  message: { error: 'Too many chat messages from this address. Please try again in a few minutes.' },
});

/**
 * `/api/forensics/scan` is the single most expensive route in the backend:
 * one request can drive hundreds of LLM calls (WaybackScraper walks a URL's
 * entire CDX history). `aiCostLimiter`'s 10/15min is far too loose here —
 * even a handful of requests compounds fast. Tighter window, tighter count.
 */
export const scanLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipOutsideProduction,
  message: { error: 'Too many scan requests from this address. Please try again later.' },
});
