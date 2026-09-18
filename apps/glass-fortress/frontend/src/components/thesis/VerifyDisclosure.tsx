import { useTranslations } from 'next-intl';
import { CopyableCode } from '@/components/CopyableCode';
import type { Citation } from '@/types/thesis';
import { Fold } from './Fold';

// ---------------------------------------------------------------------------
// VERIFY — docs/gf-ui-flows.md §4 :174–:176, §17 :559–:561; A6 :1097 (closed by default). One of the two homes an
// exact value has: the reader who came to CHECK opens it, and everyone else never sees a hash.
//
// IT HOLDS WHAT THE BODY CARRIES: the version's hash, and each citation's record name and pinned content version.
// The document hash, the text hash and the registry index are the record page's (UI-7) — a gap recorded, never
// invented here. The "how to check" line says the version hash is SHA-256 over the text and is NOT on any chain:
// publication anchors nothing (thesis T5 :791–:798), and a page implying otherwise would claim a proof that does
// not exist.
// ---------------------------------------------------------------------------

export function VerifyDisclosure({ contentHash, citations }: { contentHash: string; citations: readonly Citation[] }) {
  const t = useTranslations('theses.verify');
  return (
    <Fold summary={t('summary')} verify>
      <div className="space-y-2 text-sm">
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-ink-muted">{t('versionHash')}</span>
          <CopyableCode value={contentHash} label={t('copyValue')} showValue />
        </p>
        {citations.map((citation) => (
          <div key={`${citation.kind}:${citation.name}`} className="space-y-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-ink-muted">{citation.kind === 'EVIDENCE' ? t('recordName') : t('trajectoryId')}</span>
              <CopyableCode value={citation.name} label={t('copyValue')} showValue />
            </p>
            {citation.kind === 'EVIDENCE' && citation.pin !== null ? (
              <p className="flex flex-wrap items-center gap-2">
                <span className="text-ink-muted">{t('pin')}</span>
                <CopyableCode value={citation.pin} label={t('copyValue')} showValue />
              </p>
            ) : null}
          </div>
        ))}
        <p className="text-ink-muted">{t('how')}</p>
      </div>
    </Fold>
  );
}
