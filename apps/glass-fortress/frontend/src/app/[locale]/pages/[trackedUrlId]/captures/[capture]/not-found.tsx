import { ThesisNotFound } from '@/components/thesis/ThesisNotFound';

/**
 * THE ONE 404 FOR A CAPTURE — docs/gf-ui-flows.md §6 :266, A2 :1152, §8 :337–:338.
 *
 * NOT_SURVEYED, NOT_A_CAPTURE and NOT_PUBLIC arrive here as the SAME `{ error: 'Not found' }` body, so this
 * page could not name which one it was even if a second sentence were allowed. It renders the component the
 * thesis segment already uses rather than minting `record.notFound`: ONE sentence behind TWO keys is the
 * orphaned-copy defect waiting to drift, and the draft's own `record.notFound` row was dropped before the
 * freeze for exactly that reason.
 */
export default function NotFound() {
  return <ThesisNotFound />;
}
