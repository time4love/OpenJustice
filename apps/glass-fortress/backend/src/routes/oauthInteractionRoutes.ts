import { Router, Request, Response, urlencoded } from 'express';
import { oidcProvider } from '../oauth/oidcProvider';
import { verifySupabaseUserId } from '../middleware/supabaseAuth';
import { prisma } from '../lib/prisma';

const router = Router();

// The /login and /confirm routes are real <form method="POST"> submissions
// (see the file-level comment below for why), which send
// application/x-www-form-urlencoded, not JSON — server.ts only registers
// express.json() globally, so this router needs its own body parser.
router.use(urlencoded({ extended: false }));

// ---------------------------------------------------------------------------
// MCP OAuth login/consent bridge (docs/gf-mcp-oauth-dev-plan.md, Phase 3).
//
// Mounted at /oauth/interaction in server.ts, exempt from the staging access
// gate for the same reason /oauth itself is (see server.ts's comment there):
// the /login and /confirm routes below MUST be real top-level browser
// navigations (a <form method="POST"> submit), not fetch() calls — they call
// oidc-provider's interactionFinished(), which responds with a redirect that
// resumes the OAuth dance and, on consent, ultimately lands the browser on
// the external MCP client's own redirect_uri. A fetch() would just follow
// that redirect itself and swallow it. Because these are real form
// submissions, no custom Authorization header is possible — the caller's
// Supabase access token travels as a hidden form field in the POST body
// instead, verified with verifySupabaseUserId (same check requireSupabaseAuth
// uses, just not header-sourced).
//
// GET /oauth/interaction/:uid, by contrast, IS fetched normally by the
// frontend (it only reads state, never redirects) and returns no
// researcher-specific data, so it needs no auth at all — see its own comment.
// ---------------------------------------------------------------------------

function scopeList(scope: unknown): string[] {
  return typeof scope === 'string' ? scope.split(' ').filter(Boolean) : [];
}

// req.params values are typed string | string[] by Express (repeated-param
// capture groups) even though a plain ':uid' segment is always a single
// string at runtime — normalize once so the redirect URLs below don't have
// to.
function loginErrorRedirect(req: Request, res: Response, code: string): void {
  const frontendBase = process.env['FRONTEND_URL'] ?? 'http://localhost:3001';
  const uid = String(req.params['uid']);
  res.redirect(303, `${frontendBase}/oauth/interaction/${uid}?loginError=${code}`);
}

async function findApprovedResearcher(accessToken: string) {
  // Any failure verifying the token — including an unexpected throw from the
  // Supabase client itself, not just a rejected/expired token — degrades to
  // the same 'invalid_token' redirect. A raw 500 here would leak internal
  // error details to a real user mid-consent-flow for no benefit; the
  // request is retryable identically either way (sign in again).
  let supabaseUserId: string | null;
  try {
    supabaseUserId = await verifySupabaseUserId(accessToken);
  } catch (err) {
    console.error('[oauthInteraction] verifySupabaseUserId failed:', err instanceof Error ? err.message : err);
    supabaseUserId = null;
  }
  if (!supabaseUserId) return { researcher: null, reason: 'invalid_token' as const };

  const researcher = await prisma.researcher.findUnique({ where: { supabaseUserId } });
  if (!researcher) return { researcher: null, reason: 'no_account' as const };
  if (!researcher.approved) return { researcher: null, reason: 'not_approved' as const };

  return { researcher, reason: null };
}

// ---------------------------------------------------------------------------
// GET /oauth/interaction/:uid
//
// Read-only interaction state for the frontend's consent page. Nothing
// sensitive: which client is asking, what scopes it wants, and whether
// oidc-provider is waiting on a login or a consent decision.
// ---------------------------------------------------------------------------

