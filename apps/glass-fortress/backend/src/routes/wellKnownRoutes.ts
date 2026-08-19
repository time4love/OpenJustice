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

export { router as wellKnownRouter };
