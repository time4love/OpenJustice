import { formatDate } from '@/lib/format';

/**
 * The author's handle and the date the version was published (docs/gf-ui-flows.md §17 :530). The date is
 * isolated: a date inside Hebrew reverses the line otherwise (§17 :533–:534). The handle is DATA — the body's.
 */
export function Byline({ author, at, locale }: { author: string; at: string | null; locale: string }) {
  return (
    <p className="text-sm text-slate-600">
      <bdi>{author}</bdi>
      {at === null ? null : (
        <>
          {' · '}
          <bdi dir="ltr">{formatDate(at, locale)}</bdi>
        </>
      )}
    </p>
  );
}
