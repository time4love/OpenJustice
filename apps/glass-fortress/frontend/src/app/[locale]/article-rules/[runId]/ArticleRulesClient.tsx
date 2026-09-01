'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { authedFetch, authHeaders } from '@/lib/api';
import { Link, usePathname } from '@/i18n/navigation';

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
  /** `YYYY-MM-DD` — the page has to say which capture is on screen. */
  snapshotDate: string;
  /** The page this capture is OF, not the archive link that serves it. */
  pageUrl: string;
}

interface Preview {
  keptText: string;
  removedText: string;
  /** The removed text, attributed to the rule that removed it. */
  removedSegments: { selector: string; text: string }[];
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

/**
 * The marking surface, in one of two shapes.
 *
 * WITH `snapshotId` IT IS A SINGLE-CAPTURE VIEW — the researcher's ruling: the UI
 * checks and corrects a ruleset against ONE capture, and everything else is MCP.
 * The capture strip, the progress panel and the finish section are sequencing,
 * reporting and approval, which `next_article_capture`, `get_article_rules` and
 * `commit_article_rules` now own. Showing them here hands the researcher
 * controls that decide things the tools decide.
 *
 * WITHOUT IT, the run-level page as it was. Kept while the flow proves out, so a
 * researcher mid-run is not stranded — not because both shapes are wanted.
 */
export function ArticleRulesClient({ runId, snapshotId }: { runId: string; snapshotId?: string }) {
  /** True in the single-capture shape. Named for what it IS, not what it hides. */
  const oneCapture = snapshotId !== undefined;
  const t = useTranslations('articleRules');

  const [state, setState] = useState<RunState | null>(null);
  const [captures, setCaptures] = useState<{ total: number; sample: CaptureRow[] } | null>(null);
  const [capture, setCapture] = useState<CaptureDetail | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selectors, setSelectors] = useState<string[]>([]);
  const [skipReason, setSkipReason] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const pathname = usePathname();
  const [error, setError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
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
   * The selectors last SAVED as a draft, and whether the draft was handed back.
   *
   * The baseline is what was saved, not what is committed: a researcher who marks
   * a block and unmarks it is back at the committed ruleset but their draft still
   * needs writing, or a reload would resurrect marks they had removed.
   */
  const [draftBaseline, setDraftBaseline] = useState<string[]>([]);
  const [returnedAt, setReturnedAt] = useState<string | null>(null);
  /**
   * This window has handed its ruleset back and is FINISHED.
   *
   * Deliberately NOT `returnedAt`, which is the server's flag and survives a
   * reload. A page that went terminal on the stored flag could never be reopened
   * to correct anything — `open_article_capture` on a capture with a returned
   * draft would hand back a screen with no controls, which is a trap rather than
   * a guard. Reopening is a fresh act of intent and gets a working page; it is
   * also the way back for a researcher who handed over too early.
   */
  const [finished, setFinished] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const commandRef = useRef<HTMLElement | null>(null);

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

  const cancelSettle = useCallback(() => {
    if (settleTimer.current !== null) {
      clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
  }, []);

  const base = `/api/article-rules/${runId}`;

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
      const body: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = body as { error?: string; message?: string };
        // A stale version is another tab having got there first, not a fault —
        // the page re-reads and re-offers rather than presenting a race as a bug.
        // A signed-out researcher gets OUR sentence, in their language. The
        // backend's 401 body is English prose written for an API client, and
        // showing it here would put an untranslated string in front of a Hebrew
        // reader at the one moment the page cannot do anything for them.
        if (res.status === 401 || res.status === 403) throw new SignedOutError(t('signedOut'));
        if (res.status === 409) throw new StaleError(t('staleVersion'));
        if (res.status === 410) throw new Error(err.error === 'run_closed' ? t('runClosed') : t('expired'));
        throw new Error(err.message ?? t('offline'));
      }
      return body as T;
    },
    [t],
  );

  /**
   * One place decides what a failure LOOKS like.
   *
   * A dead session is not a red line among other red lines: nothing on this
   * screen recovers it, and the researcher's marks stop being saved from that
   * moment. It gets its own banner and a way back in. Everything else is a
   * message.
   */
  const reportError = useCallback(
    (err: unknown) => {
      if (err instanceof SignedOutError) setSignedOut(true);
      else setError(err instanceof Error ? err.message : t('offline'));
    },
    [t],
  );

  const refresh = useCallback(async () => {
    setState(await call<RunState>(base));
  }, [base, call]);


  const runPreview = useCallback(
    async (snapshotId: string, rules: string[]) => {
      const next = await call<Preview>(`${base}/captures/${snapshotId}/preview`, {
        method: 'POST',
        body: JSON.stringify({ selectors: rules }),
      });
      setPreview(next);
      setPreviewFor(rules);
      setPreviewFailed(false);
    },
    [base, call],
  );

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

        // THE SINGLE-CAPTURE SHAPE OPENS ON ITS CAPTURE. A tool named this one;
        // landing on a page that shows nothing until something is clicked would
        // make the deep link pointless. `CAPTURE_SHOWN` is appended for it, the
        // same as any other showing — being shown is being shown, however the
        // researcher arrived.
        if (snapshotId !== undefined) {
          const detail = await call<CaptureDetail>(`${base}/captures/${snapshotId}`);
          if (cancelled) return;
          setCapture(detail);

          // A DRAFT FOR THIS CAPTURE WINS OVER THE COMMITTED RULES. It is the
          // researcher's work in progress; showing them the rules in force after
          // a reload would silently discard it, which is the thing persisting it
          // exists to prevent.
          const { draft } = await call<{
            draft: { selectors: string[]; snapshotId: string; returnedAt: string | null } | null;
          }>(`${base}/draft`);
          const rules =
            draft !== null && draft.snapshotId === snapshotId ? draft.selectors : run.selectors;
          setSelectors(rules);
          setDraftBaseline(draft !== null && draft.snapshotId === snapshotId ? rules : []);
          setReturnedAt(draft?.snapshotId === snapshotId ? draft.returnedAt : null);
          await runPreview(snapshotId, rules);
          // NO `CAPTURE_SHOWN` FROM HERE. Being shown is a decision, and the page
          // writes none: `open_article_capture` is the thing that shows a capture,
          // so it is the thing that records the showing. Posting it here also
          // meant a re-run of this effect appended a second one against a moved
          // version — a 409, and an inflated `capturesShown` if it landed.
        }
      } catch (err) {
        if (!cancelled) reportError(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [base, call, t, snapshotId, runPreview, reportError]);

  /**
   * Save the researcher's work in progress. THE ONLY THING THIS PAGE WRITES.
   *
   * A DRAFT IS NOT A DECISION, and that is the whole of the page's new contract:
   * it takes a ruleset in and returns a corrected one, deciding nothing. The
   * verdict and the approval are made through tools, with the draft in hand.
   *
   * Writing a `RULESET_CORRECTED` per settle is what this replaces, and what that
   * cost is on the record: clicks swallowed behind two sequential POSTs, eight
   * correction rows for one capture's worth of exploration, and a page that raced
   * itself into a 409 with no other tab open. None of those are reachable from
   * here — a draft is one row per run, last write wins, no version to collide on.
   */
  const saveDraft = useCallback(
    async (rules: string[], returned: boolean) => {
      if (capture === null) return;
      await call(`${base}/draft`, {
        method: 'PUT',
        body: JSON.stringify({ snapshotId: capture.snapshotId, selectors: rules, returned }),
      });
      setDraftBaseline(rules);
      setReturnedAt(returned ? new Date().toISOString() : null);
    },
    [base, call, capture],
  );


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
        reportError(err);
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
    // Save the draft first, then act. The draft belongs to what is on screen; a
    // judgement or a capture change must not leave it behind.
    if (!sameSet(selectors, draftBaseline)) await saveDraft(selectors, false);
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
      void runPreview(capture.snapshotId, selectors).catch((err: unknown) => {
        // NOT SWALLOWED. A discarded rejection here left the pane reading
        // "recomputing" forever while every mark did nothing — a dead session
        // presenting as a working page with dead feedback, which cost four
        // misdiagnoses in one day. The pane must say it is stale, and say why.
        setPreviewFailed(true);
        reportError(err);
      });
    }, PREVIEW_MS);
    return () => { clearTimeout(id); };
  }, [capture, selectors, runPreview, reportError]);

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
    // Against what was last SAVED as a draft, not against the committed rules:
    // a draft that matches the ruleset in force is still a draft worth keeping,
    // because the researcher may have marked and unmarked back to it.
    if (sameSet(selectors, draftBaseline)) return undefined;
    const id = setTimeout(() => {
      settleTimer.current = null;
      void (async () => {
        try {
          await saveDraft(selectors, false);
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
            reportError(err);
          }
        }
      })();
    }, SETTLE_MS);
    settleTimer.current = id;
    return () => { clearTimeout(id); };
  }, [capture, selectors, state, saveDraft, refresh, t, draftBaseline, reportError]);

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

  /**
   * Copy the handoff command, and SAY WHICH HAPPENED.
   *
   * `writeText` REJECTS more readily than it looks: `NotAllowedError` for a
   * document that is not focused, and for an embedded view whose permissions
   * policy withholds `clipboard-write`. The previous spelling ended in
   * `.catch(() => undefined)`, so every one of those became a button that did
   * nothing and said nothing — indistinguishable, from the outside, from a dead
   * control. A button reporting neither success nor failure is one you have to
   * test by pasting somewhere else to find out.
   *
   * THIRD TIME THIS SWALLOW HAS COST SOMETHING in this file. It is not a style
   * preference: a discarded rejection turns a failure into a non-event, and a
   * non-event is what nobody reports until it has wasted an afternoon.
   *
   * On refusal the command is left SELECTED, so the keyboard still works and a
   * refusal costs one keystroke rather than the handoff — which is what the old
   * comment claimed happened, without anything doing it.
   */
  const copyCommand = async () => {
    if (capture === null) return;
    const text = judgeCommand(runId, capture.snapshotId);
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
    } catch {
      const node = commandRef.current;
      const selection = window.getSelection();
      if (node && selection) {
        const range = document.createRange();
        range.selectNodeContents(node);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      setCopyState('failed');
    }
    // Reverts, so the button stops reporting on a copy that happened a while ago
    // and may not be what is now on the clipboard.
    setTimeout(() => { setCopyState('idle'); }, 4000);
  };

  const closed = state !== null && state.status !== 'OPEN';

  /*
   * A DEAD SESSION IS NOT A RED LINE AMONG RED LINES. Nothing on this screen
   * recovers it, and every mark made from here on is unsaved — so it says so
   * where the researcher is looking and carries the way back in, rather than
   * being a sentence that describes a button nobody was given.
   *
   * The wording splits on whether the page ever loaded: arriving signed out is
   * an invitation, being signed out mid-run is a warning that work has stopped
   * being saved. The page keeps rendering in the second case, because signing in
   * elsewhere and coming back should not cost the marks already made.
   */
  const signedOutBanner = signedOut && (
    <div className="rounded border-2 border-red-600 bg-red-50 p-3 text-sm text-red-900">
      <p className="font-bold">{state === null ? t('signedOut') : t('sessionExpired')}</p>
      <Link
        href={`/login?returnTo=${encodeURIComponent(pathname)}`}
        className="mt-2 inline-block rounded bg-red-700 px-3 py-1.5 font-semibold text-white hover:bg-red-800"
      >
        {t('signInAgain')}
      </Link>
    </div>
  );

  // Signed out before the first read landed: there is no state coming, and
  // without this the page waits on `loading` forever.
  if (signedOut && !state) return <Shell>{signedOutBanner}</Shell>;
  if (error && !state) return <Shell><p className="text-red-700">{error}</p></Shell>;
  if (!state) return <Shell><p>{t('loading')}</p></Shell>;

  return (
    <Shell>
      {/* WHICH CAPTURE, AND OF WHAT. The page carried a title and a paragraph of
          instructions and never said what was on screen — a researcher deep in a
          run had no way to tell one capture from another without leaving it. */}
      <h1 className="text-2xl font-bold">
        {capture === null ? t('title') : t('captureFrom', { date: capture.snapshotDate })}
      </h1>
      {capture !== null && (
        <p className="text-sm text-gray-600" dir="ltr">
          {capture.pageUrl}
        </p>
      )}

      {signedOutBanner}
      {notice && <p className="rounded bg-amber-50 p-2 text-sm text-amber-900">{notice}</p>}
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-800">{error}</p>}

      {/* SEQUENCING, REPORTING AND APPROVAL ARE MCP'S NOW. In the single-capture
          shape none of them render: the strip picks a capture, the panel reports
          progress, and the finish section approves — `next_article_capture`,
          `get_article_rules` and `commit_article_rules` do each of those. */}
      {!oneCapture && <Indicator state={state} t={t} />}

      {!oneCapture && (
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
      )}

      {/*
        THE WORKING AREA. Marking happens in the left column and its consequence
        is rendered in the right one, side by side, because the first walk found
        the researcher clicking a node and seeing nothing happen: the removal
        fraction and the removed text were three screens below the control.
        A wide screen is assumed here and that is deliberate — this route sits
        behind the researcher unlock and is not part of the public site, so the
        project's mobile-first rule was never about this page. It still stacks.
      */}
      {capture && !finished && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section className="flex min-w-0 flex-col">
            <h2 className="font-semibold">{t('outlineHeading')}</h2>
            <p className="text-xs text-gray-600">{t('outlineHint')}</p>
            {/* The "everything is reachable" line is gone: it reported a
                non-event on every healthy page, which is noise. The TRUNCATED
                case still speaks, because that one is a finding. */}
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
            ) : null}
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
                      <p className="text-xs text-gray-600">{t('renderedOutlineNote')}</p>
                      <iframe
                        title={capture.snapshotUrl}
                        sandbox=""
                        srcDoc={highlighted(capture.html, selectors)}
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
            {preview && (
              <RemovedPane
                preview={preview}
                pending={previewPending}
                failed={previewFailed}
                disabled={busy || closed}
                onUnmark={(sel) => { applyRules(selectors.filter((x) => x !== sel)); }}
                t={t}
              />
            )}
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
      {capture && !closed && !oneCapture && (
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

      {/* A PAGE WITH NO WAY TO FINISH READS AS A BROKEN PAGE. The verdict buttons
          are gone on purpose — judging is `judge_article_capture` now — but the
          researcher opened this view and found nothing to click, which is the
          same defect as the accept that recorded a decision and said nothing.
          Correct behaviour still has to be legible. */}
      {/*
        THE PAGE'S OUTPUT, AND THE ONLY TWO THINGS IT CAN SAY.
        "Here is my corrected ruleset" and "forget my changes" — neither is a
        verdict and neither is an approval. Those are made in the chat, with this
        draft in hand. Removing the old accept/reject buttons without putting
        these here left a page with no way to finish, which reads as broken.
      */}
      {oneCapture && !closed && (
        <section className="rounded border border-gray-300 p-3">
          {/* ONCE IT IS HANDED BACK, IT IS HANDED BACK. Leaving the controls live
              would let a researcher keep marking a page whose ruleset has already
              been returned — the screen and the draft in the chat would drift
              apart, and only one of them is real. */}
          {!finished && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
              onClick={() => {
                void guard(async () => {
                  await saveDraft(selectors, true);
                  // The panel below says this, and says it with the command
                  // attached. A banner repeating it at the top of a page whose
                  // only remaining content IS that panel is noise.
                  setNotice(null);
                  setFinished(true);
                });
              }}
            >
              {busy ? t('saving') : t('handBack')}
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded border border-gray-400 px-3 py-2 text-sm disabled:opacity-50"
              onClick={() => {
                void guard(async () => {
                  await call(`${base}/draft`, { method: 'DELETE' });
                  // Back to the rules in force — discarding the draft means the
                  // page shows what a scan would use, not what was abandoned.
                  const rules = state.selectors;
                  setSelectors(rules);
                  setDraftBaseline(rules);
                  setReturnedAt(null);
                  setNotice(t('discardDone'));
                });
              }}
            >
              {t('discardDraft')}
            </button>
          </div>
          )}

          {/* BELOW THE BUTTONS, because that is where the researcher is looking
              once they have clicked one — and it hands over the COMMAND rather
              than describing it. Retyping two cuids from a screen is a
              transcription error waiting to happen, and the ids are the two
              things in this flow nobody can sanity-check by eye. */}
          {returnedAt !== null && capture !== null && (
            <div className={finished ? '' : 'mt-3 border-t border-gray-300 pt-3'}>
              <p className="text-sm">
                <span className="font-semibold text-green-800">{t('handBackDone')}</span>{' '}
                <span className="text-gray-700">{t('commandLabel')}</span>
              </p>
              <div className="mt-1 flex items-start gap-2">
                <code
                  ref={commandRef}
                  dir="ltr"
                  className="block flex-1 overflow-x-auto whitespace-nowrap rounded border border-gray-700 bg-gray-900 p-2 font-mono text-xs text-gray-100"
                >
                  {judgeCommand(runId, capture.snapshotId)}
                </code>
                <button
                  type="button"
                  title={t('copyCommand')}
                  className="shrink-0 rounded border border-gray-400 px-2 py-1.5 text-xs hover:bg-gray-100"
                  onClick={() => {
                    void copyCommand();
                  }}
                >
                  <CopyIcon state={copyState} />
                  <span className="sr-only">{t('copyCommand')}</span>
                </button>
              </div>
              {/* AN INTERACTIVE PAGE SHOULD SAY WHEN IT IS DONE WITH YOU. Without
                  it a researcher is left on a screen with nothing to do and no
                  statement that nothing is what is left to do. */}
              {/* SAY WHICH HAPPENED. A copy button that reports neither success
                  nor failure is a button you have to test by pasting somewhere
                  else — and this one could not copy at all in a browser without
                  a clipboard API, silently, because the throw was synchronous. */}
              {copyState === 'copied' && (
                <p className="mt-1 text-xs text-green-700">{t('copied')}</p>
              )}
              {copyState === 'failed' && (
                <p className="mt-1 text-xs text-amber-800">{t('copyFailed')}</p>
              )}
              {finished && <p className="mt-3 text-sm text-gray-600">{t('closeWindow')}</p>}
            </div>
          )}
        </section>
      )}

      {!closed && !oneCapture && (
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
 * The session is gone — expired, revoked, or never there.
 *
 * TYPED RATHER THAN MATCHED ON ITS TEXT, because the page renders it differently
 * from every other failure: nothing the researcher does on this screen can
 * recover it, so it gets a way back in instead of a red line. Comparing the
 * translated sentence would tie that behaviour to the Hebrew wording.
 */
class SignedOutError extends Error {}

/**
 * The captured page with every marked element outlined — CSS ONLY.
 *
 * THE DEVTOOLS FEELING, IN THE DIRECTION THAT DOES NOT COST THE SANDBOX. The
 * researcher asked for the Chrome inspector's hover-to-see-the-element, and the
 * page → tree half of that needs code running inside the frame, which means
 * `allow-scripts`. That would turn `inertDocument` from the SECOND defence into
 * the ONLY one, on captures of real commercial pages carrying real ad and
 * analytics payloads — a missed `<svg><script>` or `javascript:` href would then
 * execute where today nothing runs at all. The tree → page half needs no script:
 * a stylesheet naming the marked selectors is enough.
 *
 * IT IS A BETTER OVER-MATCH DETECTOR THAN THE TEXT, and that is the real reason
 * to have it. Over-matching is currently caught by READING the removed pane and
 * recognising a sentence. Outlining catches it SPATIALLY: a rule that swallowed
 * the article lights up the article, in the layout, at a glance.
 *
 * Each selector gets its OWN rule, so a selector the browser rejects is skipped
 * on its own rather than killing the whole block. Anything containing a `<` or a
 * closing brace is refused outright: these strings come from our own outline,
 * but they are interpolated into markup, and a rule that is merely unlikely to
 * be hostile is not a rule.
 */
function highlighted(html: string, selectors: readonly string[]): string {
  const safe = selectors.filter((s) => !/[<>{}]/.test(s));
  if (safe.length === 0) return html;
  const style =
    `<style>${safe
      .map(
        (s) =>
          `${s}{outline:3px solid #d97706 !important;` +
          `outline-offset:-3px !important;background:rgba(217,119,6,.18) !important;}`,
      )
      .join('')}</style>`;
  // Appended rather than inserted into <head>: the document may not have one,
  // and a trailing <style> still applies. The parser moves it where it belongs.
  return `${html}${style}`;
}

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
    // COLLAPSED, BECAUSE IT IS REFERENCE AND NOT THE WORK. Four lines of
    // counters sat above the marking area taking the top of every screen, and
    // this is something a researcher consults rather than uses.
    //
    // WHAT DOES NOT COLLAPSE IS THE WARNINGS. The repeat-judgement notice and
    // the stale-selector list are exceptions — they cost nothing when everything
    // is fine, and a warning behind a disclosure is a warning nobody reads. The
    // headline stays on the summary line for the same reason: Level 4's stopping
    // rule is "no corrections on the last three", and nobody decides to stop
    // against a number they have to go and open.
    //
    // `<details>` rather than a hover tooltip, which is unreachable by keyboard,
    // invisible on touch, and vanishes while you are reading it.
    <section className="rounded border border-gray-300 p-3 text-sm">
      {/* NULL IS NOT ZERO. Rendering `0%` here would tell the researcher the
          rules had been tested and never needed fixing, before anything was
          looked at. */}
      {state.correctionRate === null ? (
        <>
          <h2 className="font-semibold">{t('indicatorHeading')}</h2>
          <p>{t('noCaptureYet')}</p>
        </>
      ) : (
        <>
          <details>
            <summary className="cursor-pointer font-semibold">
              {t('indicatorHeading')}{' — '}
              <span className="font-normal text-gray-700">
                {t('indicatorSummary', {
                  distinct: state.judgedCaptures.length,
                  streak: state.consecutiveCleanCaptures,
                })}
              </span>
            </summary>
          {/* ONE FACT PER LINE. This was a single sentence carrying the streak,
              the judged count and the distinct count at once — three different
              numbers welded together, which the researcher reported as unclear.
              They are separate facts and none of them is derived from another,
              which is exactly why they cannot be said in one breath. */}
          {/* DISTINCT CAPTURES LEADS, because it is the only one of these
              numbers that says anything about coverage. The four lines read as
              four independent facts, and "2 judged of 2 shown" beside "1
              different capture" left the reader to notice the contradiction —
              two judgements of ONE page, presented as if two pages had been
              tested. The plan named this shape: three clean showings of one
              capture is the vacuity this level demotes, wearing the streak's
              clothes. */}
            <ul className="mt-1 list-disc ps-5">
              <li>{t('judgedDistinct', { distinct: state.judgedCaptures.length })}</li>
              <li>{t('streakLine', { streak: state.consecutiveCleanCaptures })}</li>
              <li>
                {t('correctionLine', {
                  needing: state.capturesNeedingCorrection,
                  judged: state.capturesJudged,
                })}
              </li>
              <li className="text-gray-600">
                {t('judgedEpisodes', {
                  episodes: state.capturesJudged,
                  shown: state.capturesShown,
                })}
              </li>
            </ul>
            <p className="mt-1 text-xs text-gray-600">{t('streakCaveat')}</p>
          </details>

          {/* OUTSIDE the disclosure, on purpose — see the note above. */}
          {state.capturesJudged > state.judgedCaptures.length && (
            <p className="mt-1 rounded bg-amber-50 p-2 text-xs text-amber-900">
              {t('repeatWarning')}
            </p>
          )}
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
          // The full label AND the selector: labels now carry a text preview and
          // are clamped to one line, so the hover is where the rest of it lives.
          title={
            wholeDocument
              ? t('wholeDocument')
              : `${node.label}\n${node.selector}${isSelected ? `\n${t('unmark')}` : ''}`
          }
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
          {/* ONE LINE. Labels carry a text preview now, so an unclamped label
              wraps to three lines and a tree of 658 rows stops being scannable. */}
          <span
            className={`block overflow-hidden text-ellipsis whitespace-nowrap ${
              isSelected ? 'font-semibold' : ''
            }`}
          >
            {node.label} <span className="text-gray-500">({node.textLength})</span>
          </span>
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
  failed,
  disabled,
  onUnmark,
  t,
}: {
  preview: Preview;
  /** True while the tree has moved on and this pane has not caught up yet. */
  pending: boolean;
  /** The last refresh threw. What is on screen is stale, and must not read as merely slow. */
  failed: boolean;
  disabled: boolean;
  onUnmark: (selector: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const percent = useMemo(() => Math.round(preview.removalFraction * 100), [preview.removalFraction]);
  const empty = preview.removedText === '';
  return (
    <section className="min-w-0">
      {/* A BOLD LINE, NOT A PARAGRAPH. Everything below it is what has to be
          checked before approving, and a rule across the page says that faster
          than three sentences explaining why over-matching is invisible — which
          is true, and is why this pane exists, and belongs in the code rather
          than on screen. */}
      <div className="mb-2 border-t-4 border-amber-500 pt-2">
        <h2 className="font-semibold">{t('removedHeading')}</h2>
      </div>
      <p className={`text-sm ${percent > 0 ? 'font-semibold text-amber-900' : 'text-gray-600'}`}>
        {/* A NUMBER THAT IS SILENTLY OUT OF DATE IS WORSE THAN NO NUMBER, because
            this pane is the only thing that catches over-matching. */}
        {failed
          ? t('previewFailed')
          : pending
            ? t('previewPending')
            : t('removalFraction', { percent })}
      </p>
      {/* `overflow-anchor-none` and no scroll restoration: the pane always shows
          the TOP of what was removed. It used to open scrolled to its tail, so
          the researcher saw the end of a nav block and not the block. */}
      {/*
        EACH BLOCK IS THE RULE THAT REMOVED IT, AND CLICKING IT UNDOES THAT RULE.
        The pane is where over-matching becomes visible, so it is where undoing
        should be possible: a researcher who reads the article's own reporting in
        here should not then have to work out which of a dozen marks swallowed it
        and hunt that row down in a 658-row tree.
      */}
      <div
        className={`h-72 overflow-auto border border-amber-400 bg-amber-50 p-2 text-xs ${
          pending ? 'opacity-50' : ''
        }`}
      >
        {empty ? (
          <p>{t('removedNothing')}</p>
        ) : (
          preview.removedSegments.map((seg) => (
            <button
              key={seg.selector}
              type="button"
              disabled={disabled}
              onClick={() => { onUnmark(seg.selector); }}
              title={`${t('unmarkThisRule')}\n${seg.selector}`}
              className="mb-2 block w-full whitespace-pre-wrap rounded border border-amber-300 bg-white/60 p-1 text-start hover:border-amber-600 hover:bg-white disabled:cursor-not-allowed"
            >
              <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-amber-800">
                <code>{seg.selector}</code>
              </span>
              {seg.text}
            </button>
          ))
        )}
      </div>
    </section>
  );
}

/**
 * The exact call the researcher pastes into the chat, ids filled in.
 *
 * THE IDS ARE THE PART NOBODY CAN CHECK BY EYE. Two cuids, differing in the
 * middle, naming a run and a capture — retyping them from a screen is a
 * transcription error that would attach a verdict to the wrong document, and
 * nothing downstream would notice.
 *
 * IT OFFERS NO REJECTION, AND THAT IS THE RESEARCHER'S RULING. This dialog
 * exists to FIX the rules; someone who opens it and returns "the rules are
 * wrong" has given up rather than decided, which is not an outcome the page
 * should hand them a button for.
 *
 * AND THE ONE REJECTION THAT LOOKED LEGITIMATE WAS A SYMPTOM, NOT A VERDICT.
 * `2025-03-26` was rejected because correcting the rules for it would have broken
 * 2020, where they work — but that dilemma exists only because A RULESET IS NOT
 * SCOPED TO AN ERA (recorded as a gap in `docs/gf-level4-third-marking-walk-
 * 2026-09-01.md`: nothing selects a ruleset by the era of the capture being
 * scanned). With era-scoped rulesets there is no capture you would give up
 * correcting; you correct the ruleset for that era. Rejection is the system
 * forcing a bad choice, and it should be revisited when the gap closes.
 */
/**
 * The standard clipboard glyph, and a tick once the command has been taken.
 *
 * An icon rather than a word: the button sits against a code line the researcher
 * is about to paste, and that is a shape everyone already reads. The label lives
 * in `title` and a screen-reader-only span, so nothing is lost by not printing it.
 */
function CopyIcon({ state }: { state: 'idle' | 'copied' | 'failed' }) {
  const shared = {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (state === 'copied') {
    return (
      <svg {...shared}>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }
  return (
    <svg {...shared}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function judgeCommand(runId: string, snapshotId: string): string {
  return `judge_article_capture runId=${runId} snapshotId=${snapshotId} verdict=ACCEPTED`;
}
