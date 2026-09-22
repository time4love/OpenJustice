import { ThesisNotFound } from '@/components/thesis/ThesisNotFound';

/**
 * THE ONE 404 FOR A PAIR — docs/gf-ui-flows.md §6 :266, A2 :1152.
 *
 * NOT_SURVEYED, NOT_PUBLIC, NOT_A_CAPTURE and NO_SUCH_DIFF arrive as the same `{ error: 'Not found' }`
 * body, so this segment cannot name which it was. Note what is NOT here: AWAITING_DERIVATION is a 409 and
 * a STATE the page renders with both capture links live (§26 :855), never a refusal — a pair whose content
 * is not derived yet is a pair the corpus holds.
 */
export default function NotFound() {
  return <ThesisNotFound />;
}
