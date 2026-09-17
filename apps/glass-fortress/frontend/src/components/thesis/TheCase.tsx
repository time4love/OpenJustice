import { useTranslations } from 'next-intl';
import { PlatformMark } from './PlatformMark';
import { ResearcherWords } from './ResearcherWords';

/**
 * THE CASE — docs/gf-ui-flows.md §17 :550–:552; thesis T5 :822, :827–:829. The publication rationale in the
 * researcher's words, and beside it two FACTS in the platform's register: that the version was published over the
 * assessor's objection, and that an analysis was run. Never the objection, never the analysis (§16 :517–:521).
 */
export function TheCase({ rationale, overObjection, analysisRun }: { rationale: string; overObjection: boolean; analysisRun: boolean }) {
  const t = useTranslations('theses.case');
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">{t('heading')}</h2>
      <ResearcherWords className="text-ink">{rationale}</ResearcherWords>
      <p className="mt-2 flex flex-wrap gap-2">
        {overObjection ? <PlatformMark kind="publishedOverObjection" /> : null}
        {analysisRun ? <PlatformMark kind="analysisRun" /> : null}
      </p>
    </section>
  );
}
