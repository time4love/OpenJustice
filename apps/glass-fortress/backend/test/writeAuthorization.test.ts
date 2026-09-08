import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Which state-changing routes may be reached without credentials.
//
// `POST /api/evidence/promote` took a fileHash and no credentials, and promoted:
// CONFIRMED, registered on-chain, publicly searchable. The hash was not a
// secret — for a forensic record it is derived from the page URL, the two
// archive timestamps and the two capture hashes, all of which this same API
// publishes — so a pending record's identifier could be computed from public
// data and posted back to force a promotion nobody had approved.
//
// `DELETE /api/forensics/tracked/:id` was worse: unauthenticated, and it removed
// every diff and every archived capture beneath a page. The ids it needed are
// handed out by `GET /api/forensics/tracked`.
//
// Both were removed rather than gated: their only client was a button in the
// researcher UI, and adding data to this system goes through MCP.
//
// The whole suite passed before that change and after it, because nothing
// tested the property. Hence a scan rather than per-route tests — testing
// routes one at a time is what let five copies of the evidence-visibility rule
// diverge, and the same reasoning applies here.
// ---------------------------------------------------------------------------

/**
 * Routes that legitimately take a write from an anonymous caller.
 *
 * This is a PUBLIC evidence platform: members of the public submit material and
 * adverse-event reports without holding an account, and those submissions land
 * as PENDING_REVIEW for a person to review. That is the designed behaviour and
 * the reason the review gate exists at all.
 *
 * The line this file defends is not "writes are gated". It is that a write
 * which ACCEPTS A SUBMISSION may be anonymous, while a write which ACCEPTS A
 * SUBMISSION AS TRUE — promotion, publication, deletion — may not. Anything new
 * that wants to be here has to be argued for in this list.
 */
const ANONYMOUS_WRITES_ALLOWED: Record<string, string> = {
  'evidenceRoutes.ts POST /intake': 'public submission — writes PENDING_REVIEW',
  'evidenceRoutes.ts POST /confirm': 'public submission — writes PENDING_REVIEW',
  'evidenceRoutes.ts POST /recover-intake': 'blocked-URL recovery — always PENDING_REVIEW',
  'evidenceRoutes.ts POST /recover-confirm': 'blocked-URL recovery — always PENDING_REVIEW',
  'evidenceRoutes.ts POST /contact': 'contact form',
  'reportRoutes.ts POST /medical': 'public adverse-outcome self-report',
  'reportRoutes.ts POST /social-economic': 'public adverse-outcome self-report',
  'reportRoutes.ts POST /medical/aggregate': 'read-shaped aggregate, POSTed for its filter body',
  'reportRoutes.ts POST /social-economic/aggregate':
    'read-shaped aggregate, POSTed for its filter body',
  'oauthInteractionRoutes.ts POST /:uid/login': 'the login form itself',
  'oauthInteractionRoutes.ts POST /:uid/confirm': 'the consent form itself',
  // THE THESIS BLOCK LEFT THIS LIST AT EVIDENCE STEP 11a, with the routes.
  // It recorded a real inconsistency — publish and unpublish required a
  // researcher while the acts that shaped a thesis's content did not — and it
  // is answered by the design rather than by a gate: thesis flows A5 adds no
  // route at all, every research act is an MCP tool behind the write gate, and
  // the public page is a READ. The inconsistency cannot return as a route,
  // which is why nothing replaces these entries when step 23 lands the reads.
};

/** Middleware that establishes who the caller is. Rate limiters are NOT gates. */
const GATES = ['requireResearcher', 'requireSupabaseAuth', 'requireAdmin', 'identifyResearcher'];

const ROUTES_DIR = join(__dirname, '..', 'src', 'routes');

interface RouteDecl {
  key: string;
  gated: boolean;
}

/**
 * Where a router-level `router.use(<gate>)` appears, if it does.
 *
 * A GATE MOUNTED ON THE ROUTER IS A REAL GATE, and reading only each route's own
 * declaration made this guard blind to it — so a genuinely gated router looked
 * anonymous, and the only ways to satisfy the guard were an allowlist entry
 * claiming the route is ungated (false) or middleware repeated per route
 * (redundant). Both make the record worse than the code.
 *
 * POSITION MATTERS AND IS CHECKED. Express applies middleware in registration
 * order, so `router.use(gate)` gates only the routes declared AFTER it. Treating
 * it as file-wide would let a gate added at the bottom of a file appear to
 * protect everything above it, which is a guard that lies in the safe-looking
 * direction.
 */
function routerGateIndex(src: string): number | null {
  const re = /router\.use\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (GATES.some((g) => (m as RegExpExecArray)[1]?.includes(g) === true)) return m.index;
  }
  return null;
}

/**
 * Parse `router.<verb>(` declarations, single- or multi-line.
 *
 * Both forms exist in this codebase and a regex written for one silently misses
 * the other — which would make this guard pass by not looking, the failure mode
 * it is written to prevent.
 */
