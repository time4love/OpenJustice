import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { CaseVaultService } from '../services/CaseVaultService';

export interface AuthenticatedRequest extends Request {
  supabaseUserId: string;
  caseId: string;
}

const vaultService = new CaseVaultService();

// Verifies the Supabase JWT from the Authorization header.
// Looks up the case via the authenticated user's supabaseUserId.
// Attaches supabaseUserId + caseId to the request.
export async function caseAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    if (!token) {
      res.status(401).json({ error: 'Missing Authorization header' });
      return;
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    const supabaseUserId = data.user.id;
    const legalCase = await vaultService.getCaseByMember(supabaseUserId);
    if (!legalCase) {
      res.status(403).json({
        error: 'No case vault found for this user. Register first via POST /api/cases.',
      });
      return;
    }

    (req as AuthenticatedRequest).supabaseUserId = supabaseUserId;
    (req as AuthenticatedRequest).caseId = legalCase.id;
    next();
  } catch (err) {
    next(err);
  }
}
