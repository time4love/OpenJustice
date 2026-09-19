/**
 * A FIXTURE PAGE that declares NO right-pane tab — docs/gf-ui-refactor-plan.md §9 :1069, :1088.
 *
 * It declares none by saying nothing: a page that wants no pane imports nothing and calls nothing. The pane must then
 * collapse to NOTHING in the DOM — not a zero-width element, which would still be a tab stop and still be in the
 * accessibility tree (the sketch's §c3).
 */
export default function PageWithNoTabs() {
  return (
    <main>
      <h1>the centre</h1>
    </main>
  );
}
