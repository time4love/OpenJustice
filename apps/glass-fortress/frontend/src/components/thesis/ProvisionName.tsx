/**
 * The provision NAMED BY ITS TABLE ENTRY — docs/gf-ui-flows.md §17 :529–:530; thesis A1 :1251–:1254. The title is
 * the backend table's (`provisionTitle`, §g), never a second copy kept here; `dir="auto"` because the table's
 * words are Hebrew on an English page too. A thesis with no provision renders nothing.
 */
export function ProvisionName({ title }: { title: string | null }) {
  if (title === null || title === '') return null;
  return (
    <p dir="auto" className="text-sm text-slate-600">
      {title}
    </p>
  );
}
