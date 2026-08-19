import { resolveOrigin } from './oidcProvider';

// ---------------------------------------------------------------------------
// OAuth 2.0 Protected Resource Metadata — RFC 9728, mandated by the MCP
// Authorization spec ("MCP servers MUST implement OAuth 2.0 Protected
// Resource Metadata... MCP clients MUST use [it] for authorization server
// discovery" — modelcontextprotocol.io/specification/2025-06-18/basic/
// authorization). Found missing by watching a real claude.ai connector fail:
// without this (and the WWW-Authenticate header in mcpRoutes.ts pointing to
// it), a spec-compliant client has no authoritative way to learn where our
// authorization server lives, and falls back to guessing standard paths at
// the bare origin (`/.well-known/oauth-authorization-server`, `/register`) —
// which don't exist here, since ours are nested under `/oauth`. Those guesses
// would 404, but staging's access gate turned that into a misleading 401
// before server.ts exempted this path too.
// ---------------------------------------------------------------------------

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
}

export function protectedResourceMetadata(
  env: NodeJS.ProcessEnv = process.env,
): ProtectedResourceMetadata {
  const origin = resolveOrigin(env);
  return {
    resource: `${origin}/api/mcp`,
    authorization_servers: [`${origin}/oauth`],
  };
}

export function resourceMetadataUrl(env: NodeJS.ProcessEnv = process.env): string {
  return `${resolveOrigin(env)}/.well-known/oauth-protected-resource`;
}
