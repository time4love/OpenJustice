import { useTranslations } from 'next-intl';
import { Fold } from './Fold';
import { PlatformMark } from './PlatformMark';
import { ResearcherProse } from './ResearcherProse';

/**
 * THE CASE — docs/gf-ui-flows.md §17 :550–:552; thesis T5 :822, :827–:829. The publication rationale in the
 * researcher's words, and beside it two FACTS in the platform's register: that the version was published over the
 * assessor's objection, and that an analysis was run. Never the objection, never the analysis (§16 :517–:521).
 */
export function TheCase({ rationale, overObjection, analysisRun }: { rationale: string; overObjection: boolean; analysisRun: boolean }) {
  const t = useTranslations('theses.case');
  return (
    <Fold summary={t('heading')}>
      <ResearcherProse text={rationale} className="text-ink" />
      <p className="mt-2 flex flex-wrap gap-2">
        {overObjection ? <PlatformMark kind="publishedOverObjection" /> : null}
        {analysisRun ? <PlatformMark kind="analysisRun" /> : null}
      </p>
    </Fold>
  );
}
