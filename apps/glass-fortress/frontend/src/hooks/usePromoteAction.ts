import { useState } from 'react';

export type PromoteState = 'idle' | 'loading' | 'done' | 'error';

/**
 * Shared idle/loading/done/error state machine for "promote this to the
 * vault/chain" buttons. Callers supply their own fetch call (different
 * endpoints, different payloads) and get consistent, non-swallowed error
 * surfacing back.
 */
export function usePromoteAction(
  promote: () => Promise<{ ok: boolean; message?: string }>,
  initialState: PromoteState = 'idle',
) {
  const [state, setState] = useState<PromoteState>(initialState);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setState('loading');
    setError(null);
    try {
      const result = await promote();
      if (result.ok) {
        setState('done');
      } else {
        setError(result.message ?? null);
        setState('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : null);
      setState('error');
    }
  }

  return { state, error, run };
}
