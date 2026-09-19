import { ThesisNotFound } from '@/components/thesis/ThesisNotFound';

/**
 * THE ONE 404 FOR A RECORD NAME — docs/gf-ui-flows.md §6 :266, A2 :1152.
 *
 * NOT_A_RECORD and NOT_PUBLIC answer the same `{ error: 'Not found' }` body, and that is the whole point
 * here: a stranger holding a name must not learn from this page whether the corpus holds the record and
 * keeps it private, or never held it at all.
 */
export default function NotFound() {
  return <ThesisNotFound />;
}