router.get('/:uid', async (req: Request, res: Response): Promise<void> => {
  try {
    const { uid, prompt, params } = await oidcProvider.interactionDetails(req, res);
    const clientId = typeof params['client_id'] === 'string' ? params['client_id'] : undefined;
    const client = clientId ? await oidcProvider.Client.find(clientId) : undefined;

    res.json({
      uid,
      promptName: prompt.name,
      client: client ? { clientId: client.clientId, clientName: client.clientName ?? client.clientId } : null,
      scopes: scopeList(params['scope']),
    });
  } catch (err) {
    res.status(410).json({
      error: 'interaction_not_found',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// ---------------------------------------------------------------------------
// POST /oauth/interaction/:uid/login
//
// Resolves the 'login' prompt. There is no username/password step here —
// identity comes entirely from the caller's already-established GF Google/
// magic-link session (accessToken). If the researcher isn't approved yet,
// this deliberately does NOT call interactionFinished with an error — that
// would abort the whole grant and force the external client to restart.
// Instead it redirects back to our own frontend with a flag; the interaction
// itself just sits until its own TTL expires or the researcher gets approved
// and retries.
// ---------------------------------------------------------------------------

router.post('/:uid/login', async (req: Request, res: Response): Promise<void> => {
  // req.body is `undefined`, not `{}`, for a POST with no matching
  // Content-Type (e.g. no body at all) — urlencoded() skips parsing entirely
  // rather than defaulting it, so destructuring without a fallback throws.
  const { accessToken } = (req.body ?? {}) as { accessToken?: string };

  if (!accessToken) {
    loginErrorRedirect(req, res, 'missing_token');
    return;
  }

  const { researcher, reason } = await findApprovedResearcher(accessToken);
  if (!researcher) {
    loginErrorRedirect(req, res, reason);
    return;
  }

  await oidcProvider.interactionFinished(
    req,
    res,
    { login: { accountId: researcher.id } },
    { mergeWithLastSubmission: false },
  );
});

// ---------------------------------------------------------------------------
// POST /oauth/interaction/:uid/confirm
//
// Resolves the 'consent' prompt. Re-verifies the researcher (never trust that
// the earlier /login step is still valid — approval can be revoked in
// between, and this is the step that actually grants access). On decision =
// 'deny', properly aborts via interactionFinished's error result so the
// external client gets a real OAuth error, not a silent hang.
// ---------------------------------------------------------------------------

router.post('/:uid/confirm', async (req: Request, res: Response): Promise<void> => {
  const { accessToken, decision } = (req.body ?? {}) as { accessToken?: string; decision?: string };

  if (!accessToken) {
    loginErrorRedirect(req, res, 'missing_token');
    return;
  }

  const { researcher, reason } = await findApprovedResearcher(accessToken);
  if (!researcher) {
    loginErrorRedirect(req, res, reason);
    return;
  }

  if (decision !== 'allow') {
    await oidcProvider.interactionFinished(
      req,
      res,
      { error: 'access_denied', error_description: 'End-User denied access' },
      { mergeWithLastSubmission: false },
    );
    return;
  }

  const interaction = await oidcProvider.interactionDetails(req, res);
  const { params, grantId: existingGrantId } = interaction;
  const details = interaction.prompt.details as {
    missingOIDCScope?: string[];
    missingResourceScopes?: Record<string, string[]>;
  };

  const grant = existingGrantId
    ? await oidcProvider.Grant.find(existingGrantId)
    : new oidcProvider.Grant({
        accountId: researcher.id,
        clientId: typeof params['client_id'] === 'string' ? params['client_id'] : undefined,
      });

  if (!grant) {
    await oidcProvider.interactionFinished(
      req,
      res,
      { error: 'access_denied', error_description: 'Grant could not be resolved' },
      { mergeWithLastSubmission: false },
    );
    return;
  }

  if (details.missingOIDCScope) grant.addOIDCScope(details.missingOIDCScope.join(' '));
  if (details.missingResourceScopes) {
    for (const [indicator, scopes] of Object.entries(details.missingResourceScopes)) {
      grant.addResourceScope(indicator, scopes.join(' '));
    }
  }

  const grantId = await grant.save();

  await oidcProvider.interactionFinished(
    req,
    res,
    { consent: existingGrantId ? {} : { grantId } },
    { mergeWithLastSubmission: true },
  );
});

export { router as oauthInteractionRouter };
