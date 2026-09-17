import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { displayUrl } from '@/lib/format';

/**
 * THE PAGES — docs/gf-ui-flows.md §17 :556–:558; thesis T5 :824–:825 as amended. One link per cited page to the
 * corpus at that page, under the one sentence naming the counterweight: everything the researcher looked at,
 * selected or not (evidence §1). The link is `/corpus?page=<trackedUrlId>` — a filter is a query (§8 :341).
 */
export function ThePages({ pages }: { pages: readonly { trackedUrlId: string; url: string }[] }) {
  const t = useTranslations('theses.pages');
  if (pages.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">{t('heading')}</h2>
      <p className="mb-2 text-sm text-ink-muted">{t('counterweight')}</p>
      <ul className="list-disc ps-6">
        {pages.map((page) => (
          <li key={page.trackedUrlId}>
            <Link href={`/corpus?page=${page.trackedUrlId}`} className="underline">
              <bdi dir="ltr">{displayUrl(page.url)}</bdi>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
