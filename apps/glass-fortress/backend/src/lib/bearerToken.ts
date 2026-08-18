import type { Request } from 'express';

/** Extracts the token from an `Authorization: Bearer <token>` header, or '' if absent/malformed. */
export function extractBearerToken(req: Request): string {
  const header = req.headers['authorization'] ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}
