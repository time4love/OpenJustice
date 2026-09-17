'use client';

import { useEffect } from 'react';
import { noteRecent, type RecentKind } from '@/lib/recents';

// ---------------------------------------------------------------------------
// THE WRITER — docs/gf-ui-refactor-plan.md §9 :1084–:1085 ("the recents list … written by the pages
// that render a thesis, a page or a record, read by the sidebar"); §10's re-brief lands it.
//
// UI-4b SHIPPED `lib/recents.ts` WITH A READER AND NO CALLER, because every page that would write it
// was KEEP that round, and its own case said so in as many words. This is the caller.
//
// IT IS A COMPONENT AND NOT A CALL IN THE PAGE, for one reason that is not stylistic: the three public
// pages are SERVER components, and `localStorage` exists only in the browser. A page cannot write the
// list during its own render, so the write is a client component the page RENDERS — the same shape as
// `<DeclareTabs>`, which is how the shell already takes a declaration from a server page.
//
// `lib/recents.ts` STAYS PURE AND STAYS KEEP. It keeps its one key, imports nothing, and gains no
// dependency (the researcher, 2026-09-11) — this module depends on IT, never the other way round.
//
// THE LABEL IS PASSED, NEVER DERIVED HERE. Only the page knows what a person recognises the thing by:
// a thesis by its claim's first words. Deriving it from the href would make every caller trustworthy
// separately, and would print an id the day one of them got it wrong (§4 :167–:178).
// ---------------------------------------------------------------------------

export function NoteRecent({ kind, href, label }: { kind: RecentKind; href: string; label: string }) {
  useEffect(() => {
    noteRecent({ kind, href, label });
  }, [kind, href, label]);
  return null;
}
