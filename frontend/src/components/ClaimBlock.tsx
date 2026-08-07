/**
 * Renders a single diff claim: AI summary label (if present) above the verbatim
 * raw page text that changed. Used in both the live polling view and the
 * full forensic drill-down timeline.
 */
export function ClaimBlock({
  claim,
  rawChunk,
  type,
}: {
  claim: string | null;
  rawChunk: string | undefined;
  type: 'deleted' | 'added';
}) {
  const isDel = type === 'deleted';

  return (
    <div
      className={`rounded-lg border overflow-hidden ${
        isDel ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'
      }`}
    >
      {/* AI claim label — the concise Hebrew summary */}
      {claim && (
        <div
          className={`flex items-start gap-2 px-3 py-2 ${
            isDel ? 'border-b border-red-200' : 'border-b border-emerald-200'
          }`}
        >
          <span
            className={`mt-0.5 shrink-0 select-none font-semibold ${
              isDel ? 'text-red-400' : 'text-emerald-500'
            }`}
          >
            {isDel ? '—' : '+'}
          </span>
          <p
            className={`text-sm font-medium leading-relaxed ${
              isDel ? 'text-red-700' : 'text-emerald-800'
            }`}
            dir="auto"
          >
            {claim}
          </p>
        </div>
      )}

      {/* Raw page text — the actual verbatim content that changed */}
      {rawChunk && (
        <div className={`px-3 py-2 ${claim ? 'bg-white/60' : ''}`}>
          {!claim && (
            <span
              className={`mt-0.5 me-2 shrink-0 select-none font-semibold ${
                isDel ? 'text-red-400' : 'text-emerald-500'
              }`}
            >
              {isDel ? '—' : '+'}
            </span>
          )}
          <p
            className={`text-xs leading-relaxed whitespace-pre-wrap font-mono ${
              isDel ? 'text-red-600/70' : 'text-emerald-700/70'
            }`}
            dir="auto"
          >
            {rawChunk}
          </p>
        </div>
      )}
    </div>
  );
}
