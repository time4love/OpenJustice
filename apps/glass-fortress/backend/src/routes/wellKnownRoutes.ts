import { Router, Request, Response } from 'express';
import { protectedResourceMetadata } from '../oauth/resourceMetadata';

const router = Router();

// ---------------------------------------------------------------------------
// GET /.well-known/oauth-protected-resource[/api/mcp]
//
// Both the bare path (what the MCP Authorization spec's own sequence diagram
// shows) and the RFC 8414 §3.1 path-inserted variant (what a real client —
// claude.ai, observed live — actually requested first) resolve to the same
// document. Cheap to serve both; no reason to bet on which convention a given
// client follows.
// ---------------------------------------------------------------------------

function serveMetadata(_req: Request, res: Response): void {
  res.json(protectedResourceMetadata());
}

router.get('/oauth-protected-resource', serveMetadata);
router.get('/oauth-protected-resource/api/mcp', serveMetadata);

// ---------------------------------------------------------------------------
// GET /.well-known/{oauth-authorization-server,openid-configuration}/oauth
//
// RFC 8414 §3.1's actual path-insertion rule: for an issuer with a path
// component (ours is `<origin>/oauth`), metadata lives at
// `<origin>/.well-known/<doc>/<issuer-path>` — the well-known segment goes
// FIRST, the issuer path is appended after. oidc-provider instead serves its
// metadata OIDC-Discovery-style, with .well-known appended directly onto the
// issuer (`/oauth/.well-known/<doc>`) — also spec-legal, but not what every
// client tries. Confirmed live: a real claude.ai connector requested exactly
// the RFC 8414 path-inserted form and got nothing back, one step past the
// protected-resource-metadata fix (docs/gf-mcp-oauth-dev-plan.md §7.0c).
// Redirecting rather than re-serving: oidc-provider's own document is the
// single source of truth, no reason to duplicate it.
// ---------------------------------------------------------------------------

router.get('/oauth-authorization-server/oauth', (_req: Request, res: Response) => {
  res.redirect(302, '/oauth/.well-known/oauth-authorization-server');
});
router.get('/openid-configuration/oauth', (_req: Request, res: Response) => {
  res.redirect(302, '/oauth/.well-known/openid-configuration');
});

export { router as wellKnownRouter };
