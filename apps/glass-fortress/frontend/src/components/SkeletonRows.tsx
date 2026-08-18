// Pulsing "spine + card" placeholder rows shared by pages that render a
// vertical timeline of cards while their data loads (forensics diff detail,
// the evidence timeline, and its incremental load-more state).
export function SkeletonRows({
  rows,
  connectorHeight = 'min-h-24',
  headerBarWidths,
  bodyLineWidths,
}: {
  rows: number;
  connectorHeight?: string;
  headerBarWidths: string[];
  bodyLineWidths: string[];
}) {
  return (
    <div className="animate-pulse space-y-5">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-4">
          <div className="flex flex-col items-center shrink-0">
            <div className="w-3 h-3 rounded-full bg-slate-200 mt-[1.125rem]" />
            <div className={`w-px flex-1 bg-slate-200 mt-1.5 ${connectorHeight}`} />
          </div>
          <div className="flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-3">
              {headerBarWidths.map((w, j) => (
                <div key={j} className={`h-2.5 bg-slate-200 rounded-full ${w}`} />
              ))}
            </div>
            <div className="px-4 py-3 space-y-2">
              {bodyLineWidths.map((w, j) => (
                <div key={j} className={`h-2 bg-slate-100 rounded ${w}`} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
