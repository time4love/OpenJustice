import { WaybackScraper } from './WaybackScraper';
import { scrapeUrl } from '../utils/webScraper';

/**
 * The page content an admission decision is made on.
 *
 * Live page first, falling back to the EARLIEST archived snapshot — because a
 * page that has been taken down is exactly the kind this investigation exists
 * for, and refusing it for being unreachable would exclude the strongest
 * candidates.
 *
 * Extracted from `forensicsRoutes` so all four admission paths judge on the same
 * input. It lived inside the one route that gated, which is part of why the other
 * three could not gate without duplicating it — and a rule that is expensive to
 * apply everywhere ends up applied in one place.
 *
 * Returns null when nothing could be read. That is NOT an off-mission verdict:
 * §3's distinction between a verdict about the DATA and a verdict about the
 * CHECK, and `admitUrl` keeps them apart.
 */
export async function fetchContentForRelevanceCheck(url: string): Promise<string | null> {
  const scraper = new WaybackScraper();
  try {
    const page = await scrapeUrl(url);
    if (page.textContent.trim().length > 0) return page.textContent;
  } catch {
    // Live fetch failed — fall through to the archive.
  }

  try {
    // probeSnapshotsList, not getSnapshotsList: this runs BEFORE the URL is
    // tracked, so there is no TrackedUrl for a CDX observation to belong to.
    const { snapshots } = await scraper.probeSnapshotsList(url);
    const first = snapshots[0];
    if (!first) return null;
    const text = await scraper.scrapeSnapshot(url, first.timestamp);
    return text.trim().length > 0 ? text : null;
  } catch {
    return null;
  }
}
