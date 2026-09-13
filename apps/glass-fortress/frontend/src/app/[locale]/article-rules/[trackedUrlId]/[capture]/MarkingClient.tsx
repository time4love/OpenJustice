'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { authedFetch, authHeaders } from '@/lib/api';
import { Link, usePathname } from '@/i18n/navigation';

// ---------------------------------------------------------------------------
// MARKING — docs/gf-interaction-flows.md, the shared sub-flow, and A6, the
// five routes that are this page's only surface.
//
// THE PAGE DECIDES NOTHING AND APPLIES NOTHING. It shows one capture, inert;
// previews the rules the researcher marks; and hands back a DRAFT. The one
// command the researcher then pastes — `approve_article_rules url=… capture=…`
// — is what promotes the draft to Rule rows and decisions, and the walk is what
// acquires the capture. CORRECT — marking or unmarking with the element under
// the cursor — is the one answer given HERE, from 2026-09-07: CONTINUE, TRUST,
// END and BAD CAPTURE are given in the chat and recorded by resolve_scan_stop,
// because each of them needs a rule's history read out and a page cannot do
// that. On a stop that needs both, marking comes first.
//
// THE REMOVED TEXT, BESIDE THE KEPT TEXT, ALWAYS. Over-matching is the
// dangerous direction and it is invisible in what survives: a rule that
// swallows a paragraph leaves something clean and plausible on screen. The
// removed pane never collapses and never tabs away.
//
// THE CAPTURE IS RENDERED INERT, IN AN EMPTY SANDBOX. `sandbox=""` blocks
// scripts, forms and same-origin access; the backend has already stripped the
// executable content and the self-refresh. Selection happens against the
// OUTLINE the backend derived from the decoded document — a selector is
// chosen from it, never typed — so nothing runs inside the frame, ever.
//
// A DRAFT IS SAVED AS IT IS MADE (returned: false, debounced) so a reload costs
// no marks, and HANDED BACK by the one button (returned: true). Only a
// returned draft can be approved; approve refuses DRAFT_NOT_RETURNED. A draft
// this page holds for ANOTHER capture is shown as such, never adopted, and —
// ruled 2026-09-07 — SUSPENDS THE AUTOSAVE until the researcher says to start
// one here: the page keeps one draft, as A6 gives it, and losing the other
// capture's is an act rather than a side effect of the first click.
//
// THE PAGE EXPLAINS NOTHING ABOUT THE STOP (ruled 2026-09-07, MARKING amended).
// Why the walk stopped is the chat's: Claude names the element to find, by the
// text it begins with, and says whether to mark or unmark it, BEFORE handing
// over this URL — and the conversation continues with the page open, so what is
// unclear here is asked there. A6's GET still carries `stop`, and this page
// reads none of it: a second telling of the stop is the copy that disagrees
// with the chat the day one of them changes, in front of the researcher
// deciding what a rule may take.
// ---------------------------------------------------------------------------

interface OutlineNode {
  selector: string;
  tag: string;
  id: string | null;
  classes: string[];
  textLength: number;
  positional: boolean;
  /** The selector needed a build-hash class to be unique — a name the next build regenerates (A8). */
  hashed: boolean;
  /** The rules in force that match this element, matched in the backend against the real DOM — the page highlights by this, never by comparing selector strings (F1). */
  matchedBy: { ruleId: string; selector: string }[];
  label: string;
  collapsedFrom: string[];
  children: OutlineNode[];
}

interface RuleInForce {
  ruleId: string;
  selector: string;
  trusted: boolean;
}

interface Draft {
  capture: string;
  selectors: string[];
  returnedAt: string | null;
}

/**
 * A6's GET carries the stop; this page READS NONE OF IT (MARKING, amended
 * 2026-09-07). The shape stays typed because the body has it — a page that
 * silently dropped a field from its own view type would hide the day the route
 * stopped sending one.
 */
interface StopGate {
  gate: 0 | 1 | 2 | 4 | 5 | 'DIGEST';
  material: unknown;
}

/** A6's GET body. */
interface CaptureView {
  capture: string;
  snapshotDate: string;
  outcome: string;
  url: string;
  document: string;
  outline: { root: OutlineNode; truncated: boolean; unreachableTextLength: number };
  rulesInForce: RuleInForce[];
  draft: Draft | null;
  stop: { gates: StopGate[] } | null;
}

/** A6's preview body. */
interface Preview {
  keptText: string;
  removedText: string;
  removedSegments: { selector: string; text: string }[];
  matchCounts: Record<string, number>;
}

