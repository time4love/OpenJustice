import { getAppEnv, isDemoMode } from '@/lib/appEnv';
import { DebugConsolePanel } from './DebugConsolePanel';

/**
 * Floating debug console for staging — surfaces console output, uncaught
 * errors, and fetch results, so an issue on a device with no attached
 * devtools (a phone) is actually visible instead of just "the UI shows 0".
 *
 * Gated server-side exactly like StagingBanner: APP_ENV is deliberately not
 * NEXT_PUBLIC_, so this must be an async Server Component doing the check,
 * not a client-side flag — a missing env var must never accidentally turn
 * this (or the access gate) on in production. Also suppressed by DEMO_MODE,
 * same as the banner: raw logs/errors are exactly what you don't want on
 * screen during a journalist meeting.
 */
export async function StagingDebugConsole() {
  if (getAppEnv() !== 'staging' || isDemoMode()) return null;

  return <DebugConsolePanel />;
}
