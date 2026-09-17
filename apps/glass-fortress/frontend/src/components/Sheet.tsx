'use client';

import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// ---------------------------------------------------------------------------
// THE ONE SHEET PRIMITIVE — docs/gf-ui-refactor-plan.md §9 :1073–:1075; design session §1.6, decision 6
// ("ONE Sheet primitive with Escape, a focus trap and return-focus serves every sheet and modal").
//
// R56's F1 is why this exists. `CitationChip.tsx` rendered `role="dialog" aria-modal="true"` and implemented
// no Escape, no focus trap and no scroll lock: markup asserting a modality the component did not have, which
// a real Escape on staging disproved in one keystroke. Every design was silent on Escape and on `aria-modal`,
// so no written clause was broken — what was broken was the markup's own claim. Four behaviours are therefore
// implemented HERE, once, and `role="dialog"` and `aria-modal` are set by this file and by nothing else
// (`test/sheetPrimitive.test.tsx`, which scans every other file under `components/` for both attributes).
//
// IT IS PORTALLED TO THE DOCUMENT, and that is not only about stacking: a chip sits INLINE inside a paragraph
// of the researcher's text, and a sheet rendered there would be a block inside a `<p>`, which the browser
// re-parents and React then cannot hydrate (R55's defect, held by `test/validNesting.test.tsx`).
// ---------------------------------------------------------------------------

/** Anything a browser can focus inside the sheet. `[tabindex="-1"]` is excluded: it is a target, not a stop. */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface SheetProps {
  /** The dialog's id, so the control that opened it can name it with `aria-controls`. */
  id: string;
  open: boolean;
  onClose: () => void;
  /** The sheet's accessible name, or the id of the element that carries it. One of the two is required. */
  label?: string;
  labelledBy?: string;
  className?: string;
  children: ReactNode;
}

export function Sheet({ id, open, onClose, label, labelledBy, className, children }: SheetProps) {
  const dialog = useRef<HTMLDivElement | null>(null);
  /** Whatever had focus when the sheet opened — what focus is RETURNED to, rather than to the body. */
  const opener = useRef<Element | null>(null);

  const focusable = useCallback((): HTMLElement[] => {
    return [...(dialog.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
  }, []);

  // ESCAPE CLOSES, and TAB IS TRAPPED while it is open. Both are listened for on the document, because focus
  // may legitimately sit on the dialog's own container, which is not a child of any of its stops.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const stops = focusable();
      const first = stops.at(0);
      const last = stops.at(-1);
      if (first === undefined || last === undefined) return;
      // The wrap is explicit in BOTH directions: without it, Tab from the last stop leaves the dialog for the
      // page behind it, which is exactly what `aria-modal` promises a reader it will not do.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, focusable]);

  // FOCUS MOVES IN on open and is RETURNED on close; the BODY'S SCROLL is locked and RESTORED to whatever it
  // was — never cleared to '', which would silently unlock a page that had been locked by something else.
  useEffect(() => {
    if (!open) return undefined;
    opener.current = document.activeElement;
    const overflowBefore = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (focusable().at(0) ?? dialog.current)?.focus();
    return () => {
      document.body.style.overflow = overflowBefore;
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [open, focusable]);

  // A server render has no document; `open` is false until the reader presses, which is after hydration.
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      id={id}
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label={labelledBy === undefined ? label : undefined}
      aria-labelledby={labelledBy}
      tabIndex={-1}
      className={`sheet space-y-2 p-4 ${className ?? ''}`.trim()}
    >
      {children}
    </div>,
    document.body,
  );
}