/** A refusal's body, as every route answers it. */
interface Refusal {
  error?: string;
  code?: string;
}

class SignedOutError extends Error {}

/** How long the tree has to settle before the removed pane is recomputed — a full re-parse server-side. */
const PREVIEW_MS = 350;
/** How long the researcher has to keep clicking before the draft is written. */
const AUTOSAVE_MS = 900;
const OPEN_TO_DEPTH = 2;

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((s) => b.includes(s));

export function MarkingClient({ trackedUrlId, capture }: { trackedUrlId: string; capture: string }) {
  const t = useTranslations('marking');
  const pathname = usePathname();
  const base = `/api/article-rules/pages/${trackedUrlId}`;

  const [view, setView] = useState<CaptureView | null>(null);
  const [selectors, setSelectors] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewFor, setPreviewFor] = useState<string[] | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  /** What the server holds for THIS capture, as of the last write or the load. */
  const [saved, setSaved] = useState<Draft | null>(null);
  const [draftState, setDraftState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  /** The page's draft when it names ANOTHER capture — shown, never adopted. */
  const [otherDraft, setOtherDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  /** The rule the researcher is looking at: its removals and its element are emphasised; a second click clears it. */
  const [focused, setFocused] = useState<string | null>(null);
  /** The researcher reopened the working area after handing the draft back; an edit then un-returns it. */
  const [editingAgain, setEditingAgain] = useState(false);
  /** The toolbox under the canvas, open or folded to its bar; opens by itself when the page has no rule in force. */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [canvas, setCanvas] = useState<'page' | 'text'>('page');
  const [panelOpen, setPanelOpen] = useState(true);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const call = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const res = await authedFetch(path, {
        ...init,
        headers: {
          ...(init?.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...authHeaders(),
          ...init?.headers,
        },
      });
      if (res.status === 204) return undefined as T;
      const body: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const refusal = body as Refusal;
        if (res.status === 401 || res.status === 403) throw new SignedOutError(t('signedOut'));
        if (res.status === 404 && refusal.code === 'NOT_SURVEYED') throw new Error(t('notSurveyed'));
        if (res.status === 404) throw new Error(t('notFound', { capture }));
        if (res.status === 409) throw new Error(t('noBytes', { capture }));
        throw new Error(refusal.error ?? t('offline'));
      }
      return body as T;
    },
    [t, capture],
  );

  const reportError = useCallback(
    (err: unknown) => {
      if (err instanceof SignedOutError) setSignedOut(true);
      else setError(err instanceof Error ? err.message : t('offline'));
    },
    [t],
  );

  // The load. The draft's selectors win when the draft names THIS capture,
  // whatever its returnedAt — reopening is a fresh act of intent and a returned
  // draft can still be corrected; the rules in force otherwise.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await call<CaptureView>(`${base}/captures/${capture}`);
        if (cancelled) return;
        setView(loaded);
        setDrawerOpen(loaded.rulesInForce.length === 0);
        const draft = loaded.draft;
        if (draft !== null && draft.capture === capture) {
          setSelectors(draft.selectors);
          setSaved(draft);
        } else {
          setSelectors(loaded.rulesInForce.map((r) => r.selector));
          if (draft !== null) setOtherDraft(draft);
        }
      } catch (err) {
        if (!cancelled) reportError(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [base, capture, call, reportError]);

  // POST /preview on every edit, PURE. The pane is out of date exactly when the
  // selectors it was computed for are not the ones on screen.
  useEffect(() => {
    if (view === null) return;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const next = await call<Preview>(`${base}/captures/${capture}/preview`, {
            method: 'POST',
            body: JSON.stringify({ selectors }),
          });
          setPreview(next);
          setPreviewFor(selectors);
          setPreviewFailed(false);
        } catch (err) {
          setPreviewFailed(true);
          reportError(err);
        }
      })();
    }, PREVIEW_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [view, selectors, base, capture, call, reportError]);

  const writeDraft = useCallback(
    async (returned: boolean): Promise<void> => {
      setDraftState('saving');
      try {
        const written = await call<Draft>(`${base}/draft`, {
          method: 'PUT',
          body: JSON.stringify({ capture, selectors, returned }),
        });
        setSaved(written);
        setOtherDraft(null);
        setDraftState('saved');
      } catch (err) {
        setDraftState('failed');
        reportError(err);
      }
    },
    [base, capture, selectors, call, reportError],
  );

  // The autosave: returned false, after the researcher stops clicking, and
  // only when the set on screen differs from what the server holds.
  //
  // SUSPENDED WHILE THE PAGE'S DRAFT NAMES ANOTHER CAPTURE (ruled 2026-09-07,
  // shape b). A6 gives the page ONE draft and last write wins, so the first
  // autosave here would replace an unapproved draft for another capture with no
  // act by the researcher — which is what happened on 2026-09-07: a correct
  // 2020 draft was replaced by opening 2022, and its approval then refused
  // DRAFT_NOT_RETURNED. The draft stays one per page and the route is unchanged;
  // what changes is that nothing is written for this capture until the
  // researcher presses `draftSwitchStartHere`, which is an act rather than a
  // side effect of clicking in the tree.
  useEffect(() => {
    if (view === null) return;
    if (otherDraft !== null) return;
    const unchanged = saved !== null && sameSet(saved.selectors, selectors);
    if (unchanged) return;
    if (saved === null && sameSet(selectors, view.rulesInForce.map((r) => r.selector))) return;
    autosaveTimer.current = setTimeout(() => {
      autosaveTimer.current = null;
      void writeDraft(false);
    }, AUTOSAVE_MS);
    return () => {
      if (autosaveTimer.current !== null) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    };
  }, [view, selectors, saved, otherDraft, writeDraft]);

  const handBack = async () => {
    if (autosaveTimer.current !== null) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    setBusy(true);
    await writeDraft(true);
    setBusy(false);
    setEditingAgain(false);
  };

  // The researcher's cancel: DELETE, the log untouched, the page back to the
  // rules in force.
  const cancelDraft = async () => {
    if (view === null) return;
    setBusy(true);
    try {
      await call<undefined>(`${base}/draft`, { method: 'DELETE' });
      setSaved(null);
      setOtherDraft(null);
      setSelectors(view.rulesInForce.map((r) => r.selector));
      setDraftState('idle');
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (selector: string) => {
    const removing = selectors.includes(selector);
    setSelectors((current) => (removing ? current.filter((s) => s !== selector) : [...current, selector]));
    if (removing) setFocused((current) => (current === selector ? null : current));
  };
  const focus = (selector: string) => {
    setFocused((current) => (current === selector ? null : selector));
  };

  const inForce = useMemo(() => new Map((view?.rulesInForce ?? []).map((r) => [r.selector, r])), [view]);
  // WORDS, NOT CODE: the outline's label for every selector it offers, so the
  // draft and the removed pane name an element the way the tree does. A rule
  // whose element is not in this capture's outline — what a redesign looks
  // like — has no label and shows its selector, its only name.
  //
  // AND BY EVERY SELECTOR THAT MATCHES THE NODE, not only the one it OFFERS
  // (2026-09-08). A rule's stored selector and the outline's offered selector
  // are different strings whenever the tier that produced them differs — a 2020
  // rule reading `header.no-mobile-app.css-gf5unx.main-header` against an
  // outline now offering `header.no-mobile-app.main-header` — so a rule that
  // still MATCHES its element was shown by its raw selector, the one thing
  // MARKING says is never its name. `matchedBy` is that relation, computed in
  // the backend against the real DOM (F1), and it is what makes the label reach
  // the rule. The offered selector is set FIRST so it wins where both exist:
  // the node's own name is the tree's, and a matching rule borrows it.
  const labels = useMemo(() => {
    const out = new Map<string, string>();
    const walk = (node: OutlineNode): void => {
      for (const matched of node.matchedBy) out.set(matched.selector, node.label);
      out.set(node.selector, node.label);
      node.children.forEach(walk);
    };
    if (view !== null) walk(view.outline.root);
    return out;
  }, [view]);
  const nameOf = (selector: string): string => labels.get(selector) ?? selector;
  const added = selectors.filter((s) => !inForce.has(s));
  const ended = [...inForce.keys()].filter((s) => !selectors.includes(s));
  const continueAsIs = added.length === 0 && ended.length === 0;

  const returned = saved !== null && saved.returnedAt !== null;
  const returnedThenEdited = returned && !sameSet(saved.selectors, selectors);
  // HANDED BACK: the draft is returned and untouched since, and the researcher
  // has not asked to edit it again — the page shows the command and nothing to
  // edit, as the old page did. Reopening and changing anything un-returns the
  // draft (the autosave writes returned: false), and the command goes until
  // the next save.
  const handedBack = returned && !returnedThenEdited && !editingAgain;
  // BAD CAPTURE is an answer only where the tool accepts it: resolve_scan_stop
  // refuses NOT_PENDING (A5), so the line is shown on a PENDING_JUDGEMENT
  // capture and on no other.
  const skippable = view?.outcome === 'PENDING_JUDGEMENT';
  // THE MOMENT the page is in, read from the GET body (ruled 2026-09-06): no
  // rules and no stop is DEFINING; rules and no stop is CORRECTING a stored
  // capture; a stop is JUDGING and its panel leads.
  const moment: 'momentDefining' | 'momentCorrecting' | null =
    view === null || view.stop !== null ? null : view.rulesInForce.length === 0 ? 'momentDefining' : 'momentCorrecting';
  const approveLine =
    view === null ? '' : `approve_article_rules url=${view.url} capture=${capture}${selectors.length === 0 ? ' rules=0' : ''}`;
  const skipLine = view === null ? '' : `resolve_scan_stop url=${view.url} capture=${capture} BAD_CAPTURE reason=`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(approveLine);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    setTimeout(() => {
      setCopyState('idle');
    }, 4000);
  };

  const signedOutBanner = signedOut && (
    <div className="rounded border-2 border-red-600 bg-red-50 p-3 text-sm text-red-900">
      <p className="font-bold">{view === null ? t('signedOut') : t('sessionExpired')}</p>
      <Link
        href={`/login?returnTo=${encodeURIComponent(pathname)}`}
        className="mt-2 inline-block rounded bg-red-700 px-3 py-1.5 font-semibold text-white hover:bg-red-800"
      >
        {t('signIn')}
      </Link>
    </div>
  );

  if (signedOut && view === null) return <Shell>{signedOutBanner}</Shell>;
  if (error !== null && view === null) return <Shell><p className="text-red-700">{error}</p></Shell>;
  if (view === null) return <Shell><p>{t('loading')}</p></Shell>;

  const previewStale = previewFor === null || !sameSet(previewFor, selectors);

  return (
    <Shell>
      <header>
        <h1 className="text-xl font-bold">{t('captureHeading', { date: view.snapshotDate, capture })}</h1>
        <p className="text-sm text-gray-600">
          {t('pageUrl')} <span dir="ltr">{view.url}</span> · {t('outcome', { outcome: view.outcome })}
        </p>
        {moment !== null && <p className="mt-1 text-sm font-semibold">{t(moment)}</p>}
      </header>

      {signedOutBanner}
      {error !== null && <p className="rounded bg-red-50 p-2 text-sm text-red-800">{error}</p>}


      {otherDraft !== null && (
        <div className="flex flex-wrap items-center gap-3 rounded bg-amber-50 p-2 text-sm text-amber-900">
          <span>{t('otherDraft', { capture: otherDraft.capture })}</span>
          {/*
            THE EXPLICIT START (ruled 2026-09-07, shape b). While this banner is
            up the autosave writes nothing, so the other capture's unapproved
            draft survives every click here. Pressing this clears the banner and
            the autosave resumes as it always did — it writes no draft itself,
            because the write is still the autosave's and still carries whatever
            the researcher has marked by then.
          */}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setOtherDraft(null);
            }}
            className="text-xs font-semibold underline"
          >
            {t('draftSwitchStartHere')}
          </button>
          <button type="button" disabled={busy} onClick={() => void cancelDraft()} className="text-xs underline">
            {t('cancelDraft')}
          </button>
        </div>
      )}

      {handedBack ? (
        /*
          THE FINAL STATE. The draft is handed back: the canvas, the drawer and
          the panel are gone, and what remains is the one command to paste into
          the chat, shown the way a command is shown there — a code block with a
          copy icon. Editing again reopens the page; a change then un-returns
          the draft and the command goes until the next save.
        */
        <section className="mx-auto w-full max-w-3xl">
          <p className="font-semibold">{t('returnedHeading')}</p>
          <p className="text-xs text-gray-600">{t('returnedAt', { time: saved?.returnedAt ?? '' })}</p>
          <CommandBlock command={approveLine} state={copyState} onCopy={() => void copy()} t={t} />
          <p className="mt-1 text-xs text-gray-600">{t('mismatchNote')}</p>
          <ul className="mt-3 text-sm">
            {continueAsIs && <li>{t('answerContinue')}</li>}
            {(added.length > 0 || ended.length > 0) && <li>{t('answerCorrect', { added: added.length, ended: ended.length })}</li>}
          </ul>
          {/*
            WHAT THE APPROVAL DOES TO THE CAPTURE. ONE sentence, not two chosen
            on `outcome`: A2's Q7 makes a stop on a STORED capture
            PENDING_JUDGEMENT with its snapshotId kept, and A6's GET carries
            `outcome` and nothing else — so the page cannot tell "will acquire"
            from "will supersede", and must not pretend to. What is true in every
            case is A3's RESOLVED and A4's skip of all five gates. The three
            answers this command could carry are no longer the page's to explain
            (MARKING, amended 2026-09-07): only CORRECT is given here.
          */}
          <p className="mt-3 text-xs text-gray-600">{t('approveMeaning')}</p>
          <button
            type="button"
            onClick={() => {
              setEditingAgain(true);
            }}
            className="mt-3 text-sm underline"
          >
            {t('editAgain')}
          </button>
        </section>
      ) : (
        <>
          {/*
            THE CANVAS: the captured page, or the transformed text, full width
            and tall at ONE height whichever view is on — what the researcher
            reads. THE TOOLBOX sits UNDER it as a bar that opens into the
            structure and folds back to the bar, so the tree never hides the
            text and folding it brings the text and the removed pane together.
            Ruled 2026-09-06.
          */}
          <section>
            <div role="tablist" className="flex items-center gap-1 border-b border-gray-300">
              {(['page', 'text'] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={canvas === id}
                  onClick={() => {
                    setCanvas(id);
                  }}
                  className={`-mb-px rounded-t border border-b-0 px-3 py-1 text-sm ${
                    canvas === id ? 'border-gray-300 bg-white font-semibold' : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {id === 'page' ? t('renderedHeading') : t('keptHeading')}
                </button>
              ))}
            </div>
            <div className="h-[62vh]">
              {canvas === 'page' ? (
                /* AN EMPTY SANDBOX IS THE PRIMARY DEFENCE; the backend's inert document is the second. */
                <iframe
                  title={t('renderedHeading')}
                  sandbox=""
                  srcDoc={highlighted(view.document, selectors, focused)}
                  className="h-full w-full rounded-b border border-t-0 bg-white"
                />
              ) : (
                <pre
                  className={`h-full overflow-auto whitespace-pre-wrap rounded-b border border-t-0 p-2 text-sm ${previewStale ? 'opacity-50' : ''}`}
                >
                  {preview?.keptText ?? ''}
                </pre>
              )}
            </div>
          </section>

          <section className="rounded border border-gray-400">
            <button
              type="button"
              onClick={() => {
                setDrawerOpen((v) => !v);
              }}
              aria-expanded={drawerOpen}
              title={drawerOpen ? t('collapseToolbox') : t('expandToolbox')}
              className="flex w-full items-center gap-2 bg-gray-100 px-3 py-2 text-start"
            >
              <ToolboxIcon />
              <span className="font-semibold">{t('outlineHeading')}</span>
              <span className="text-xs text-gray-600">{t('outlineNote')}</span>
              <span className="ms-auto" aria-hidden="true">
                {drawerOpen ? '▾' : '▸'}
              </span>
            </button>
            {drawerOpen && (
              <div>
                {view.outline.truncated && (
                  <p className="px-2 pt-1 text-xs text-amber-800">{t('outlineTruncated', { chars: view.outline.unreachableTextLength })}</p>
                )}
                <div className="h-[40vh] overflow-auto p-2 text-sm">
                  <Outline
                    node={view.outline.root}
                    depth={0}
                    documentTextLength={view.outline.root.textLength}
                    selected={selectors}
                    preview={previewStale ? null : preview}
                    disabled={busy}
                    coveredBy={null}
                    onToggle={toggle}
                    t={t}
                  />
                </div>
              </div>
            )}
          </section>

          <MarkedPanel
            nameOf={nameOf}
            selectors={selectors}
            ended={ended}
            inForce={inForce}
            preview={preview}
            pending={previewStale}
            failed={previewFailed}
            focused={focused}
            open={panelOpen}
            disabled={busy}
            onToggleOpen={() => {
              setPanelOpen((v) => !v);
            }}
            onFocus={focus}
            onRemove={toggle}
            onRestore={toggle}
            t={t}
          />

          {/* THE ANSWER ROW, pinned: what will be sent, and the one button that sends it. */}
          <section className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded border-2 border-gray-800 bg-white p-3">
            <div className="text-sm">
              {continueAsIs && <span>{t('answerContinue')}</span>}
              {(added.length > 0 || ended.length > 0) && <span>{t('answerCorrect', { added: added.length, ended: ended.length })}</span>}
              <span className="ms-2 text-xs text-gray-600">
                {draftState === 'saving' && t('draftSaving')}
                {draftState === 'saved' && !returned && t('draftSaved')}
                {draftState === 'failed' && t('draftSaveFailed')}
              </span>
              {returnedThenEdited && <span className="ms-2 text-xs font-semibold text-amber-900">{t('returnedThenEdited')}</span>}
            </div>
            <div className="flex items-center gap-3">
              {saved !== null && (
                <button type="button" disabled={busy} onClick={() => void cancelDraft()} className="text-sm underline">
                  {t('cancelDraft')}
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void handBack()}
                className="rounded bg-gray-900 px-4 py-2 font-semibold text-white hover:bg-black disabled:opacity-50"
              >
                {busy ? t('saving') : t('save')}
              </button>
            </div>
          </section>

          {skippable && (
            <section className="text-sm text-gray-700">
              <h2 className="font-semibold">{t('badCaptureHeading')}</h2>
              <p>{t('badCaptureNote')}</p>
              <code dir="ltr" className="select-all rounded bg-gray-100 px-2 py-1">
                {skipLine}
              </code>
            </section>
          )}
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="flex w-full flex-col gap-3 p-4">{children}</main>;
}

function ToolboxIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" />
    </svg>
  );
}

/** A command the way the chat shows one: a dark block, left to right, a copy icon at its corner. */
function CommandBlock({
  command,
  state,
  onCopy,
  t,
}: {
  command: string;
  state: 'idle' | 'copied' | 'failed';
  onCopy: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div dir="ltr" className="relative mt-2 rounded-lg bg-gray-900 p-4 pe-14 font-mono text-sm text-gray-100">
      <code className="select-all whitespace-pre-wrap break-all">{command}</code>
      <button
        type="button"
        onClick={onCopy}
        title={t('copy')}
        aria-label={t('copy')}
        className="absolute end-2 top-2 flex items-center gap-1 rounded border border-gray-600 px-2 py-1 text-xs text-gray-200 hover:bg-gray-800"
      >
        {state === 'copied' ? (
          <>
            <span aria-hidden="true">✓</span> {t('copied')}
          </>
        ) : state === 'failed' ? (
          t('copyFailed')
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="9" y="9" width="12" height="12" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
        )}
      </button>
    </div>
  );
}


/**
 * The structure, to click. A selector is chosen HERE and nowhere else — never
 * typed — so every rule the page hands back is one the outline offered.
 */
function Outline({
  node,
  depth,
  documentTextLength,
  selected,
  preview,
  disabled,
  coveredBy,
  onToggle,
  t,
}: {
  node: OutlineNode;
  depth: number;
  documentTextLength: number;
  selected: string[];
  preview: Preview | null;
  disabled: boolean;
  /**
   * The label of the nearest MARKED ancestor, or null. A rule against a node
   * under one removes nothing — the ancestor's rule already takes the whole
   * subtree — so the node is NOT A CHOICE and must not be offerable.
   *
   * The same sentence `documentOutline` already applies to a node with no text:
   * "a node that can never affect the derived text, and therefore is not a
   * choice". It was applied to the EMPTY class and not to the COVERED one, and
   * the gap cost a live marking: on rtmag 20220821171223 the researcher clicked
   * children of blocks they had already marked and created eleven rules that
   * could remove nothing (2026-09-12).
   *
   * DISABLED HERE RATHER THAN OMITTED, which is the opposite of the empty-node
   * choice and deliberately so. An empty node is noise — 36 blank `<script>`
   * tags above Walla's article. A covered node carries REAL TEXT the researcher
   * needs to see to check that the ancestor takes the right things, and a
   * subtree that vanished on marking its parent and reappeared on unmarking it
   * would make that check impossible.
   */
  coveredBy: string | null;
  onToggle: (selector: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [open, setOpen] = useState(depth < OPEN_TO_DEPTH);
  // THE SELECTOR THIS NODE STANDS FOR: a selected rule that MATCHES the element
  // (matched in the backend against the real DOM) owns it, whatever string the
  // outline would offer today — so a hashed rule still shows on the element it
  // removes, and a click unmarks THAT rule rather than adding a second one (F1).
  const owning = node.matchedBy.map((r) => r.selector).find((s) => selected.includes(s));
  const effective = owning ?? node.selector;
  const isSelected = selected.includes(effective);
  const count = preview?.matchCounts[effective];
  // MARKING THE WHOLE DOCUMENT IS NOT A FURNITURE RULE, it is "delete the page".
  // Judged by TEXT rather than by depth, so a body with one all-containing
  // wrapper is refused too.
  const wholeDocument = node.textLength >= documentTextLength;
  // COVERED: an ancestor's rule already removes this element with its subtree.
  const covered = coveredBy !== null;
  // REDUNDANT: this node IS marked, its selector matches the element, and the
  // derivation removed no text under it — because an ancestor's rule took it
  // first. Since `matchCounts` became order-independent it reports the honest
  // count (the element IS on the page), so "matched nothing" no longer tells a
  // researcher that a rule of theirs is doing nothing. `removedSegments` is
  // what says it, and this is where it gets said.
  const redundant =
    isSelected &&
    preview !== null &&
    (count ?? 0) > 0 &&
    !preview.removedSegments.some((segment) => segment.selector === effective);

  return (
    <div className={depth === 0 ? '' : 'ps-3'}>
      <div className="flex items-start gap-1 py-0.5">
        {node.children.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              setOpen((v) => !v);
            }}
            aria-label={open ? t('collapse') : t('expand')}
            aria-expanded={open}
            className="w-4 shrink-0 text-gray-500"
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <button
          type="button"
          disabled={disabled || wholeDocument || covered}
          onClick={() => {
            onToggle(effective);
          }}
          title={
            wholeDocument
              ? t('wholeDocument')
              : covered
                ? t('coveredWhy', { label: coveredBy })
                : node.collapsedFrom.length > 0
                  ? `${node.selector}\n${t('collapsedFrom', { selectors: node.collapsedFrom.join(' › ') })}`
                  : node.selector
          }
          className={`min-w-0 text-start ${isSelected ? 'bg-amber-100 font-semibold' : ''} ${wholeDocument || covered ? 'cursor-not-allowed text-gray-400' : ''}`}
        >
          {/* WORDS, NOT CODE: the label and the character count — what a click removes. The selector is the tooltip. */}
          <span>{node.label}</span> <span className="text-gray-500">({node.textLength})</span>
          {node.positional && (
            <span className="ms-1 cursor-help text-xs text-amber-800" title={t('positionalWhy')}>
              {t('positional')}
            </span>
          )}
          {node.hashed && (
            <span className="ms-1 cursor-help text-xs text-amber-800" title={t('hashedWhy')}>
              {t('hashed')}
            </span>
          )}
          {covered && <span className="ms-1 text-xs text-gray-500">{t('covered', { label: coveredBy })}</span>}
          {redundant && <span className="ms-1 text-xs text-amber-800">{t('redundant')}</span>}
          {count !== undefined && isSelected && !redundant && (
            <span className="ms-1 text-xs text-gray-600">{count === 0 ? t('matchedNothing') : t('matched', { count })}</span>
          )}
        </button>
      </div>
      {open &&
        node.children.map((child) => (
          <Outline
            key={child.selector}
            node={child}
            depth={depth + 1}
            documentTextLength={documentTextLength}
            selected={selected}
            preview={preview}
            disabled={disabled}
            // ONCE COVERED, COVERED ALL THE WAY DOWN: the nearest marked
            // ancestor keeps its name for the whole subtree beneath it.
            coveredBy={isSelected ? node.label : coveredBy}
            onToggle={onToggle}
            t={t}
          />
        ))}
    </div>
  );
}

/**
 * THE DRAFT AND ITS EVIDENCE, one list: every rule marked, with the text it
 * removed under it. The removed text is the evidence of over-matching and it
 * sits here, under the rule, never in a tab. The panel keeps its height and
 * scrolls; its bar counts the rules and the characters they remove, and the
 * panel folds to that bar.
 *
 * The trust tick is offered only on a rule already IN FORCE: trust belongs to
 * the judging moment, after a rule's removals have been seen more than once;
 * a rule created in this draft is not offered it (ruled 2026-09-06).
 */
function MarkedPanel({
  nameOf,
  selectors,
  ended,
  inForce,
  preview,
  pending,
  failed,
  focused,
  open,
  disabled,
  onToggleOpen,
  onFocus,
  onRemove,
  onRestore,
  t,
}: {
  nameOf: (selector: string) => string;
  selectors: string[];
  ended: string[];
  inForce: Map<string, RuleInForce>;
  preview: Preview | null;
  pending: boolean;
  failed: boolean;
  focused: string | null;
  open: boolean;
  disabled: boolean;
  onToggleOpen: () => void;
  onFocus: (selector: string) => void;
  onRemove: (selector: string) => void;
  onRestore: (selector: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const firstFocused = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    firstFocused.current?.scrollIntoView({ block: 'nearest' });
  }, [focused]);
  const removedBy = (selector: string): string[] =>
    (preview?.removedSegments ?? []).filter((s) => s.selector === selector).map((s) => s.text);
  const chars = preview?.removedText.length ?? 0;
  const empty = selectors.length === 0 && ended.length === 0;
  return (
    <section className="rounded border border-amber-400">
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={open}
        className="flex w-full items-center gap-2 bg-amber-50 px-3 py-2 text-start"
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span className="font-semibold">{t('markedHeading')}</span>
        <span className="text-sm text-gray-700">{empty ? t('markedEmpty') : t('markedBar', { rules: selectors.length, chars })}</span>
        {failed && <span className="text-sm text-red-700">{t('previewFailed')}</span>}
        {pending && !failed && !empty && <span className="text-xs text-gray-600">{t('previewPending')}</span>}
      </button>
      {open && !empty && (
        <ul className={`flex h-[32vh] flex-col gap-2 overflow-auto p-2 text-sm ${pending ? 'opacity-50' : ''}`}>
          {selectors.map((selector) => {
            const rule = inForce.get(selector);
            const count = pending ? undefined : preview?.matchCounts[selector];
            const locked = rule?.trusted === true;
            const isFocused = focused === selector;
            return (
              <li
                key={selector}
                ref={isFocused ? firstFocused : null}
                className={`rounded border p-2 ${isFocused ? 'border-amber-600 bg-amber-100 ring-2 ring-amber-500' : 'border-amber-200 bg-white'}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onFocus(selector);
                    }}
                    title={`${t('focusRule')}\n${selector}`}
                    className="text-start font-semibold"
                  >
                    {nameOf(selector)}
                  </button>
                  <span className="text-xs text-gray-600">{rule === undefined ? t('newRule') : t('inForce')}</span>
                  {count === undefined ? null : count === 0 ? (
                    <span className="text-xs text-amber-800">{t('matchedNothing')}</span>
                  ) : (
                    <span className="text-xs text-gray-600">{t('matched', { count })}</span>
                  )}
                  {locked && <span className="text-xs text-green-800">{t('trustLocked')}</span>}
                  <button type="button" disabled={disabled} onClick={() => { onRemove(selector); }} className="ms-auto text-xs underline">
                    {t('remove')}
                  </button>
                </div>
                {/* EACH BLOCK IS THE RULE THAT REMOVED IT: clicking it focuses that rule, here and on the canvas. */}
                {removedBy(selector).map((text, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      onFocus(selector);
                    }}
                    title={`${t('focusBlock')}\n${selector}`}
                    className="mt-1 block w-full whitespace-pre-wrap border-s-2 border-amber-300 ps-2 text-start text-gray-800 hover:bg-amber-50"
                  >
                    {text}
                  </button>
                ))}
              </li>
            );
          })}
          {ended.map((selector) => (
            <li key={selector} className="flex flex-wrap items-center gap-2 rounded border border-gray-200 p-2 text-gray-500">
              <span className="line-through" title={selector}>
                {nameOf(selector)}
              </span>
              <span className="text-xs">{t('willEnd')}</span>
              <button type="button" disabled={disabled} onClick={() => { onRestore(selector); }} className="ms-auto text-xs underline">
                {t('restore')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The inert document with the marked elements outlined, the focused one
 * heavier. One rule per selector, so one selector the parser refuses does not
 * silence the others; nothing here runs, and a selector carrying markup is
 * dropped rather than injected.
 *
 * THE DESCENDANTS ARE TINTED TOO (2026-09-08). An element whose children all
 * float has no box of its own, so an outline on it paints a line of zero height
 * and the researcher sees NOTHING where they just marked — the mark is real,
 * the feedback is absent, and the only way to tell is the removed pane. Tinting
 * `${s} > *` puts the colour where the content actually is. Tint only, no second
 * outline: an outline per child would draw a box around every one of them and
 * read as many marks instead of one.
 */
function highlighted(html: string, selectors: readonly string[], focused: string | null): string {
  const safe = selectors.filter((s) => !/[<>{}]/.test(s));
  if (safe.length === 0) return html;
  const rules = safe.map(
    (s) =>
      `${s}{outline:3px solid #d97706 !important;outline-offset:-3px !important;background:rgba(217,119,6,.18) !important;}` +
      `${s} > *{background:rgba(217,119,6,.18) !important;}`,
  );
  if (focused !== null && safe.includes(focused)) {
    rules.push(`${focused}{outline:5px solid #b91c1c !important;background:rgba(185,28,28,.22) !important;}`);
  }
  return `${html}<style>${rules.join('')}</style>`;
}
