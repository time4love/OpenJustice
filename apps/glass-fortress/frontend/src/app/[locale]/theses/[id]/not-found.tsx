import { ThesisNotFound } from '@/components/thesis/ThesisNotFound';

/**
 * THE ONE 404 for a thesis and for every version under it — docs/gf-ui-flows.md §19 :594, §8 :334: a draft, a
 * missing id and a never-published thesis answer the SAME sentence, so no answer tells a reader which it was.
 * UI-10 adds `[locale]/not-found.tsx` for every other route (plan :805–:807); this one is the segment's.
 */
export default function NotFound() {
  return <ThesisNotFound />;
}
