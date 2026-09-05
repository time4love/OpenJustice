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
  const added = selectors.filter((s) => !inForce.has(s));
  const ended = [...inForce.keys()].filter((s) => !selectors.includes(s));
  const continueAsIs = added.length === 0 && ended.length === 0 && ticked.length === 0;

  const returned = saved !== null && saved.returnedAt !== null;
  const returnedThenEdited = returned && !(sameSet(saved.selectors, selectors) && sameSet(saved.trusted, ticked));
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
      <h1 className="text-2xl font-bold">{t('captureHeading', { date: view.snapshotDate, capture })}</h1>
      <p className="text-sm text-gray-600">
        {t('pageUrl')} <span dir="ltr">{view.url}</span> · {t('outcome', { outcome: view.outcome })}
      </p>

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

      {/*
        THE WORKING AREA: the structure to click on one side, the page and its
        kept text as tabs on the other, both at ONE fixed height with their own
        scroll — the page never grows with the tree. Restored on 2026-09-06 from
        the old page, whose layout the researcher preferred.
      */}
      <div className="grid gap-4 md:grid-cols-2">
        <section className="min-w-0">
          <h2 className="font-semibold">{t('outlineHeading')}</h2>
          <p className="text-xs text-gray-600">{t('outlineNote')}</p>
          {view.outline.truncated && (
            <p className="text-sm text-amber-800">{t('outlineTruncated', { chars: view.outline.unreachableTextLength })}</p>
          )}
          <div className="mt-2 h-[32rem] overflow-auto rounded border p-2 text-sm">
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
        </section>

        <section className="min-w-0">
          <Tabs
            label={t('title')}
            tabs={[
              {
                id: 'rendered',
                label: t('renderedHeading'),
                body: (
                  <>
                    <p className="text-xs text-gray-600">{t('renderedNote')}</p>
                    {/* AN EMPTY SANDBOX IS THE PRIMARY DEFENCE; the backend's inert document is the second. */}
                    <iframe
                      title={t('renderedHeading')}
                      sandbox=""
                      srcDoc={highlighted(view.document, selectors, focused)}
                      className="mt-1 h-[30rem] w-full rounded border bg-white"
                    />
                  </>
                ),
              },
              {
                id: 'kept',
                label: t('keptHeading'),
                body: (
                  <pre
                    className={`mt-1 h-[30rem] overflow-auto whitespace-pre-wrap rounded border p-2 text-sm ${previewStale ? 'opacity-50' : ''}`}
                  >
                    {preview?.keptText ?? ''}
                  </pre>
                ),
              },
            ]}
          />
        </section>
      </div>

      {/*
        THE DRAFT AND WHAT IT REMOVES, side by side and linked: a rule clicked
        here lights its blocks there and its element in the page; a block
        clicked there lights its rule here. The removed pane keeps its height
        and scrolls — it never collapses and never tabs away.
      */}
      <div className="grid gap-4 md:grid-cols-2">
        <Rules
          selectors={selectors}
          ended={ended}
          inForce={inForce}
          ticked={ticked}
          preview={previewStale ? null : preview}
          focused={focused}
          disabled={busy}
          onFocus={focus}
          onRemove={toggle}
          onRestore={toggle}
          onTick={tick}
          onUntick={untick}
          t={t}
        />
        <RemovedPane
          preview={preview}
          pending={previewStale}
          failed={previewFailed}
          focused={focused}
          onFocus={focus}
          t={t}
        />
      </div>

      <section className="rounded border-2 border-gray-800 p-3">
        <h2 className="font-semibold">{t('answerHeading')}</h2>
        <ul className="mt-1 text-sm">
          {continueAsIs && <li>{t('answerContinue')}</li>}
          {(added.length > 0 || ended.length > 0) && <li>{t('answerCorrect', { added: added.length, ended: ended.length })}</li>}
          {ticked.length > 0 && <li>{t('answerTrust', { count: ticked.length })}</li>}
        </ul>
        <p className="mt-1 text-xs text-gray-600">
          {draftState === 'saving' && t('draftSaving')}
          {draftState === 'saved' && !returned && t('draftSaved')}
          {draftState === 'failed' && t('draftSaveFailed')}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handBack()}
            className="rounded bg-gray-900 px-4 py-2 font-semibold text-white hover:bg-black disabled:opacity-50"
          >
            {busy ? t('saving') : t('save')}
          </button>
          {saved !== null && (
            <button type="button" disabled={busy} onClick={() => void cancelDraft()} className="text-sm underline">
              {t('cancelDraft')}
            </button>
          )}
        </div>

        {returned && (
          <div className="mt-3 border-t pt-3">
            {returnedThenEdited ? (
              <p className="text-sm font-semibold text-amber-900">{t('returnedThenEdited')}</p>
            ) : (
              <>
                <p className="font-semibold">{t('returnedHeading')}</p>
                <p className="text-xs text-gray-600">{t('returnedAt', { time: saved.returnedAt ?? '' })}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <code dir="ltr" className="select-all rounded bg-gray-100 px-2 py-1 text-sm">
                    {approveLine}
                  </code>
                  <button type="button" onClick={() => void copy()} className="rounded border px-2 py-1 text-xs">
                    {copyState === 'copied' ? t('copied') : copyState === 'failed' ? t('copyFailed') : t('copy')}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-600">{t('mismatchNote')}</p>
              </>
            )}
          </div>
        )}
      </section>

      <section className="text-sm text-gray-700">
        <h2 className="font-semibold">{t('badCaptureHeading')}</h2>
        <p>{t('badCaptureNote')}</p>
        <code dir="ltr" className="select-all rounded bg-gray-100 px-2 py-1">
          {skipLine}
        </code>
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex max-w-6xl flex-col gap-4 p-4">{children}</main>;
}

