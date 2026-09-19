import { DeclareTabs } from '@/components/shell/RightPane';

/**
 * A FIXTURE PAGE that declares two right-pane tabs — docs/gf-ui-refactor-plan.md §9 :1068–:1069, :1088.
 *
 * Hand-written from the appendix, never from a live body (plan §4 :880–:883). No route declares a tab at UI-4b —
 * UI-5's re-brief lands the first ones (§10 :1124) — so the tab mechanism has no caller in `src/` this step and
 * this fixture is its only exercise.
 */
export default function PageWithTwoTabs() {
  return (
    <main>
      <DeclareTabs
        tabs={[
          { id: 'record', label: 'corona.health.gov.il · 5.8.2022', content: <p>the record</p> },
          { id: 'call', label: 'פניות לציבור', content: <p>the call</p> },
        ]}
      />
      <h1>the centre</h1>
    </main>
  );
}
