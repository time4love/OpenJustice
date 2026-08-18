export function EmptyState({
  icon,
  title,
  sub,
}: {
  icon: string;
  title: string;
  sub: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-8 py-20 border border-dashed border-slate-200 rounded-xl bg-white shadow-sm">
      <div className="text-3xl mb-4 text-slate-300">{icon}</div>
      <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
      <p className="text-xs text-slate-400 max-w-xs leading-relaxed">{sub}</p>
    </div>
  );
}
