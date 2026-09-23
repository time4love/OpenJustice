// ---------------------------------------------------------------------------
// THE DIALOG ROUTES — docs/gf-ui-flows.md §1 :39, RULED 2026-09-22 at board י2: a DIALOG renders WITHOUT THE
// SHELL, and the ruling binds both dialogs of the class — the marking page and the upload dialog. "One branch in
// the shell keyed on the dialog routes": this is the ONE list that branch reads.
//
// A PATH IS A DIALOG BY ITS FIRST SEGMENT, EXACTLY — `/upload` and `/article-rules/…`, never a path that merely
// begins with the same letters. `label` is the message key of the name drawn beside the site's on the one top
// line (board י2 draws „העלאת מסמך"); `null` where no board draws one — the marking page's.
// ---------------------------------------------------------------------------

export interface DialogRoute {
  segment: string;
  label: 'upload.title' | null;
}

export const DIALOG_ROUTES: readonly DialogRoute[] = [
  { segment: 'article-rules', label: null },
  { segment: 'upload', label: 'upload.title' },
];

/** The dialog a locale-free path (`/upload`, `/article-rules/p/2022…`) belongs to, or null for every other page. */
export function dialogOf(pathname: string): DialogRoute | null {
  const first = pathname.split('/').find((part) => part !== '');
  return DIALOG_ROUTES.find((route) => route.segment === first) ?? null;
}
