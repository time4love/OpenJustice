jest.mock('../src/context/AuthContext', () => jest.requireActual<typeof import('./render')>('./render').authContextDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { useState } from 'react';
import { fireEvent } from '@testing-library/react';
import { join, relative } from 'node:path';
import { Sheet } from '@/components/Sheet';
import { renderWithIntl } from './render';
import { FRONTEND, SRC, jsxTagsIn, requireSubjects, sourceFiles } from './scan';

// ---------------------------------------------------------------------------
// sheet-primitive — docs/gf-ui-refactor-plan.md §9 :1073–:1075, :1100–:1101;
// docs/gf-ui-design-session-2026-09-16.md §1.6 (decision 6: ONE Sheet primitive with Escape, a focus trap and
// return-focus serves every sheet and modal).
//
// R56's F1 is what this exists for: `CitationChip.tsx` declared `role="dialog" aria-modal="true"` and
// implemented no Escape and no focus trap at all — markup asserting a modality the component did not have.
// Every design was SILENT on Escape and on `aria-modal`, so nothing written was broken; what was broken was
// the markup's own claim. The primitive makes the claim true in ONE place and this holds it there.
//
// WHAT jsdom CAN SEE: the handler's logic — Escape calling back, focus moved in and returned, the body's
// scroll locked and RESTORED to what it was. WHAT IT CANNOT: a real browser tab order. jsdom's `Tab` key
// event moves nothing, so the wrap case drives focus explicitly; it holds the trap's arithmetic and not the
// browser's behaviour, and the browser's behaviour is read in the step's local run.
// ---------------------------------------------------------------------------

const COMPONENTS = join(SRC, 'components');
const SHEET = 'src/components/Sheet.tsx';

/** A sheet with an opener outside it, which is what return-focus is measured against. */
function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" data-opener onClick={() => setOpen(true)}>
        open
      </button>
      <Sheet
        id="sheet-under-test"
        open={open}
        onClose={() => {
          setOpen(false);
          onClose?.();
        }}
        label="גיליון"
      >
        <button type="button" data-first>
          first
        </button>
        <button type="button" data-last>
          last
        </button>
      </Sheet>
    </div>
  );
}

function openTheSheet(): HTMLElement {
  const { container } = renderWithIntl(<Harness />);
  const opener = container.querySelector<HTMLButtonElement>('[data-opener]');
  if (opener === null) throw new Error('the harness rendered no opener');
  opener.focus();
  fireEvent.click(opener);
  return container;
}

describe('sheet-primitive', () => {
  it('ESCAPE closes it — the behaviour R56 found the citation sheet asserting and not implementing', async () => {
    let closed = 0;
    const { container } = renderWithIntl(<Harness onClose={() => (closed += 1)} />);
    const opener = container.querySelector<HTMLButtonElement>('[data-opener]');
    opener?.focus();
    if (opener !== null) fireEvent.click(opener);
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect({ closed, stillOpen: document.body.querySelector('[role="dialog"]') !== null }).toEqual({ closed: 1, stillOpen: false });
  });

  it('focus moves INTO the sheet when it opens', async () => {
    openTheSheet();
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog?.contains(document.activeElement)).toBe(true);
  });

  it('focus is RETURNED to the opener when it closes — not left on the body', async () => {
    const container = openTheSheet();
    const opener = container.querySelector<HTMLButtonElement>('[data-opener]');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(opener);
  });

  it('the trap wraps: Tab from the last focusable goes to the first, and Shift+Tab from the first to the last', async () => {
    openTheSheet();
    const dialog = document.body.querySelector('[role="dialog"]');
    const first = dialog?.querySelector<HTMLButtonElement>('[data-first]');
    const last = dialog?.querySelector<HTMLButtonElement>('[data-last]');
    last?.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    const afterTab = document.activeElement;
    first?.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    const afterShiftTab = document.activeElement;
    expect({ afterTab: afterTab === first, afterShiftTab: afterShiftTab === last }).toEqual({ afterTab: true, afterShiftTab: true });
  });

  it("the body's scroll is locked while open and RESTORED to what it was — not cleared to ''", async () => {
    document.body.style.overflow = 'scroll';
    const container = openTheSheet();
    const whileOpen = document.body.style.overflow;
    fireEvent.keyDown(document, { key: 'Escape' });
    const afterClose = document.body.style.overflow;
    expect({ whileOpen, afterClose }).toEqual({ whileOpen: 'hidden', afterClose: 'scroll' });
    container.remove();
    document.body.style.overflow = '';
  });

  it('it sets role="dialog" and aria-modal ITSELF, with an accessible name', async () => {
    openTheSheet();
    const dialog = document.body.querySelector('[role="dialog"]');
    expect({
      ariaModal: dialog?.getAttribute('aria-modal'),
      named: (dialog?.getAttribute('aria-label') ?? '').length > 0 || dialog?.hasAttribute('aria-labelledby'),
    }).toEqual({ ariaModal: 'true', named: true });
  });

  it('NO OTHER file under src/components carries role="dialog" or aria-modal — "by it and by nothing else"', () => {
    const offenders = requireSubjects('source files under src/components', sourceFiles(COMPONENTS, ['.ts', '.tsx']))
      .filter((file) => relative(FRONTEND, file) !== SHEET)
      .flatMap((file) =>
        jsxTagsIn(file)
          .filter((tag) => tag.attributes.role === 'dialog' || 'aria-modal' in tag.attributes)
          .map((tag) => `${relative(FRONTEND, file)}:${String(tag.line)} <${tag.tag}>`),
      );
    expect(offenders).toEqual([]);
  });
});
