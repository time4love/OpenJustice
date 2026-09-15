import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { researcherContext } from '../context/researcherContext';

// ---------------------------------------------------------------------------
// THE ROUTE ADAPTER — docs/gf-ui-flows.md §5 :184–:189 (a route IS a tool's answer), §6 :259–:267 (the ONE status
// table), §7 :307–:310 (the gated door); docs/gf-ui-refactor-plan.md UI-3 :231–:238; the R53 sketch §a1–§a2.
//
// EVERY ROUTE GOES THROUGH ONE OF TWO DOORS, and neither composes an answer. A route hands its door a READER (the
// request's parameters, parsed by the tool's own schemas, or the parameter it could not read) and a CORE (the one
// function the tool's handler calls too). The door calls the core and sends its value serialised exactly as the tool's
// `answer` serialises it — `JSON.stringify` — so a 200 body IS the tool's text, byte for byte, with no environment stamp
// (the stamp is the MCP surface's, applied at registration). A refusal becomes HTTP through the ONE table below; a
// router that set a status itself would be the second spelling §5 forbids.
//
// THE PUBLIC DOOR READS NO CALLER. THE GATED DOOR reads `req.researcherId` once — set by `requireResearcher` at the
// `/api/research` mount — and runs the core inside `researcherContext`, as `mcpRoutes.ts` runs a tool, so a core
// reads its caller the one way it always has.
// ---------------------------------------------------------------------------

/** Every code a routed core may return, and the one the route layer adds — the table's domain, listed once. */
export const ROUTED_CODES = [
  'NOT_SURVEYED',
  'NOT_PUBLIC',
  'NOT_A_RECORD',
  'NOT_A_CAPTURE',
  'NO_SUCH_DIFF',
  'NOT_PUBLISHED',
  'NO_THESIS',
  'NO_FRAMING',
  'NO_SUCH_RULE',
  'SESSION_NOT_FOUND',
  'AWAITING_DERIVATION',
  'CHAIN_UNAVAILABLE',
  'INVALID_RANGE',
  'PHRASE_REQUIRED',
  'INVALID_OUTCOME',
  'INVALID_PARAMETER',
  'NO_RESEARCHER',
] as const;

export type RoutedCode = (typeof ROUTED_CODES)[number];

/** What a route answers a refusal with: a status, and whether the public door hides the refusal behind the one 404 body. */
type Row = { status: 404; hidden: true } | { status: 400 | 409 | 503; hidden: false } | { status: 'DEFECT'; hidden: false };

/**
 * THE ONE TABLE (§6 :261–:266; §7 :307–:310). The "not found" codes are the one 404 body at the public door — a
 * stranger learns nothing about what is surveyed, drafted or held — and the refusal verbatim inside `/api/research`,
 * where working state is the caller's to read. NO_RESEARCHER is a wiring DEFECT at both doors: no public core is asked
 * a scope that needs a caller, and the gated door has one.
 */
const TABLE: Readonly<Record<RoutedCode, Row>> = {
  NOT_SURVEYED: { status: 404, hidden: true },
  NOT_PUBLIC: { status: 404, hidden: true },
  NOT_A_RECORD: { status: 404, hidden: true },
  NOT_A_CAPTURE: { status: 404, hidden: true },
  NO_SUCH_DIFF: { status: 404, hidden: true },
  NOT_PUBLISHED: { status: 404, hidden: true },
  NO_THESIS: { status: 404, hidden: true },
  NO_FRAMING: { status: 404, hidden: true },
  NO_SUCH_RULE: { status: 404, hidden: true },
  SESSION_NOT_FOUND: { status: 404, hidden: true },
  AWAITING_DERIVATION: { status: 409, hidden: false },
  CHAIN_UNAVAILABLE: { status: 503, hidden: false },
  INVALID_RANGE: { status: 400, hidden: false },
  PHRASE_REQUIRED: { status: 400, hidden: false },
  INVALID_OUTCOME: { status: 400, hidden: false },
  INVALID_PARAMETER: { status: 400, hidden: false },
  NO_RESEARCHER: { status: 'DEFECT', hidden: false },
};

export type Door = 'public' | 'research';

const NOT_FOUND = { error: 'Not found' } as const;

const isRoutedCode = (code: string): code is RoutedCode => (ROUTED_CODES as readonly string[]).includes(code);

/** A refusal's status and body at a door. A code outside the table, or a wiring defect, THROWS — never an unmapped 200. */
export function statusOf(refused: { error: string; code: string }, door: Door): { status: number; body: object } {
  if (!isRoutedCode(refused.code)) {
    throw new Error(`toolRoute: a core refused with ${refused.code}, a code the route table does not map — a new word reaches no caller unmapped.`);
  }
  const row = TABLE[refused.code];
  if (row.status === 'DEFECT') {
    throw new Error(`toolRoute: a core refused ${refused.code} at the ${door} door — a route wired to a scope or a caller it does not have.`);
  }
  return { status: row.status, body: door === 'public' && row.hidden ? NOT_FOUND : refused };
}

