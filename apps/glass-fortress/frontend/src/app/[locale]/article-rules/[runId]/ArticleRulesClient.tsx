'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiUrl, authHeaders } from '@/lib/api';

// ---------------------------------------------------------------------------
// LEVEL 4 — the marking loop.
//
// THIS PAGE WRITES DECISIONS. IT NEVER APPLIES AN EFFECT. It appends "capture X
// was shown", "the rules are now these", "these rules are right here" — and the
// backend does every write that follows. Three consequences the plan names: an
// effect cannot depend on this tab staying open, every write from here is
// reversible run state, and the interactive and headless paths are the same
// path.
//
// TWO THINGS ARE NON-NEGOTIABLE IN WHAT IT SHOWS.
//
//   The REMOVED text, beside the kept text. Over-matching is the dangerous
//   direction and it is invisible in what survives: a rule that swallows a
//   paragraph leaves something clean, short and plausible on screen. A page that
//   showed only the article would collect approvals for rulesets that quietly
//   deleted content.
//
//   A NULL correction rate as "this says nothing", never as zero. Zero from an
//   empty denominator reads as a ruleset tested and never found wanting, which
//   is the opposite of the truth.
//
// AND THE CAPTURE IS RENDERED INERT, IN A SANDBOX. These are captures of real
// sites pulled from the Archive, carrying real analytics and advertising tags,
// displayed inside a researcher's authenticated session. `sandbox` with no
// tokens blocks scripts, forms and same-origin access; the backend also strips
// scripts and on* handlers before sending. Selection happens against the
// STRUCTURE the backend derived, not against the rendered page, so no overlay
// script is needed inside the frame — which is the whole reason `allow-scripts`
// never appears here.
// ---------------------------------------------------------------------------

interface OutlineNode {
  selector: string;
  tag: string;
  id: string | null;
  classes: string[];
  textLength: number;
  positional: boolean;
  /**
   * What this block IS, in words. THE SELECTOR IS NOT A LABEL: the first
   * researcher to use this page reported the tree as "very technical, using
   * cryptic code, and it is very hard to understand what to click", and marking
   * is supposed to be a PERCEPTION task.
   */
  label: string;
  /** Pass-through wrappers folded into this row. Shown, never hidden. */
  collapsedFrom: string[];
  children: OutlineNode[];
}

interface RunState {
  runId: string;
  status: 'OPEN' | 'COMMITTED' | 'ABANDONED';
  version: number;
  selectors: string[];
  rulesetId: string;
  capturesShown: number;
  distinctCapturesShown: number;
  /** Captures a human ACTED on. Showing is not judging — see calibrationRun.ts. */
  capturesJudged: number;
  /** WHICH captures were judged, folded from the log — not remembered in this tab. */
  judgedCaptures: { snapshotId: string; verdict: DecisionType }[];
  corrections: number;
  capturesNeedingCorrection: number;
  correctionRate: number | null;
  consecutiveCleanCaptures: number;
  staleSelectors: { selector: string; lastMatchedAt: string | null }[];
  storedCaptures: number;
  /** The backend's English rendering. Kept for headless callers; not shown here. */
  effect: string;
  /** The same effect as STRUCTURED FACTS, which is what this page renders. */
  effectDeclaration: ApprovalEffect;
}

/**
 * What approving will actually do, as data rather than as a sentence.
 *
 * The write kinds are a closed set on the backend precisely so that a new mode
 * cannot introduce a description that lies. Rendering from the declaration keeps
 * that property AND lets the words come from the locale file — the prose field
 * was English, and it was the one sentence asking a Hebrew reader to authorise
 * a write across every stored capture.
 */
interface ApprovalEffect {
  writes: { kind: string; rows: number }[];
  reversible: boolean;
  reversedBy?: string;
  requiresCleanupSessionToUndo: boolean;
}

interface CaptureRow {
  id: string;
  capturedAt: string;
  waybackTimestamp: string | null;
  snapshotDate: string;
}

interface CaptureDetail {
  snapshotId: string;
  capturedAt: string;
  snapshotUrl: string;
  html: string;
  outline: OutlineNode;
  outlineTruncated: boolean;
  /** How much of the document a cut put out of reach. `true` alone hid 76% once. */
  outlineUnreachableTextLength: number;
}

interface Preview {
  keptText: string;
  removedText: string;
  matchCounts: Record<string, number>;
  invalidSelectors: string[];
  removalFraction: number;
}

type DecisionType =
  | 'CAPTURE_SHOWN'
  | 'RULESET_CORRECTED'
  | 'CAPTURE_ACCEPTED'
  | 'CAPTURE_REJECTED'
  | 'CAPTURE_SKIPPED';

