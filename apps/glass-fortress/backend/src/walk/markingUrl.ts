import { publicUrl } from '../lib/publicRoutes';

// ---------------------------------------------------------------------------
// THE MARKING URL — docs/gf-interaction-flows.md A6, composed in exactly ONE
// module under src/walk, through the reused `publicUrl` with the default
// locale. Deterministic from the page and the capture, so every stop carries
// it and no tool exists to produce it; the page it opens shows the
// `approve_article_rules url=… capture=…` line back, so a mismatch means the
// wrong page is open.
// ---------------------------------------------------------------------------

/** `<frontend>/<locale>/article-rules/<trackedUrlId>/<capture>` */
export function markingUrl(trackedUrlId: string, capture: string): string {
  return publicUrl(`/article-rules/${trackedUrlId}/${capture}`);
}
