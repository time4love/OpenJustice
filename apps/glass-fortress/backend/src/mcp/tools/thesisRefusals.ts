// ---------------------------------------------------------------------------
// THE THESIS LAYER'S REFUSALS — docs/gf-thesis-flows.md A4's conventions.
//
// "Every refusal is a JSON `{ error, code }`, never a throw." One module holds
// the shape and the CLOSED SET of codes the thesis tools may return, so a refusal
// with a code the contract does not name fails to COMPILE rather than reaching a
// caller as a new word — which is what `test/thesis/tools.ts`' code-set equality
// then holds from the other side.
//
// A THIRD MODULE, ONE PER LAYER, and for the reason `mcp/tools/evidenceRefusals.ts`
// states in its own header: `src/walk/refusals.ts` holds this property for the
// walk and `evidenceRefusals.ts` for the evidence layer, "two modules, one per
// layer, each closed over its own contract's codes — rather than one module edited
// across a boundary the refactor plan draws". Widening the evidence set to admit
// `NO_FRAMING` would make it refusable by four tools whose contract never names it.
// ---------------------------------------------------------------------------

/**
 * Every code thesis A4 names for the four FRAMING tools, transcribed whole:
 * `open_framing` :1434–:1440 · `assess_framing` :1442–:1450 ·
 * `choose_framing` :1452–:1456 · `get_framing` :1458–:1459.
 *
 * `NO_FRAMING` is COINED — ruled at thesis step 17: `NOT_YOURS` would call a
 * framing that does not exist someone else's, which is a false statement to a
 * researcher. The A4 amendment naming it is owed with four others.
 */
export type FramingCode =
  | 'NO_RESEARCHER'
  | 'NO_THESIS'
  | 'NO_FRAMING'
  | 'NOT_AUTHOR'
  | 'NOT_YOURS'
  | 'NO_PROVISION_SHAPE'
  | 'PUBLISHED'
  | 'NO_SUCH_RUN'
  | 'NO_RECORDS'
  | 'NOT_A_RECORD'
  | 'NOT_ACQUIRED'
  | 'AWAITING_DERIVATION'
  | 'UNKNOWN_TRAJECTORY_ID'
  | 'NOT_ASSESSED'
  | 'PROVISION_MISMATCH';

export interface Refusal<C extends FramingCode = FramingCode> {
  error: string;
  code: C;
}

export function refusal<C extends FramingCode>(code: C, error: string): Refusal<C> {
  return { error, code };
}

/** A value that is a refusal rather than an answer — the one discriminant every handler reads. */
export function isRefusal(value: unknown): value is Refusal {
  return typeof value === 'object' && value !== null && 'error' in value && 'code' in value;
}

/** Every handler's envelope: the answer or the refusal, as JSON, never a throw. */
export async function answer<T>(body: () => Promise<T>): Promise<string> {
  return JSON.stringify(await body());
}