export function ArticleRulesClient({ runId }: { runId: string }) {
  const t = useTranslations('articleRules');

  const [state, setState] = useState<RunState | null>(null);
  const [captures, setCaptures] = useState<{ total: number; sample: CaptureRow[] } | null>(null);
  const [capture, setCapture] = useState<CaptureDetail | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selectors, setSelectors] = useState<string[]>([]);
  const [skipReason, setSkipReason] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /**
   * Captures judged in this tab SINCE the last state read.
   *
   * A BRIDGE, NOT A RECORD. It exists only so the tick appears on the click
   * rather than on the round trip; the authority is `state.judgedCaptures`,
   * folded from the decision log. An earlier version made this the ONLY source,
   * so a reload erased every verdict the researcher had recorded and the capture
   * strip went blank — they reported not being able to see which versions they
   * had confirmed, and the system had known all along.
   */
  const [judgedLocal, setJudgedLocal] = useState<string[]>([]);
  /**
   * The selector set the current preview was computed for.
   *
   * DERIVED, NOT FLAGGED. An earlier version set a `previewPending` boolean at
   * the top of the debounce effect, which the linter correctly refused: a
   * setState in an effect body is a cascading render, and this repository
   * already has the rule — derive from state, never from a transition. Holding
   * what the preview was FOR makes staleness a comparison rather than a flag,
   * and it is exact: the pane is out of date precisely when the rules have
   * moved on from the ones it was computed against.
   */
  const [previewFor, setPreviewFor] = useState<string[] | null>(null);

  /**
   * The pending settle timer, and whether a settle is already in flight.
   *
   * WITHOUT THESE, THE PAGE RACES ITSELF. The settle timer was cancelled when
   * its dependencies changed but NOT when the researcher did something, so
   * clicking accept while a settle was still pending fired the same write twice
   * against one `expectedVersion` — and the loser came back 409, surfacing as
   * "another tab changed this run" when there was no other tab. Nothing was
   * lost, because the page re-reads on a stale version; it was noise in the
   * middle of a measurement, produced by this page arguing with itself.
   */
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settling = useRef(false);

  const cancelSettle = useCallback(() => {
    if (settleTimer.current !== null) {
      clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
  }, []);

  const base = `/api/article-rules/${runId}`;

  const call = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const res = await fetch(apiUrl(path), {
        ...init,
        headers: {
          ...(init?.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...authHeaders(),
          ...init?.headers,
        },
      });
      const body: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = body as { error?: string; message?: string };
        // A stale version is another tab having got there first, not a fault —
        // the page re-reads and re-offers rather than presenting a race as a bug.
        // A signed-out researcher gets OUR sentence, in their language. The
        // backend's 401 body is English prose written for an API client, and
        // showing it here would put an untranslated string in front of a Hebrew
        // reader at the one moment the page cannot do anything for them.
        if (res.status === 401 || res.status === 403) throw new Error(t('signedOut'));
        if (res.status === 409) throw new StaleError(t('staleVersion'));
        if (res.status === 410) throw new Error(err.error === 'run_closed' ? t('runClosed') : t('expired'));
        throw new Error(err.message ?? t('offline'));
      }
      return body as T;
    },
    [t],
  );

  const refresh = useCallback(async () => {
    setState(await call<RunState>(base));
  }, [base, call]);

  // Initial load. Nothing is appended to the log by RENDERING — a capture counts
  // as shown when the researcher asks for it, not when a tab is reopened.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [run, caps] = await Promise.all([
          call<RunState>(base),
          call<{ total: number; sample: CaptureRow[] }>(`${base}/captures`),
        ]);
        if (cancelled) return;
        setState(run);
        setSelectors(run.selectors);
        setCaptures(caps);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('offline'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [base, call, t]);

  const runPreview = useCallback(
    async (snapshotId: string, rules: string[]) => {
      const next = await call<Preview>(`${base}/captures/${snapshotId}/preview`, {
        method: 'POST',
        body: JSON.stringify({ selectors: rules }),
      });
      setPreview(next);
      setPreviewFor(rules);
    },
    [base, call],
  );

  /**
   * Write ONE decision for a ruleset that was actually adopted.
   *
   * COALESCED, BY RESEARCHER DECISION. A toggle-to-look and a considered change
   * are the same event to the log otherwise: eight `RULESET_CORRECTED` rows for
   * one capture's worth of exploration, which is the record a future reader
   * audits. Comparing against what was last RECORDED — not against the previous
   * click — means marking a block and unmarking it writes nothing at all,
   * because the ruleset ended where it started.
   *
   * `foldEpisodes` already coalesces at the EPISODE level, so the correction
   * RATE was never wrong. This is about the log, not the indicator.
   */
  const flushCorrection = useCallback(async () => {
    if (!state || state.status !== 'OPEN') return;
    if (sameSet(selectors, state.selectors)) return;
    // Belt to the cancellation's braces: two settles must never overlap, however
    // they were started.
    if (settling.current) return;
    settling.current = true;
    try {
      const next = await call<RunState>(`${base}/decisions`, {
      method: 'POST',
      body: JSON.stringify({
        expectedVersion: state.version,
          type: 'RULESET_CORRECTED',
          selectors,
        }),
      });
      setState(next);
    } finally {
      settling.current = false;
    }
  }, [base, call, selectors, state]);

  const guard = async (work: () => Promise<void>) => {
    // The researcher just acted, so the pending settle is theirs to carry out,
    // not the timer's. Cancelling here is what stops the page racing itself.
    cancelSettle();
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      if (err instanceof StaleError) {
        setNotice(err.message);
        await refresh().catch(() => undefined);
      } else {
        setError(err instanceof Error ? err.message : t('offline'));
      }
    } finally {
      setBusy(false);
    }
  };

  const showCapture = (snapshotId: string) =>
    void guard(() =>
      // Settle first: the draft belongs to the capture being left, not the one
      // being opened.
      settleThen(async () => {
        const detail = await call<CaptureDetail>(`${base}/captures/${snapshotId}`);
        setCapture(detail);
        await runPreview(snapshotId, selectors);
        await decide('CAPTURE_SHOWN', { snapshotId });
      }),
    );


  const decide = async (type: DecisionType, extra: Record<string, unknown> = {}) => {
    if (!state) return;
    const next = await call<RunState>(`${base}/decisions`, {
      method: 'POST',
      body: JSON.stringify({ expectedVersion: state.version, type, ...extra }),
    });
    setState(next);
  };

  /**
   * Settle the draft, then act.
   *
   * ORDER MATTERS AND IT IS SEQUENTIAL. A judgement is ABOUT a ruleset, so the
   * ruleset it judges has to be in the log before it. Running them concurrently
   * would also race the optimistic-concurrency version and turn an ordinary
   * accept into a 409.
   */
  const settleThen = async (work: () => Promise<void>) => {
    await flushCorrection();
    await work();
  };

  /**
   * Judge the capture on screen, SAY SO, and move on.
   *
   * The three things a judgement now does that it did not: it names what was
   * recorded, it marks the capture done in the strip, and it opens the next
   * unjudged one. Any of the three would have prevented "the button is
   * unresponsive"; the accept had in fact written a decision and advanced the
   * streak every time.
   *
   * A REJECTION DOES NOT ADVANCE. The plan is explicit — "reject routes back to
   * calibration, it never skips a capture" — so the researcher stays here, fixes
   * the rules, and looks again at the capture that disagreed.
   */
  const judge = (type: 'CAPTURE_ACCEPTED' | 'CAPTURE_REJECTED' | 'CAPTURE_SKIPPED', extra: Record<string, unknown> = {}) => {
    if (!capture) return;
    const snapshotId = capture.snapshotId;
    void guard(() =>
      settleThen(async () => {
        await decide(type, { snapshotId, ...extra });
        setJudgedLocal((prev) => (prev.includes(snapshotId) ? prev : [...prev, snapshotId]));
        if (type === 'CAPTURE_REJECTED') {
          setNotice(t('recordedRejected'));
          return;
        }
        setNotice(type === 'CAPTURE_ACCEPTED' ? t('recordedAccepted') : t('recordedSkipped'));
        const next = captures?.sample.find(
          (row) => row.id !== snapshotId && !verdicts.has(row.id),
        );
        if (!next) {
          setNotice(t('sampleExhausted'));
          return;
        }
        const detail = await call<CaptureDetail>(`${base}/captures/${next.id}`);
        setCapture(detail);
        await decide('CAPTURE_SHOWN', { snapshotId: next.id });
      }),
    );
  };

  // ---------------------------------------------------------------------
  // The draft, debounced twice on different clocks.
  //
  // The PREVIEW follows the tree closely, because it is the feedback the
  // researcher is watching. The DECISION waits longer, because it is a record
  // and a record of every intermediate click is noise. Neither blocks a click.
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!capture) return undefined;
    const id = setTimeout(() => {
      void runPreview(capture.snapshotId, selectors).catch(() => undefined);
    }, PREVIEW_MS);
    return () => { clearTimeout(id); };
  }, [capture, selectors, runPreview]);

  /**
   * Verdict per capture: the log's, with this tab's newest clicks layered on.
   *
   * The server is the authority and the local set only covers the gap between a
   * click and the next state read, so a reload loses nothing.
   */
  // Not memoised: it is a Map over at most a dozen rows, rebuilt per render. An
  // explicit `useMemo` here is memoisation the compiler then refuses to preserve,
  // which is a lint error bought with no measurable saving.
  const verdicts = new Map<string, DecisionType>();
  for (const row of state?.judgedCaptures ?? []) verdicts.set(row.snapshotId, row.verdict);
  for (const id of judgedLocal) if (!verdicts.has(id)) verdicts.set(id, 'CAPTURE_ACCEPTED');

  // Stale exactly when the rules have moved on from what was previewed.
  const previewPending = previewFor === null || !sameSet(selectors, previewFor);

  useEffect(() => {
    if (!capture || state === null || state.status !== 'OPEN') return undefined;
    if (sameSet(selectors, state.selectors)) return undefined;
    const id = setTimeout(() => {
      settleTimer.current = null;
      void (async () => {
        try {
          await flushCorrection();
        } catch (err) {
          // NEVER SWALLOWED. This is the write that makes the researcher's marks
          // durable, so a failure here loses work silently — the one outcome
          // this page must not produce. A 409 is another tab having got there
          // first: re-read, and the effect re-runs and retries, because the
          // draft still differs from what is recorded.
          if (err instanceof StaleError) {
            setNotice(err.message);
            await refresh().catch(() => undefined);
          } else {
            setError(err instanceof Error ? err.message : t('offline'));
          }
        }
      })();
    }, SETTLE_MS);
    settleTimer.current = id;
    return () => { clearTimeout(id); };
  }, [capture, selectors, state, flushCorrection, refresh, t]);

  /**
   * Adopt a draft ruleset. RETURNS IMMEDIATELY — nothing here awaits the network.
   *
   * THE HIGHLIGHT MUST NOT WAIT FOR A ROUND TRIP. Every click used to fire two
   * sequential POSTs with the whole tree `disabled` until both returned, so a
   * click landing in that window hit a dead button and vanished. The researcher
   * reported it as "click takes time to turn yellow, it takes several clicks",
   * which is exactly what it was.
   *
   * The preview and the decision are driven by the effect below instead.
   */
  const applyRules = (rules: string[]) => { setSelectors(rules); };


  const finish = (action: 'commit' | 'abandon') =>
    void guard(async () => {
      if (!state) return;
      const next = await call<RunState>(`${base}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion: state.version }),
      });
      setState(next);
      setNotice(action === 'commit' ? t('committed') : t('abandoned'));
    });

  const closed = state !== null && state.status !== 'OPEN';

  if (error && !state) return <Shell><p className="text-red-700">{error}</p></Shell>;
  if (!state) return <Shell><p>{t('loading')}</p></Shell>;

  return (
    <Shell>
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-sm text-gray-600">{t('intro')}</p>

      {notice && <p className="rounded bg-amber-50 p-2 text-sm text-amber-900">{notice}</p>}
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-800">{error}</p>}

      <Indicator state={state} t={t} />

      <section>
        <h2 className="font-semibold">{t('capturesHeading')}</h2>
        {captures && (
          <>
            <p className="text-xs text-gray-600">
              {t('capturesSpread', { shown: captures.sample.length, total: captures.total })}
            </p>
            {/* PROGRESS HAS TO BE VISIBLE. Twelve identical buttons say nothing
                about which have been judged, so a researcher working through the
                sample has to remember — and after an accept that confirmed
                nothing, they could not even tell whether the last one counted. */}
            <ul className="mt-1 flex flex-wrap gap-1">
              {captures.sample.map((c) => {
                const verdict = verdicts.get(c.id);
                const isCurrent = capture?.snapshotId === c.id;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={busy || closed}
                      onClick={() => { showCapture(c.id); }}
                      title={verdict === undefined ? c.snapshotDate : t('judgedBadge')}
                      className={`rounded border px-2 py-1 text-xs disabled:opacity-50 ${
                        VERDICT_STYLE[verdict ?? 'NONE']
                      } ${isCurrent ? 'font-semibold ring-2 ring-black' : ''}`}
                    >
                      {/* THE VERDICT, NOT JUST "DONE". A capture the rules were
                          right on and one they were wrong on have both been
                          judged; showing them alike would hide the disagreement,
                          which is the only thing the sample is there to find. */}
                      {verdict === 'CAPTURE_ACCEPTED' && <span aria-hidden>✓ </span>}
                      {verdict === 'CAPTURE_REJECTED' && <span aria-hidden>✕ </span>}
                      {verdict === 'CAPTURE_SKIPPED' && <span aria-hidden>– </span>}
                      {c.snapshotDate}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {/*
        THE WORKING AREA. Marking happens in the left column and its consequence
        is rendered in the right one, side by side, because the first walk found
        the researcher clicking a node and seeing nothing happen: the removal
        fraction and the removed text were three screens below the control.
        A wide screen is assumed here and that is deliberate — this route sits
        behind the researcher unlock and is not part of the public site, so the
        project's mobile-first rule was never about this page. It still stacks.
      */}
      {capture && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section className="flex min-w-0 flex-col">
            <h2 className="font-semibold">{t('outlineHeading')}</h2>
            <p className="text-xs text-gray-600">{t('outlineHint')}</p>
            {/* A CUT AND A LOSS ARE DIFFERENT FACTS. Saying "the structure was
                cut — 0 characters cannot be marked" in one breath reads as a
                contradiction and trains the researcher to ignore the warning
                that matters. The alarming version is reserved for a cut that
                actually put text out of reach. */}
            {capture.outlineTruncated && capture.outlineUnreachableTextLength > 0 ? (
              <p className="mt-1 rounded bg-amber-50 p-2 text-xs text-amber-900">
                {t('outlineTruncated')}{' '}
                {t('outlineUnreachable', { chars: capture.outlineUnreachableTextLength })}
              </p>
            ) : capture.outlineTruncated ? (
              <p className="mt-1 text-xs text-gray-500">{t('outlineTruncatedHarmless')}</p>
            ) : (
              <p className="mt-1 text-xs text-gray-500">{t('outlineComplete')}</p>
            )}
            <div className="mt-1 h-[32rem] overflow-auto border border-gray-300 p-2 text-xs">
              <Outline
                node={capture.outline}
                depth={0}
                documentTextLength={capture.outline.textLength}
                selected={selectors}
                preview={preview}
                disabled={closed}
                onToggle={(sel) => {
                  // CLICK MARKS, CLICK AGAIN UNMARKS. The researcher asked for
                  // this in as many words: "if I can click, I should be able to
                  // unclick so I can play around freely." Marking used to be
                  // one-way from the tree, with removal only from a list
                  // somewhere else on the page.
                  applyRules(
                    selectors.includes(sel)
                      ? selectors.filter((s) => s !== sel)
                      : [...selectors, sel],
                  );
                }}
                t={t}
              />
            </div>
          </section>

          <div className="flex min-w-0 flex-col gap-4">
            <Tabs
              t={t}
              tabs={[
                {
                  id: 'rendered',
                  label: t('tabRendered'),
                  body: (
                    <>
                      <p className="text-xs text-gray-600">{t('renderedNote')}</p>
                      {/*
                        NO `allow-scripts`, EVER. Selection happens against the
                        outline beside this frame, so nothing needs to run inside
                        it. An empty sandbox blocks scripts, forms, popups and
                        same-origin access.
                      */}
                      <iframe
                        title={capture.snapshotUrl}
                        sandbox=""
                        srcDoc={capture.html}
                        className="mt-1 h-80 w-full border border-gray-300 bg-white"
                      />
                    </>
                  ),
                },
                {
                  id: 'kept',
                  label: t('tabKept'),
                  body: (
                    <pre className="h-80 overflow-auto whitespace-pre-wrap border border-gray-300 p-2 text-xs">
                      {preview?.keptText ?? ''}
                    </pre>
                  ),
                },
                {
                  id: 'rules',
                  label: t('tabRules'),
                  body: (
                    <Rules
                      selectors={selectors}
                      preview={preview}
                      disabled={busy || closed}
                      onRemove={(sel) => { applyRules(selectors.filter((s) => s !== sel)); }}
                      t={t}
                    />
                  ),
                },
              ]}
            />

            {/*
              PINNED, NEVER A TAB. The page's own text says why: a rule that
              swallows a paragraph leaves something clean and convincing on
              screen. Before and after are alternatives and may be tabbed;
              REMOVED is the instrument, and an instrument you have to click to
              reach is one you will not be looking at when it matters.
            */}
            {preview && <RemovedPane preview={preview} pending={previewPending} t={t} />}
          </div>
        </div>
      )}

      {/*
        TWO DIFFERENT SCOPES, AND THEY MUST NOT LOOK ALIKE. Judging a capture is
        about ONE capture and writes a decision; applying the rules is about the
        WHOLE PAGE, saves the ruleset and re-derives every stored capture. They
        sat adjacent as two black buttons, one above the other, and the
        researcher reported the pair as confusing — correctly, because nothing on
        screen said they operated on different things. Each group is now headed
        by what it acts on.
      */}
      {capture && !closed && (
        <section className="flex flex-wrap items-center gap-2 rounded border border-gray-300 p-3">
          <h2 className="w-full font-semibold">{t('captureVerdictHeading')}</h2>
          <button type="button" disabled={busy}
            className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
            onClick={() => { judge('CAPTURE_ACCEPTED'); }}>
            {busy ? t('saving') : t('accept')}
          </button>
          <button type="button" disabled={busy} className="rounded border border-gray-400 px-3 py-2 text-sm"
            onClick={() => { judge('CAPTURE_REJECTED'); }}>
            {t('reject')}
          </button>
          <span className="text-xs text-gray-600">{t('rejectNote')}</span>
          <label className="flex items-center gap-1 text-xs">
            <input
              value={skipReason}
              onChange={(e) => { setSkipReason(e.target.value); }}
              placeholder={t('skipReason')}
              className="w-64 rounded border border-gray-300 px-2 py-1"
            />
            <button type="button" disabled={busy || skipReason.trim() === ''} className="rounded border border-gray-400 px-2 py-1"
              onClick={() => {
                judge('CAPTURE_SKIPPED', { reason: skipReason });
                setSkipReason('');
              }}>
              {t('skip')}
            </button>
          </label>
        </section>
      )}

      {!closed && (
        <section className="rounded border-2 border-gray-400 bg-gray-50 p-3">
          <h2 className="font-semibold">{t('finishHeading')}</h2>
          {/* RENDERED FROM THE BACKEND'S STRUCTURED DECLARATION, not from its
              English prose. The principle stands — nobody authors this sentence
              next to the effect it describes, because such a sentence is free to
              drift — but `effectDeclaration` carries the FACTS (which write
              kinds, how many rows, whether it is reversible) while the WORDS
              come from the locale file. The prose field put an untranslated
              English paragraph in front of a Hebrew reader at the one moment the
              page asks them to authorise something. */}
          <EffectSummary effect={state.effectDeclaration} t={t} />
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy} className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
              onClick={() => { finish('commit'); }}>
              {t('commit', { count: state.storedCaptures })}
            </button>
            <button type="button" disabled={busy} className="rounded border border-gray-400 px-3 py-2 text-sm disabled:opacity-50"
              onClick={() => { finish('abandon'); }}>
              {t('abandon')}
            </button>
          </div>
          {/* "CLOSE WITHOUT SAVING" WAS A LIE, and the researcher caught it:
              accepting a capture DOES save something — a decision in the run's
              log. What closing without applying does not save is the RULESET.
              Naming the two separately is the whole fix. */}
          <p className="mt-2 text-xs text-gray-600">{t('abandonNote')}</p>
        </section>
      )}
    </Shell>
  );
}

/** A 409 is a race, not a fault, and the caller treats it differently. */
class StaleError extends Error {}

/**
 * What approving does, rendered from the backend's STRUCTURED declaration.
 *
 * The principle the prose field was protecting still holds — nobody authors a
 * confirmation next to the effect it describes, because such a sentence drifts
 * away from the code as soon as a new write kind appears. What it got wrong was
 * shipping the SENTENCE rather than the FACTS: the backend's rendering is
 * English, and it was the one thing on a Hebrew page asking the researcher to
 * authorise a write across every stored capture.
 *
 * So the facts come from the closed set of write kinds and the words come from
 * the locale file. An UNKNOWN kind renders as its raw name and its row count
 * rather than being dropped: a write nobody has translated yet must still be
 * visible, because the failure mode this whole panel exists to prevent is a
 * researcher approving something the page did not mention.
 */
function EffectSummary({
  effect,
  t,
}: {
  effect: ApprovalEffect;
  t: ReturnType<typeof useTranslations>;
}) {
  const WORDS: Record<string, (rows: number) => string> = {
    ARTICLE_RULESET: () => t('effectRuleset'),
    REDERIVED_CAPTURES: (rows) => t('effectRederive', { count: rows }),
  };
  return (
    <>
      <p className="text-sm">{t('effectHeading')}</p>
      <ul className="list-disc ps-5 text-sm">
        {effect.writes.map((w) => (
          <li key={w.kind}>{(WORDS[w.kind] ?? (() => `${w.kind} × ${String(w.rows)}`))(w.rows)}</li>
        ))}
      </ul>
      {effect.reversible && <p className="text-xs text-gray-600">{t('effectReversible')}</p>}
    </>
  );
}

/**
 * Two rulesets are the same rule, whatever order they were built in.
 *
 * ORDER IS NOT MEANING HERE. Marking the footer then the nav produces the same
 * filter as marking the nav then the footer, so comparing arrays positionally
 * would record a "correction" that changed nothing.
 */
function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const seen = new Set(b);
  return a.every((item) => seen.has(item));
}

/** How a judged capture reads in the strip. Accepted is the only green one. */
const VERDICT_STYLE: Record<string, string> = {
  CAPTURE_ACCEPTED: 'border-green-600 bg-green-100 text-green-900',
  CAPTURE_REJECTED: 'border-amber-600 bg-amber-100 text-amber-900',
  CAPTURE_SKIPPED: 'border-gray-400 bg-gray-100 text-gray-600',
  NONE: 'border-gray-300',
};

/** How long the researcher has to keep clicking before anything is written. */
const SETTLE_MS = 900;
/**
 * How long the tree has to settle before the removed pane is recomputed.
 *
 * EVERY PREVIEW IS A FULL RE-PARSE of the stored document server-side, so a
 * click is not cheap however local the highlight is. Raised from 200ms after
 * the researcher reported the page as slow to respond: a burst of marking now
 * costs one recomputation rather than one per click, and the pane says
 * "recomputing" instead of showing a stale number in silence.
 */
const PREVIEW_MS = 350;

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex max-w-6xl flex-col gap-4 p-4">{children}</main>;
}

function Indicator({ state, t }: { state: RunState; t: ReturnType<typeof useTranslations> }) {
  return (
    <section className="rounded border border-gray-300 p-3 text-sm">
      <h2 className="font-semibold">{t('indicatorHeading')}</h2>
      {/* NULL IS NOT ZERO. Rendering `0%` here would tell the researcher the
          rules had been tested and never needed fixing, before anything was
          looked at. */}
      {state.correctionRate === null ? (
        <p>{t('noCaptureYet')}</p>
      ) : (
        <>
          {/* ONE FACT PER LINE. This was a single sentence carrying the streak,
              the judged count and the distinct count at once — three different
              numbers welded together, which the researcher reported as unclear.
              They are separate facts and none of them is derived from another,
              which is exactly why they cannot be said in one breath. */}
          <ul className="list-disc ps-5">
            <li>{t('judgedOfShown', { judged: state.capturesJudged, shown: state.capturesShown })}</li>
            <li>{t('streakLine', { streak: state.consecutiveCleanCaptures })}</li>
            <li>
              {t('correctionLine', {
                needing: state.capturesNeedingCorrection,
                judged: state.capturesJudged,
              })}
            </li>
            <li>{t('distinctLine', { distinct: state.distinctCapturesShown })}</li>
          </ul>
          <p className="mt-1 text-xs text-gray-600">{t('streakCaveat')}</p>
        </>
      )}
      {state.staleSelectors.length > 0 && (
        <div className="mt-2">
          <h3 className="font-semibold">{t('staleHeading')}</h3>
          <ul className="list-disc ps-5 text-xs">
            {state.staleSelectors.map((s) => (
              <li key={s.selector}>
                <code>{s.selector}</code>{' — '}
                {s.lastMatchedAt === null
                  ? t('staleNever')
                  : t('staleSince', { date: s.lastMatchedAt.slice(0, 10) })}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * How deep the tree opens by itself.
 *
 * The whole document is now reachable, which on a news page is ~880 rows — a
 * tree that would be complete and unusable at the same time. Two levels is the
 * page's shape; anything below it opens on demand.
 */
const OPEN_TO_DEPTH = 2;

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
  /** The whole document's text. A rule matching all of it is not a rule. */
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
  // The first researcher to use the rebuilt tree marked `body.rtl` while
  // exploring and drove the removed pane to 98%. The removed pane told them
  // loudly, which is what it is for — but the click should not have been on
  // offer. Judged by TEXT rather than by depth, so a body with a single
  // all-containing wrapper is refused too.
  const wholeDocument = node.textLength >= documentTextLength;

  return (
    <div className={depth === 0 ? '' : 'ps-3'}>
      <div className="flex items-start gap-1 py-0.5">
        {node.children.length > 0 ? (
          <button
            type="button"
            onClick={() => { setOpen((v) => !v); }}
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
          onClick={() => { onToggle(node.selector); }}
          title={wholeDocument ? t('wholeDocument') : isSelected ? t('unmark') : node.selector}
          className={`min-w-0 flex-1 rounded px-1 text-start ${
            wholeDocument
              ? 'cursor-not-allowed text-gray-500'
              : isSelected
                ? 'bg-amber-100 ring-1 ring-amber-400'
                : 'hover:bg-gray-100'
          }`}
        >
          {/* THE LABEL LEADS. The selector is what the system acts on and it is
              still here, one line down and dimmed — it is simply no longer the
              only thing on offer, which is what made the tree unreadable. */}
          <span className={isSelected ? 'font-semibold' : ''}>{node.label}</span>{' '}
          <span className="text-gray-500">({node.textLength})</span>
          {isSelected && <span className="ms-1 text-amber-800">· {t('marked')}</span>}
          {isSelected && count !== undefined && count !== 1 && (
            <span className="ms-1 text-amber-800">
              {count === 0 ? t('matchedNothing') : t('matched', { count })}
            </span>
          )}
          <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-gray-400">
            <code>{node.selector}</code>
            {node.positional && <span className="ms-1 text-amber-700">· {t('positional')}</span>}
            {node.collapsedFrom.length > 0 && (
              <span className="ms-1">· {t('foldedWrappers', { count: node.collapsedFrom.length })}</span>
            )}
            {wholeDocument && <span className="ms-1">· {t('wholeDocument')}</span>}
          </span>
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
 * Before / after / rules, as the researcher asked for.
 *
 * These are ALTERNATIVES — three views of one capture, only one of which is
 * useful at a time. What must never join them is the removed pane.
 */
function Tabs({
  tabs,
  t,
}: {
  tabs: { id: string; label: string; body: React.ReactNode }[];
  t: ReturnType<typeof useTranslations>;
}) {
  const [active, setActive] = useState(tabs[0]?.id ?? '');
  const current = tabs.find((tab) => tab.id === active) ?? tabs[0];
  return (
    <section className="min-w-0">
      <div role="tablist" aria-label={t('title')} className="flex gap-1 border-b border-gray-300">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === current?.id}
            onClick={() => { setActive(tab.id); }}
            className={`rounded-t px-3 py-1 text-sm ${
              tab.id === current?.id
                ? 'border border-b-0 border-gray-300 bg-white font-semibold'
                : 'text-gray-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="pt-2">{current?.body}</div>
    </section>
  );
}

function Rules({
  selectors,
  preview,
  disabled,
  onRemove,
  t,
}: {
  selectors: string[];
  preview: Preview | null;
  disabled: boolean;
  onRemove: (selector: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <section>
      <h2 className="font-semibold">{t('rulesHeading')}</h2>
      {selectors.length === 0 ? (
        <p className="text-sm text-gray-600">{t('noRules')}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {selectors.map((sel) => {
            const count = preview?.matchCounts[sel];
            const invalid = preview?.invalidSelectors.includes(sel) === true;
            return (
              <li key={sel} className="flex items-center gap-2">
                <code>{sel}</code>
                {/* A count of 0 and a REJECTED selector are different facts and
                    are shown differently — one is a redesign, the other a typo. */}
                {invalid ? (
                  <span className="text-red-700">{t('invalidSelector')}</span>
                ) : count === undefined ? null : count === 0 ? (
                  <span className="text-amber-800">{t('matchedNothing')}</span>
                ) : (
                  <span className="text-gray-600">{t('matched', { count })}</span>
                )}
                <button type="button" disabled={disabled} onClick={() => { onRemove(sel); }} className="text-xs underline">
                  {t('remove')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * THE HALF THAT MAKES THIS PAGE HONEST. Never collapse it, never tab it away.
 *
 * The kept text moved into a tab and this did not, and the asymmetry is the
 * whole point: what survives a rule is reassurance, and what a rule DESTROYS is
 * the evidence. Over-matching is the dangerous direction and it is invisible in
 * the kept pane by construction.
 *
 * It renders beside the tree rather than below it because the first walk found
 * the researcher marking a node and reporting that nothing happened — the pane
 * was three screens away, and it opened scrolled past the text it had removed.
 */
function RemovedPane({
  preview,
  pending,
  t,
}: {
  preview: Preview;
  /** True while the tree has moved on and this pane has not caught up yet. */
  pending: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const percent = useMemo(() => Math.round(preview.removalFraction * 100), [preview.removalFraction]);
  const empty = preview.removedText === '';
  return (
    <section className="min-w-0">
      <h2 className="font-semibold">{t('removedHeading')}</h2>
      <p className="text-xs text-gray-600">{t('removedWhy')}</p>
      <p className="text-xs text-gray-500">{t('removedPinned')}</p>
      <p className={`text-sm ${percent > 0 ? 'font-semibold text-amber-900' : 'text-gray-600'}`}>
        {/* A NUMBER THAT IS SILENTLY OUT OF DATE IS WORSE THAN NO NUMBER, because
            this pane is the only thing that catches over-matching. */}
        {pending ? t('previewPending') : t('removalFraction', { percent })}
      </p>
      {/* `overflow-anchor-none` and no scroll restoration: the pane always shows
          the TOP of what was removed. It used to open scrolled to its tail, so
          the researcher saw the end of a nav block and not the block. */}
      <pre
        className={`h-72 overflow-auto whitespace-pre-wrap border border-amber-400 bg-amber-50 p-2 text-xs ${
          pending ? 'opacity-50' : ''
        }`}
      >
        {empty ? t('removedNothing') : preview.removedText}
      </pre>
    </section>
  );
}
