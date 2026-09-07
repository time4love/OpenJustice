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
// acquires the capture. Whichever of the three answers it was, CONTINUE (an
// unchanged draft), CORRECT (changed selectors) or TRUST (newly ticked rules),
// it is the same button and the same command. BAD CAPTURE is not a draft and
// not on this page: the page names the command to paste instead.
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
// this page holds for ANOTHER capture is shown as such and never adopted.
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
  trusted: string[];
  returnedAt: string | null;
}

type Gate = 0 | 1 | 2 | 4 | 5 | 'DIGEST';

interface StopGate {
  gate: Gate;
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
  /** Selectors ticked for trust IN THIS DRAFT — already-trusted rules are not among them (ruled 2026-09-05). */
  const [ticked, setTicked] = useState<string[]>([]);
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
  /** The interim trust section, folded by default — opened only when a stop has named a rule (ruled 2026-09-06). */
  const [trustOpen, setTrustOpen] = useState(false);
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
          setTicked(draft.trusted);
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
          body: JSON.stringify({ capture, selectors, trusted: ticked, returned }),
        });
        setSaved(written);
        setOtherDraft(null);
        setDraftState('saved');
      } catch (err) {
        setDraftState('failed');
        reportError(err);
      }
    },
    [base, capture, selectors, ticked, call, reportError],
  );

  // The autosave: returned false, after the researcher stops clicking, and
  // only when the set on screen differs from what the server holds.
  useEffect(() => {
    if (view === null) return;
    const unchanged = saved !== null && sameSet(saved.selectors, selectors) && sameSet(saved.trusted, ticked);
    if (unchanged) return;
    if (saved === null && sameSet(selectors, view.rulesInForce.map((r) => r.selector)) && ticked.length === 0) return;
    autosaveTimer.current = setTimeout(() => {
      autosaveTimer.current = null;
      void writeDraft(false);
    }, AUTOSAVE_MS);
    return () => {
      if (autosaveTimer.current !== null) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    };
  }, [view, selectors, ticked, saved, writeDraft]);

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
      setTicked([]);
      setDraftState('idle');
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  };

  // Unmarking a rule takes its trust tick with it: a trust names a rule in
  // the draft, and this one is leaving it.
  const toggle = (selector: string) => {
    const removing = selectors.includes(selector);
    setSelectors((current) => (removing ? current.filter((s) => s !== selector) : [...current, selector]));
    if (removing) {
      setTicked((current) => current.filter((s) => s !== selector));
      setFocused((current) => (current === selector ? null : current));
    }
  };
  const focus = (selector: string) => {
    setFocused((current) => (current === selector ? null : selector));
  };
  const untick = (selector: string) => {
    setTicked((current) => current.filter((s) => s !== selector));
  };
  const tick = (selector: string) => {
    setTicked((current) => (current.includes(selector) ? current : [...current, selector]));
  };

  const inForce = useMemo(() => new Map((view?.rulesInForce ?? []).map((r) => [r.selector, r])), [view]);
  // WORDS, NOT CODE: the outline's label for every selector it offers, so the
  // draft and the removed pane name an element the way the tree does. A rule
  // whose element is not in this capture's outline — what a redesign looks
  // like — has no label and shows its selector, its only name.
  const labels = useMemo(() => {
    const out = new Map<string, string>();
    const walk = (node: OutlineNode): void => {
      out.set(node.selector, node.label);
      node.children.forEach(walk);
    };
    if (view !== null) walk(view.outline.root);
    return out;
  }, [view]);
  const nameOf = (selector: string): string => labels.get(selector) ?? selector;
  const added = selectors.filter((s) => !inForce.has(s));
  const ended = [...inForce.keys()].filter((s) => !selectors.includes(s));
  const continueAsIs = added.length === 0 && ended.length === 0 && ticked.length === 0;

  const returned = saved !== null && saved.returnedAt !== null;
  const returnedThenEdited = returned && !(sameSet(saved.selectors, selectors) && sameSet(saved.trusted, ticked));
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

      {view.stop !== null && <StopPanel gates={view.stop.gates} t={t} />}

      {otherDraft !== null && (
        <div className="flex flex-wrap items-center gap-3 rounded bg-amber-50 p-2 text-sm text-amber-900">
          <span>{t('otherDraft', { capture: otherDraft.capture })}</span>
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
            {ticked.length > 0 && <li>{t('answerTrust', { count: ticked.length })}</li>}
          </ul>
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
            ticked={ticked}
            preview={preview}
            pending={previewStale}
            failed={previewFailed}
            focused={focused}
            open={panelOpen}
            trustOpen={trustOpen}
            disabled={busy}
            onToggleOpen={() => {
              setPanelOpen((v) => !v);
            }}
            onToggleTrust={() => {
              setTrustOpen((v) => !v);
            }}
            onFocus={focus}
            onRemove={toggle}
            onRestore={toggle}
            onTick={tick}
            onUntick={untick}
            t={t}
          />

          {/* THE ANSWER ROW, pinned: what will be sent, and the one button that sends it. */}
          <section className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded border-2 border-gray-800 bg-white p-3">
            <div className="text-sm">
              {continueAsIs && <span>{t('answerContinue')}</span>}
              {(added.length > 0 || ended.length > 0) && <span>{t('answerCorrect', { added: added.length, ended: ended.length })}</span>}
              {ticked.length > 0 && <span> · {t('answerTrust', { count: ticked.length })}</span>}
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
 * The gates that stopped the walk here, with their material — A5's shapes,
 * rendered as facts: nothing on this page concludes anything from them.
 */
function StopPanel({ gates, t }: { gates: StopGate[]; t: ReturnType<typeof useTranslations> }) {
  return (
    <section className="rounded border-2 border-amber-500 bg-amber-50 p-3 text-sm">
      <h2 className="font-semibold">{t('stopHeading')}</h2>
      <ul className="mt-1 flex flex-col gap-2">
        {gates.map((fired, index) => (
          <li key={index}>
            <GateLine fired={fired} t={t} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function GateLine({ fired, t }: { fired: StopGate; t: ReturnType<typeof useTranslations> }) {
  const m = fired.material as Record<string, unknown>;
  const list = (value: unknown): string[] => (Array.isArray(value) ? value.map((v) => String(v)) : []);
  const removals = (value: unknown): { text: string; selector?: string; ruleId?: string | null }[] =>
    Array.isArray(value) ? (value as { text: string; selector?: string; ruleId?: string | null }[]) : [];
  switch (fired.gate) {
    case 0:
      return <p>{t('gate0')}</p>;
    case 1:
      return (
        <div>
          <p className="font-semibold">{m['against'] === 'OWN_PREVIOUS_TEXT' ? t('gate1Own') : t('gate1Predecessor')}</p>
          <Segments heading={t('nowRemoved')} items={removals(m['nowRemoved']).map((r) => r.text)} />
          <Segments heading={t('nowKept')} items={list(m['nowKept'])} />
        </div>
      );
    case 2:
      return (
        <div>
          <p className="font-semibold">{t('gate2')}</p>
          <ul className="ms-4 list-disc">
            {(Array.isArray(m['rules']) ? (m['rules'] as { selector: string; matchedOnPredecessor: number }[]) : []).map((r) => (
              <li key={r.selector}>
                <code dir="ltr">{r.selector}</code> — {t('silentRules', { count: r.matchedOnPredecessor })}
              </li>
            ))}
          </ul>
        </div>
      );
    case 4:
      return (
        <div>
          <p className="font-semibold">{t('gate4')}</p>
          <p className="text-xs">{t('unseenRemovals')}</p>
          <ul className="ms-4 list-disc">
            {removals(m['removals']).map((r, i) => (
              <li key={i}>
                <code dir="ltr">{r.selector}</code>: <span className="whitespace-pre-wrap">{r.text}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    case 5:
      return (
        <div>
          <p className="font-semibold">{t('gate5')}</p>
          <p>
            {t('verdictReason')}: {String(m['reason'] ?? '')}
          </p>
        </div>
      );
    default:
      return (
        <p className="font-semibold">
          {t('gateDigest')} <code dir="ltr">{String(m['expected'] ?? '')} ≠ {String(m['got'] ?? '')}</code>
        </p>
      );
  }
}

function Segments({ heading, items }: { heading: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs">{heading}</p>
      <ul className="ms-4 list-disc">
        {items.map((text, i) => (
          <li key={i} className="whitespace-pre-wrap">
            {text}
          </li>
        ))}
      </ul>
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
  onToggle,
  t,
}: {
  node: OutlineNode;
  depth: number;
  documentTextLength: number;
  selected: string[];
  preview: Preview | null;
  disabled: boolean;
  onToggle: (selector: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [open, setOpen] = useState(depth < OPEN_TO_DEPTH);
  const isSelected = selected.includes(node.selector);
  const count = preview?.matchCounts[node.selector];
  // MARKING THE WHOLE DOCUMENT IS NOT A FURNITURE RULE, it is "delete the page".
  // Judged by TEXT rather than by depth, so a body with one all-containing
  // wrapper is refused too.
  const wholeDocument = node.textLength >= documentTextLength;

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
          disabled={disabled || wholeDocument}
          onClick={() => {
            onToggle(node.selector);
          }}
          title={
            wholeDocument
              ? t('wholeDocument')
              : node.collapsedFrom.length > 0
                ? `${node.selector}\n${t('collapsedFrom', { selectors: node.collapsedFrom.join(' › ') })}`
                : node.selector
          }
          className={`min-w-0 text-start ${isSelected ? 'bg-amber-100 font-semibold' : ''} ${wholeDocument ? 'cursor-not-allowed text-gray-400' : ''}`}
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
          {count !== undefined && isSelected && (
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
  ticked,
  preview,
  pending,
  failed,
  focused,
  open,
  trustOpen,
  disabled,
  onToggleOpen,
  onToggleTrust,
  onFocus,
  onRemove,
  onRestore,
  onTick,
  onUntick,
  t,
}: {
  nameOf: (selector: string) => string;
  selectors: string[];
  ended: string[];
  inForce: Map<string, RuleInForce>;
  ticked: string[];
  preview: Preview | null;
  pending: boolean;
  failed: boolean;
  focused: string | null;
  open: boolean;
  trustOpen: boolean;
  disabled: boolean;
  onToggleOpen: () => void;
  onToggleTrust: () => void;
  onFocus: (selector: string) => void;
  onRemove: (selector: string) => void;
  onRestore: (selector: string) => void;
  onTick: (selector: string) => void;
  onUntick: (selector: string) => void;
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
  /** Rules in force AND still in the draft — the only ones a trust tick can name (A5 maps trust to a live rule). */
  const trustable = selectors.flatMap((selector) => {
    const rule = inForce.get(selector);
    return rule === undefined ? [] : [[selector, rule] as const];
  });

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
                  {!locked && ticked.includes(selector) && <span className="text-xs text-green-800">{t('trustPending')}</span>}
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
      {/*
        THE INTERIM TRUST SECTION (ruled 2026-09-06). A tick beside every rule in force asked for a
        judgement the page gives no basis for — a rule's history is not on this page. So the tick
        lives here, FOLDED, opened only when the walk has named a rule at a stop and the researcher
        has seen its removals before (the Gate 4 material is in the chat until step 5 writes a stop
        on the row). At step 5 this section is replaced by the JUDGING moment, where the tick sits
        beside the rule's history. Only rules already in force are listed: a rule created in this
        draft has no history to trust.
      */}
      {open && trustable.length > 0 && (
        <div className="border-t border-amber-300">
          <button
            type="button"
            onClick={onToggleTrust}
            aria-expanded={trustOpen}
            className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm"
          >
            <span aria-hidden="true">{trustOpen ? '▾' : '▸'}</span>
            <span className="font-semibold">{t('trustHeading')}</span>
            {ticked.length > 0 && <span className="text-xs text-green-800">{t('trustCount', { count: ticked.length })}</span>}
          </button>
          {trustOpen && (
            <ul className="flex max-h-[24vh] flex-col gap-1 overflow-auto px-3 pb-2 text-sm">
              <li className="text-xs text-gray-600">{t('trustNote')}</li>
              {trustable.map(([selector, rule]) => (
                <li key={selector} className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={rule.trusted || ticked.includes(selector)}
                      disabled={disabled || rule.trusted}
                      onChange={(e) => {
                        if (e.target.checked) onTick(selector);
                        else onUntick(selector);
                      }}
                    />
                    <span className="font-semibold" title={selector}>
                      {nameOf(selector)}
                    </span>
                  </label>
                  <span className="text-xs text-gray-600">
                    {rule.trusted ? t('trustLocked') : t('removedHere', { count: removedBy(selector).length })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * The inert document with the marked elements outlined, the focused one
 * heavier. One rule per selector, so one selector the parser refuses does not
 * silence the others; nothing here runs, and a selector carrying markup is
 * dropped rather than injected.
 */
function highlighted(html: string, selectors: readonly string[], focused: string | null): string {
  const safe = selectors.filter((s) => !/[<>{}]/.test(s));
  if (safe.length === 0) return html;
  const rules = safe.map(
    (s) => `${s}{outline:3px solid #d97706 !important;outline-offset:-3px !important;background:rgba(217,119,6,.18) !important;}`,
  );
  if (focused !== null && safe.includes(focused)) {
    rules.push(`${focused}{outline:5px solid #b91c1c !important;background:rgba(185,28,28,.22) !important;}`);
  }
  return `${html}<style>${rules.join('')}</style>`;
}