/** The page and its kept text are alternatives and may be tabbed; the removed text is not, and is never in here. */
function Tabs({ label, tabs }: { label: string; tabs: { id: string; label: string; body: React.ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? '');
  const current = tabs.find((tab) => tab.id === active) ?? tabs[0];
  return (
    <div>
      <div role="tablist" aria-label={label} className="flex gap-1 border-b border-gray-300">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === current?.id}
            onClick={() => {
              setActive(tab.id);
            }}
            className={`-mb-px rounded-t border border-b-0 px-3 py-1 text-sm ${
              tab.id === current?.id ? 'border-gray-300 bg-white font-semibold' : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">{current?.body}</div>
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
          title={wholeDocument ? t('wholeDocument') : node.selector}
          className={`min-w-0 text-start ${isSelected ? 'bg-amber-100 font-semibold' : ''} ${wholeDocument ? 'cursor-not-allowed text-gray-400' : ''}`}
        >
          {/* The character count is what a click removes — the number the researcher reads first. */}
          <span>{node.label}</span> <span className="text-gray-500">({node.textLength})</span>{' '}
          <code dir="ltr" className="text-xs text-gray-500">
            {node.selector}
          </code>
          {node.positional && <span className="ms-1 text-xs text-amber-800">{t('positional')}</span>}
          {count !== undefined && isSelected && (
            <span className="ms-1 text-xs text-gray-600">{count === 0 ? t('matchedNothing') : t('matched', { count })}</span>
          )}
        </button>
      </div>
      {node.collapsedFrom.length > 0 && (
        <p className="ps-5 text-xs text-gray-400" dir="ltr">
          {t('collapsedFrom', { selectors: node.collapsedFrom.join(' › ') })}
        </p>
      )}
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
 * The draft's rules: in force, new in this draft, or ending from this
 * capture's date — with the trust tick per rule. An already-TRUSTED rule is
 * ticked and locked; only a rule ticked here goes into the draft's `trusted`.
 */
function Rules({
  selectors,
  ended,
  inForce,
  ticked,
  preview,
  focused,
  disabled,
  onFocus,
  onRemove,
  onRestore,
  onTick,
  onUntick,
  t,
}: {
  selectors: string[];
  ended: string[];
  inForce: Map<string, RuleInForce>;
  ticked: string[];
  preview: Preview | null;
  focused: string | null;
  disabled: boolean;
  onFocus: (selector: string) => void;
  onRemove: (selector: string) => void;
  onRestore: (selector: string) => void;
  onTick: (selector: string) => void;
  onUntick: (selector: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <section className="min-w-0">
      <h2 className="font-semibold">{t('rulesHeading')}</h2>
      <p className="text-xs text-gray-600">{t('rulesNote')}</p>
      {selectors.length === 0 && ended.length === 0 ? (
        <p className="mt-2 text-sm text-gray-600">{t('noRules')}</p>
      ) : (
        <ul className="mt-2 flex h-72 flex-col gap-1 overflow-auto rounded border p-2 text-sm">
          {selectors.map((selector) => {
            const rule = inForce.get(selector);
            const count = preview?.matchCounts[selector];
            const locked = rule?.trusted === true;
            const isTicked = locked || ticked.includes(selector);
            const isFocused = focused === selector;
            return (
              <li
                key={selector}
                className={`flex flex-wrap items-center gap-2 rounded px-1 ${isFocused ? 'bg-amber-100 ring-2 ring-amber-500' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onFocus(selector);
                  }}
                  title={t('focusRule')}
                  className="text-start"
                >
                  <code dir="ltr">{selector}</code>
                </button>
                <span className="text-xs text-gray-600">{rule === undefined ? t('newRule') : t('inForce')}</span>
                {count === undefined ? null : count === 0 ? (
                  <span className="text-amber-800">{t('matchedNothing')}</span>
                ) : (
                  <span className="text-gray-600">{t('matched', { count })}</span>
                )}
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={isTicked}
                    disabled={disabled || locked}
                    onChange={(e) => {
                      if (e.target.checked) onTick(selector);
                      else onUntick(selector);
                    }}
                  />
                  {locked ? t('trustLocked') : t('trustTick')}
                </label>
                <button type="button" disabled={disabled} onClick={() => { onRemove(selector); }} className="text-xs underline">
                  {t('remove')}
                </button>
              </li>
            );
          })}
          {ended.map((selector) => (
            <li key={selector} className="flex flex-wrap items-center gap-2 text-gray-500">
              <code dir="ltr" className="line-through">
                {selector}
              </code>
              <span className="text-xs">{t('willEnd')}</span>
              <button type="button" disabled={disabled} onClick={() => { onRestore(selector); }} className="text-xs underline">
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
 * THE HALF THAT MAKES THIS PAGE HONEST. Never collapsed, never tabbed away,
 * and at a fixed height with its own scroll so the page does not grow with
 * what the rules remove. A block is the rule that removed it: clicking one
 * lights that rule in the draft, and a rule focused there scrolls its first
 * block into view here.
 */
function RemovedPane({
  preview,
  pending,
  failed,
  focused,
  onFocus,
  t,
}: {
  preview: Preview | null;
  pending: boolean;
  failed: boolean;
  focused: string | null;
  onFocus: (selector: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const firstFocused = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    firstFocused.current?.scrollIntoView({ block: 'nearest' });
  }, [focused, preview]);
  const firstIndex = focused === null ? -1 : (preview?.removedSegments.findIndex((s) => s.selector === focused) ?? -1);
  return (
    <section className="min-w-0">
      <div className="border-t-4 border-amber-500 pt-2">
        <h2 className="font-semibold">{t('removedHeading')}</h2>
        <p className="text-xs text-gray-600">{t('removedNote')}</p>
      </div>
      {failed && <p className="text-sm text-red-700">{t('previewFailed')}</p>}
      {pending && !failed && <p className="text-sm text-gray-600">{t('previewPending')}</p>}
      <div className={`mt-2 h-72 overflow-auto rounded border border-amber-300 bg-amber-50/40 p-2 ${pending ? 'opacity-50' : ''}`}>
        {preview !== null && preview.removedSegments.length === 0 && !pending && (
          <p className="text-sm text-gray-600">{t('removedEmpty')}</p>
        )}
        {preview !== null && (
          <ul className="flex flex-col gap-2 text-sm">
            {preview.removedSegments.map((segment, i) => {
              const isFocused = focused === segment.selector;
              return (
                <li key={`${segment.selector}-${i}`} ref={i === firstIndex ? firstFocused : null}>
                  <button
                    type="button"
                    onClick={() => {
                      onFocus(segment.selector);
                    }}
                    title={t('focusBlock')}
                    className={`block w-full rounded border p-2 text-start ${
                      isFocused ? 'border-amber-600 bg-amber-100 ring-2 ring-amber-500' : 'border-amber-200 bg-white/70 hover:border-amber-500'
                    }`}
                  >
                    <code dir="ltr" className="block text-xs text-amber-900">
                      {segment.selector}
                    </code>
                    <p className="whitespace-pre-wrap">{segment.text}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
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
