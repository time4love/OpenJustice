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
  'chatRoutes.ts POST /': 'public assistant, rate limited',
  'argumentRoutes.ts POST /generate': 'public argument generation, rate limited',
  'forensicsRoutes.ts POST /scan': 'starts a scan; writes only archived material, rate limited',
  'forensicsRoutes.ts POST /pause/:id': 'stops a running scan — halts writing, cannot destroy',
  'oauthInteractionRoutes.ts POST /:uid/login': 'the login form itself',
  'oauthInteractionRoutes.ts POST /:uid/confirm': 'the consent form itself',
  // Thesis authoring is not yet gated. Recorded here deliberately rather than
  // omitted: publish and unpublish DO require a researcher, so the act that
  // makes a thesis public is gated while the acts that shape its content are
  // not. That is a real inconsistency and it belongs in front of whoever reads
  // this list, not hidden by a looser pattern.
  'thesisRoutes.ts POST /:id/analyze': 'UNGATED — see note above',
  'thesisRoutes.ts POST /:id/version': 'UNGATED — see note above',
  'thesisRoutes.ts POST /:id/suggest-revision': 'UNGATED — see note above',
  'thesisRoutes.ts POST /draft': 'UNGATED — see note above',
  'thesisRoutes.ts POST /:id/foia-request': 'UNGATED — see note above',
  'thesisRoutes.ts POST /:id/gaps/:gapIndex/resolve': 'UNGATED — see note above',
  'thesisRoutes.ts DELETE /:id/gaps/:gapIndex/resolve': 'UNGATED — see note above',
  'thesisRoutes.ts POST /:id/gaps/:gapIndex/whistleblower': 'UNGATED — see note above',
  'thesisRoutes.ts POST /:id/gaps/:gapIndex/whistleblower/preview': 'UNGATED — see note above',
};

/** Middleware that establishes who the caller is. Rate limiters are NOT gates. */
const GATES = ['requireResearcher', 'requireSupabaseAuth', 'requireAdmin', 'identifyResearcher'];

const ROUTES_DIR = join(__dirname, '..', 'src', 'routes');

interface RouteDecl {
  key: string;
  gated: boolean;
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
  const re = /router\.(post|put|patch|delete)\(\s*([\s\S]{0,400}?)=>\s*\{/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(src)) !== null) {
    const verb = (m[1] as string).toUpperCase();
    const head = m[2] as string;
    const path = /['"`]([^'"`]+)['"`]/.exec(head)?.[1];
    if (!path) continue;
    out.push({
      key: `${file} ${verb} ${path}`,
      gated: GATES.some((g) => head.includes(g)),
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

describe('no state-changing route is reachable anonymously without a stated reason', () => {
  it('finds routes at all — a scan that matches nothing would pass by not looking', () => {
    const routes = allRoutes();
    expect(routes.length).toBeGreaterThan(20);
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
