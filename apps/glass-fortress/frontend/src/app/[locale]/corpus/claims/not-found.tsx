import { ThesisNotFound } from '@/components/thesis/ThesisNotFound';

/**
 * THE ONE 404 FOR THE CLAIMS VIEW — docs/gf-ui-flows.md §25 :783, §6 :266, A2 :1152, §8 :337–:338.
 *
 * THREE ROADS ARRIVE HERE AND A READER CANNOT TELL THEM APART, which is the point: a page that is not
 * surveyed, a page no published thesis has opened, and a BARE `/corpus/claims` with no page at all. The
 * first two are the public door's one `{ error: 'Not found' }` body; the third is this view's own rule —
 * "there is no bare `/corpus/claims`, because a claims list with no page is the list this amendment
 * removes". One sentence for all three, and no new string: the component the thesis and record segments
 * already use.
 */
export default function NotFound() {
  return <ThesisNotFound />;
}