/** A tool's refusal: exactly `{ error, code }`, both strings — the shape every refusal constructor in the tree builds. */
function asRefusal(value: unknown): { error: string; code: string } | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== 'code' || keys[1] !== 'error') return null;
  const { error, code } = value as Record<string, unknown>;
  return typeof error === 'string' && typeof code === 'string' ? { error, code } : null;
}

// --- the readers ------------------------------------------------------------------------------------------------------

/** A route's reading of its request: the core's input, or the parameter it could not read. */
export type Reading<I> = { input: I } | { invalid: string };

/**
 * The query, parsed by the tool's own shapes (never a second spelling of a schema): an UNKNOWN key — `scope` among
 * them, which the route fixes — a REPEATED key, or a value the shape refuses is `{ invalid }`, the route's 400.
 */
function queryOf<S extends z.ZodRawShape>(req: Request, shape: S): Reading<z.output<z.ZodObject<S>>> {
  const parsed = z.strictObject(shape).safeParse(req.query);
  if (parsed.success) return { input: parsed.data };
  return { invalid: parsed.error.issues.map((issue) => (issue.path.length > 0 ? `${issue.path.map(String).join('.')}: ${issue.message}` : issue.message)).join('; ') };
}

/**
 * A ROUTE'S READER: the query parsed by `shape` (`{}` reads none), then the core's input built from it and the path.
 * What the route passes on UNPARSED — a path's id, a timestamp, an outcome — is the core's to refuse (the researcher's
 * ruling: a date where a timestamp belongs is NOT_A_CAPTURE, never a 400).
 */
export function reader<S extends z.ZodRawShape, I>(shape: S, build: (query: z.output<z.ZodObject<S>>, req: Request) => I): (req: Request) => Reading<I> {
  return (req) => {
    const query = queryOf(req, shape);
    return 'invalid' in query ? query : { input: build(query.input, req) };
  };
}

/** A path parameter the route's own path declares — a LOUD GUARD, since Express matched the path only because it was there. */
export function param(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string') {
    throw new Error(`toolRoute: the path parameter ${name} is absent — the route reads a parameter its path does not declare.`);
  }
  return value;
}

/** A number parameter: digits become a number for the tool's shape to judge; anything else stays text and is refused by it. */
export const numberParam = <T extends z.ZodType>(shape: T): z.ZodPreprocess<T> =>
  z.preprocess((v) => (typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v), shape);

/** A boolean parameter: `true` and `false` become booleans; anything else is passed on and refused by the tool's shape. */
export const booleanParam = <T extends z.ZodType>(shape: T): z.ZodPreprocess<T> =>
  z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), shape);

/** A page a route names by its id — re-exported, so a route module imports no refusal module at all (sketch §a3). */
export { pageById } from '../mcp/tools/evidenceRefusals';

// --- the doors --------------------------------------------------------------------------------------------------------

/** The codes a core's value may refuse with — `never` when it refuses nothing. */
type RefusalCodeOf<B> = B extends { error: string; code: infer C } ? C : never;

/**
 * A CORE WHOSE REFUSALS THE TABLE DOES NOT MAP DOES NOT COMPILE: the door takes one argument more, of type `never`,
 * for every such core — so a new code reaches a route only with its row in `TABLE` (the R53 chunk-2 L2).
 */
type Unmapped<B> = [Exclude<RefusalCodeOf<B>, RoutedCode>] extends [never] ? [] : [unmapped: never];

function send(res: Response, status: number, value: unknown): void {
  res.status(status).type('application/json').send(JSON.stringify(value));
}

async function serve<I>(res: Response, reading: Reading<I>, run: (input: I) => Promise<unknown>, door: Door): Promise<void> {
  if ('invalid' in reading) {
    send(res, 400, { error: reading.invalid, code: 'INVALID_PARAMETER' });
    return;
  }
  const value = await run(reading.input);
  const refused = asRefusal(value);
  if (refused === null) {
    send(res, 200, value);
    return;
  }
  const { status, body } = statusOf(refused, door);
  send(res, status, body);
}

/** THE PUBLIC DOOR (§6): no caller read — the same bytes for everyone. */
export function publicRoute<I, B>(read: (req: Request) => Reading<I>, core: (input: I) => Promise<B>, ..._unmapped: Unmapped<B>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    serve(res, read(req), core, 'public').catch(next);
  };
}

/** THE GATED DOOR (§7): the researcher the mount's gate admitted, placed in context once, for the core. */
export function researchRoute<I, B>(read: (req: Request) => Reading<I>, core: (input: I) => Promise<B>, ..._unmapped: Unmapped<B>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const researcherId = req.researcherId;
    if (researcherId === undefined) {
      next(new Error('toolRoute: a research route ran without the researcher the /api/research mount sets — it is mounted outside the gate.'));
      return;
    }
    serve(res, read(req), (input) => researcherContext.run({ researcherId }, () => core(input)), 'research').catch(next);
  };
}
