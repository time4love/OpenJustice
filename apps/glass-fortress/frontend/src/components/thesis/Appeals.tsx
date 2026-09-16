import { useTranslations } from 'next-intl';
import { CopyableCode } from '@/components/CopyableCode';
import type { CallItem, Citation, RequestItem } from '@/types/thesis';
import { CitationChip } from './CitationChip';
import { ResearcherWords } from './ResearcherWords';

// ---------------------------------------------------------------------------
// THE APPEALS — docs/gf-ui-flows.md §17 :539–:549, §20 :609–:612; thesis T4 :654–:699, A4 :1501–:1504.
//
// Two kinds of item card, both the researcher's own words, approved with the decision that made them: a REQUESTED
// gap publishes the request READY TO SEND with one COPY — the moment is the instruction's — and a CALLED gap
// publishes what is needed, who would have seen it, the unit and the window. Units and roles, never a person.
//
// THE INTAKE LINE IS TEXT, AND NO LINK IS DRAWN (§17 :546–:548; document plan :506–:509). The door is the
// document plan's step 32; until then a page that pointed at it would send the public to a channel that is shut.
// A thesis with no CALLED and no REQUESTED gap shows no appeals section at all (§17 :549).
// ---------------------------------------------------------------------------

export interface AppealsProps {
  call: readonly CallItem[];
  requests: readonly RequestItem[];
  intake: string;
  citations: readonly Citation[];
  pages: readonly { trackedUrlId: string; url: string }[];
  locale: string;
  headings: { call: string; requests: string; how: string } | null;
}

/**
 * A field of an appeal card: its label, then the researcher's words, which are their own BLOCK (§16 :517–:521).
 * A `<p>` here would be closed by the browser at that block's opening tag and React would hydrate against a DOM
 * it never rendered — so the field is a `<div>`, and the label is the inline part.
 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-sm">
      <span className="text-slate-500">{label}: </span>
      {children}
    </div>
  );
}

export function Appeals({ call, requests, intake, citations, pages, locale, headings }: AppealsProps) {
  const t = useTranslations('theses.appeals');
  if (call.length === 0 && requests.length === 0) return null;
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{headings === null ? t('heading') : headings.call}</h2>
      {call.map((item) => (
        <article key={item.gapId} className="space-y-1 rounded-lg border border-slate-200 p-3">
          <h3 className="text-sm font-semibold">{t('call')}</h3>
          <Field label={t('whatIsNeeded')}>
            <ResearcherWords>{item.whatIsNeeded}</ResearcherWords>
          </Field>
          <Field label={t('whoWouldHaveSeenIt')}>
            <ResearcherWords>{item.whoWouldHaveSeenIt}</ResearcherWords>
          </Field>
          <Field label={t('unit')}>
            <ResearcherWords>{item.unit}</ResearcherWords>
          </Field>
          <Field label={t('window')}>
            <ResearcherWords>{item.window}</ResearcherWords>
          </Field>
        </article>
      ))}
      {requests.length === 0 ? null : headings === null ? null : <h2 className="text-lg font-semibold">{headings.requests}</h2>}
      {requests.map((request) => (
        <article key={request.gapId} className="space-y-1 rounded-lg border border-slate-200 p-3">
          <h3 className="text-sm font-semibold">{t('request')}</h3>
          <ResearcherWords className="text-sm leading-relaxed">{request.text}</ResearcherWords>
          <Field label={t('authority')}>
            <ResearcherWords>{request.authority}</ResearcherWords>
          </Field>
          <Field label={t('legalBasis')}>
            <ResearcherWords>{request.legalBasis}</ResearcherWords>
          </Field>
          <Field label={t('addresses')}>
            {request.addresses.map((address) => (
              <bdi dir="ltr" key={address} className="me-2">
                {address}
              </bdi>
            ))}
          </Field>
          <span data-rests-on className="flex flex-wrap items-center gap-1 text-sm">
            <span className="text-slate-500">{t('restsOn')}: </span>
            {request.restsOn.map((name) => {
              const citation = citations.find((one) => one.kind === 'EVIDENCE' && one.name === name);
              return (
                <CitationChip
                  key={name}
                  kind={citation === undefined ? 'unresolved' : citation.kind === 'EVIDENCE' && citation.record.capture === undefined ? 'diff' : 'capture'}
                  name={name}
                  source={`#ev_${name}`}
                  citation={citation}
                  pageId={citation?.kind === 'EVIDENCE' ? pages.find((page) => page.url === citation.record.url)?.trackedUrlId : undefined}
                  locale={locale}
                />
              );
            })}
          </span>
          <CopyableCode value={request.text} label={t('copyRequest')} />
        </article>
      ))}
      {headings === null ? null : <h2 className="text-lg font-semibold">{headings.how}</h2>}
      <ResearcherWords className="text-sm text-slate-700">
        <span data-intake>{intake}</span>
      </ResearcherWords>
    </section>
  );
}
