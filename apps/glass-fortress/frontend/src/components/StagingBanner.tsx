import { getTranslations } from 'next-intl/server';
import { getAppEnv, isDemoMode } from '@/lib/appEnv';

/**
 * Fixed corner chip marking a non-production deployment, so test data is never
 * mistaken for the live case file.
 *
 * Suppressed by `DEMO_MODE=true` — the banner should not be on screen during a
 * journalist meeting. Suppressing it does not relax the access gate.
 */
export async function StagingBanner() {
  if (getAppEnv() !== 'staging' || isDemoMode()) return null;

  const t = await getTranslations('stagingBanner');

  return (
    <div
      className="fixed bottom-3 start-3 z-50 pointer-events-none select-none rounded-full border border-amber-300 bg-amber-100/90 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wide text-amber-900 shadow-sm backdrop-blur"
      role="status"
    >
      {t('label')}
    </div>
  );
}