function parseRoutes(file: string, src: string): RouteDecl[] {
  const out: RouteDecl[] = [];
  const gateAt = routerGateIndex(src);
  const re = /router\.(post|put|patch|delete)\(\s*([\s\S]{0,400}?)=>\s*\{/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(src)) !== null) {
    const verb = (m[1] as string).toUpperCase();
    const head = m[2] as string;
    const path = /['"`]([^'"`]+)['"`]/.exec(head)?.[1];
    if (!path) continue;
    out.push({
      key: `${file} ${verb} ${path}`,
      gated: GATES.some((g) => head.includes(g)) || (gateAt !== null && gateAt < m.index),
    });
  }
  return out;
}

function allRoutes(): RouteDecl[] {
  return readdirSync(ROUTES_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(ROUTES_DIR, f))
    .filter((f) => statSync(f).isFile())
    .flatMap((f) => parseRoutes(f.slice(ROUTES_DIR.length + 1), readFileSync(f, 'utf8')));
}

describe('the parser understands a router-level gate, and only where it applies', () => {
  // Broadening a guard is where a guard quietly stops guarding, so the
  // broadening is tested directly rather than only through the corpus of real
  // route files — where a mistake would show up as silence.
  it('counts a gate mounted BEFORE the routes', () => {
    const src = `
      router.use(requireResearcher);
      router.post('/x', async (req, res) => {});
    `;
    expect(parseRoutes('f.ts', src)).toEqual([{ key: 'f.ts POST /x', gated: true }]);
  });

  it('does NOT count a gate mounted AFTER a route — Express would not apply it', () => {
    const src = `
      router.post('/x', async (req, res) => {});
      router.use(requireResearcher);
    `;
    expect(parseRoutes('f.ts', src)).toEqual([{ key: 'f.ts POST /x', gated: false }]);
  });

  it('does not mistake a non-gate middleware for a gate', () => {
    const src = `
      router.use(urlencoded({ extended: false }));
      router.post('/x', async (req, res) => {});
    `;
    expect(parseRoutes('f.ts', src)).toEqual([{ key: 'f.ts POST /x', gated: false }]);
  });
});

describe('no state-changing route is reachable anonymously without a stated reason', () => {
  it('finds routes at all — a scan that matches nothing would pass by not looking', () => {
    const routes = allRoutes();
    // FOURTEEN AT EVIDENCE STEP 11a, twenty-nine before it: five route modules
    // left with the thesis layer (`thesisRoutes`, `chatRoutes`, `argumentRoutes`,
    // `mentionRoutes`, `figuresRoutes`), and thesis flows A5 replaces none of
    // them — every research act is an MCP tool. The floor moves WITH the tree and
    // never below it: its job is to catch a scan that stopped matching, not to
    // assert a count, and a floor left at twenty would be the assertion weakened
    // to pass.
    expect(routes.length).toBeGreaterThan(10);
    expect(routes.some((r) => r.gated)).toBe(true);
  });

  it('every ungated write is on the allowlist', () => {
    const offenders = allRoutes()
      .filter((r) => !r.gated && !(r.key in ANONYMOUS_WRITES_ALLOWED))
      .map((r) => r.key);

    expect(offenders).toEqual([]);
  });

  it('the allowlist has no stale entries', () => {
    // An entry left behind after its route is deleted would silently
    // pre-authorise a future route that happens to reuse the path.
    const live = new Set(allRoutes().map((r) => r.key));
    const stale = Object.keys(ANONYMOUS_WRITES_ALLOWED).filter((k) => !live.has(k));
    expect(stale).toEqual([]);
  });

  it('the removed promotion and deletion routes have not come back', () => {
    const live = allRoutes().map((r) => r.key);
    expect(live).not.toContain('evidenceRoutes.ts POST /promote');
    expect(live).not.toContain('forensicsRoutes.ts POST /promote');
    expect(live).not.toContain('forensicsRoutes.ts DELETE /tracked/:id');
  });

  it('DETECTS an ungated write — the guard is proven against a decoy', () => {
    // Without this, a parser that quietly matched nothing would report a clean
    // codebase forever.
    const decoy = `
      router.post('/promote', async (req: Request, res: Response): Promise<void> => {
        await promoteEvidence(record);
      });
    `;
    const parsed = parseRoutes('decoyRoutes.ts', decoy);
    expect(parsed).toEqual([{ key: 'decoyRoutes.ts POST /promote', gated: false }]);
    expect(parsed[0]?.key as string in ANONYMOUS_WRITES_ALLOWED).toBe(false);
  });

  it('does NOT treat a rate limiter as authorization', () => {
    // aiCostLimiter and scanLimiter bound spend, not identity. Reading either as
    // a gate would mark most of this API authorized while nothing checks a
    // caller.
    const limited = `
      router.post('/generate', aiCostLimiter, async (req: Request, res: Response): Promise<void> => {
        await run();
      });
    `;
    expect(parseRoutes('x.ts', limited)[0]?.gated).toBe(false);
  });

  it('recognises a real gate, single-line and multi-line alike', () => {
    const single = `
      router.post('/publish', requireResearcher, async (req: Request, res: Response): Promise<void> => {
        await publish();
      });
    `;
    const multi = `
      router.post(
        '/researchers/:id',
        requireSupabaseAuth,
        requireAdmin,
        async (req: Request, res: Response): Promise<void> => {
          await patch();
        },
      );
    `;
    expect(parseRoutes('x.ts', single)[0]?.gated).toBe(true);
    expect(parseRoutes('x.ts', multi)[0]?.gated).toBe(true);
  });
});
