jest.mock('../src/context/AuthContext', () => jest.requireActual<typeof import('./render')>('./render').authContextDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { Shell } from '@/components/shell/Shell';
import { DeclareTabs } from '@/components/shell/RightPane';
import { renderWithIntl, setAuthState, setPathname } from './render';

// ---------------------------------------------------------------------------
// THE SHELL'S DIALOG BRANCH — docs/gf-ui-flows.md §1 :39, RULED 2026-09-22 at board י2: "a DIALOG renders WITHOUT
// THE SHELL — no sidebar, no right pane, the site's name as one line and the dialog alone … This binds BOTH
// dialogs of the class: the marking page … and the upload dialog … One branch in the shell keyed on the dialog
// routes."
//
// IT RE-CHROMES THE LANDED MARKING PAGE, and that is the ruling's own words, not a side effect: the marking page
// loses the sidebar and the pane it has had since UI-4b. A read-view route keeps both.
// ---------------------------------------------------------------------------

const NAME = 'צדק לעם - תיק הקורונה';

function renderAt(path: string) {
  setPathname(path);
  return renderWithIntl(
    <Shell>
      <DeclareTabs tabs={[{ id: 'record', label: 'רשומה', content: <p>pane</p> }]} />
      <p data-page>the page</p>
    </Shell>,
    { locale: 'he' },
  );
}

beforeEach(() => {
  setAuthState('approved-researcher');
});
afterEach(() => {
  setAuthState(undefined);
  setPathname(undefined);
  window.localStorage.clear();
});

// The marking page's line carries the site's name ALONE: board י2 draws the upload dialog's label beside the name,
// no board draws the marking page's, and a new Hebrew label is the researcher's to rule (batched, not invented).
describe.each([
  ['the UPLOAD dialog', '/he/upload', `${NAME}העלאת מסמך`],
  ['the MARKING page', '/he/article-rules/page-1/20220805053301', NAME],
])('%s renders WITHOUT the shell (ui §1 :39)', (_name, path, line) => {
  it('no sidebar, no pane, no ☰ — the site’s name as ONE line, and the page alone', () => {
    const { container } = renderAt(path);
    expect(container.querySelector('[data-shell-region="sidebar"]')).toBeNull();
    expect(container.querySelector('[data-shell-region="pane"]')).toBeNull();
    expect(container.querySelector('nav')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
    const topbar = container.querySelector('[data-dialog-topbar]');
    expect(topbar?.textContent).toBe(line);
    // The name is TEXT, never a link — a dialog is not a place to navigate from.
    expect(topbar?.querySelector('a')).toBeNull();
    expect(container.querySelector('[data-page]')?.textContent).toBe('the page');
  });

  it('the frame and its content box carry the SCROLL contract — `.dialog-frame` and `.dialog-body` (R78 chunk-3 r3)', () => {
    const { container } = renderAt(path);
    const page = container.querySelector('[data-page]');
    // The content box is the page's nearest `.dialog-body`, and it sits inside the one `.dialog-frame`.
    const body = page?.closest('.dialog-body') ?? null;
    expect(body).not.toBeNull();
    expect(body?.parentElement?.classList.contains('dialog-frame')).toBe(true);
    expect(container.querySelectorAll('.dialog-frame')).toHaveLength(1);
  });
});

describe('a READ-VIEW route keeps the shell — the branch is keyed on the dialog routes and on nothing else', () => {
  it('/he/research draws the sidebar and the page', () => {
    const { container } = renderAt('/he/research');
    expect(container.querySelector('[data-shell-region="sidebar"]')).not.toBeNull();
    expect(container.querySelector('[data-dialog-topbar]')).toBeNull();
  });

  it('a path that merely BEGINS with a dialog’s word is not a dialog — /he/uploads keeps the shell', () => {
    const { container } = renderAt('/he/uploads');
    expect(container.querySelector('[data-shell-region="sidebar"]')).not.toBeNull();
  });
});
