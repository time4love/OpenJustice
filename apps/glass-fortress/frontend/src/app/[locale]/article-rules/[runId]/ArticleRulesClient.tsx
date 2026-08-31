'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  corrections: number;
  capturesNeedingCorrection: number;
  correctionRate: number | null;
  consecutiveCleanCaptures: number;
  staleSelectors: { selector: string; lastMatchedAt: string | null }[];
  storedCaptures: number;
  effect: string;
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
      setPreview(
        await call<Preview>(`${base}/captures/${snapshotId}/preview`, {
          method: 'POST',
          body: JSON.stringify({ selectors: rules }),
        }),
      );
    },
    [base, call],
  );

  const guard = async (work: () => Promise<void>) => {
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
    void guard(async () => {
      const detail = await call<CaptureDetail>(`${base}/captures/${snapshotId}`);
      setCapture(detail);
      await runPreview(snapshotId, selectors);
      await decide('CAPTURE_SHOWN', { snapshotId });
    });

  const decide = async (type: DecisionType, extra: Record<string, unknown> = {}) => {
    if (!state) return;
    const next = await call<RunState>(`${base}/decisions`, {
      method: 'POST',
      body: JSON.stringify({ expectedVersion: state.version, type, ...extra }),
    });
    setState(next);
  };

  const applyRules = (rules: string[]) =>
    void guard(async () => {
      setSelectors(rules);
      if (capture) await runPreview(capture.snapshotId, rules);
      await decide('RULESET_CORRECTED', { selectors: rules });
    });

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
            <ul className="mt-1 flex flex-wrap gap-1">
              {captures.sample.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={busy || closed}
                    onClick={() => { showCapture(c.id); }}
                    className={`rounded border px-2 py-1 text-xs ${
                      capture?.snapshotId === c.id ? 'border-black bg-gray-100' : 'border-gray-300'
                    }`}
                  >
                    {c.snapshotDate}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {capture && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section>
            <h2 className="font-semibold">{t('renderedHeading')}</h2>
            <p className="text-xs text-gray-600">{t('renderedNote')}</p>
            {/*
              NO `allow-scripts`, EVER. Selection happens against the outline
              beside this frame, so nothing needs to run inside it. An empty
              sandbox blocks scripts, forms, popups and same-origin access.
            */}
            <iframe
              title={capture.snapshotUrl}
              sandbox=""
              srcDoc={capture.html}
              className="h-96 w-full border border-gray-300 bg-white"
            />
          </section>

          <section>
            <h2 className="font-semibold">{t('outlineHeading')}</h2>
            {capture.outlineTruncated && (
              <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">{t('outlineTruncated')}</p>
            )}
            <div className="h-96 overflow-auto border border-gray-300 p-2 text-xs">
              <Outline
                node={capture.outline}
                selected={selectors}
                disabled={busy || closed}
                onPick={(sel) => { applyRules(selectors.includes(sel) ? selectors : [...selectors, sel]); }}
                t={t}
              />
            </div>
          </section>
        </div>
      )}

      <Rules
        selectors={selectors}
        preview={preview}
        disabled={busy || closed}
        onRemove={(sel) => { applyRules(selectors.filter((s) => s !== sel)); }}
        t={t}
      />

      {preview && <TextPanes preview={preview} t={t} />}

      {capture && !closed && (
        <section className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} className="rounded bg-black px-3 py-2 text-sm text-white"
            onClick={() => { void guard(() => decide('CAPTURE_ACCEPTED', { snapshotId: capture.snapshotId })); }}>
            {t('accept')}
          </button>
          <button type="button" disabled={busy} className="rounded border border-gray-400 px-3 py-2 text-sm"
            onClick={() => { void guard(() => decide('CAPTURE_REJECTED', { snapshotId: capture.snapshotId })); }}>
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
                void guard(async () => {
                  await decide('CAPTURE_SKIPPED', { snapshotId: capture.snapshotId, reason: skipReason });
                  setSkipReason('');
                });
              }}>
              {t('skip')}
            </button>
          </label>
        </section>
      )}

      {!closed && (
        <section className="rounded border border-gray-300 p-3">
          {/* RENDERED FROM THE BACKEND'S DECLARATION. Nobody writes this sentence
              on this side — a confirmation authored next to the effect it
              describes is free to drift from it. */}
          <p className="text-sm">{state.effect}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy} className="rounded bg-black px-3 py-2 text-sm text-white"
              onClick={() => { finish('commit'); }}>
              {t('commit')}
            </button>
            <button type="button" disabled={busy} className="rounded border border-gray-400 px-3 py-2 text-sm"
              onClick={() => { finish('abandon'); }}>
              {t('abandon')}
            </button>
          </div>
        </section>
      )}
    </Shell>
  );
}

/** A 409 is a race, not a fault, and the caller treats it differently. */
class StaleError extends Error {}

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
          <p>
            {t('cleanStreak', {
              streak: state.consecutiveCleanCaptures,
              // JUDGED, not shown: a capture the researcher looked at and left
              // alone is not one the rules were tested against.
              judged: state.capturesJudged,
              distinct: state.distinctCapturesShown,
            })}
          </p>
          <p className="text-xs text-gray-600">{t('streakCaveat')}</p>
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

function Outline({
  node,
  selected,
  disabled,
  onPick,
  t,
}: {
  node: OutlineNode;
  selected: string[];
  disabled: boolean;
  onPick: (selector: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const isSelected = selected.includes(node.selector);
  return (
    <div className="ps-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => { onPick(node.selector); }}
        title={node.positional ? t('positional') : node.selector}
        className={`text-start ${isSelected ? 'font-bold' : ''} ${node.positional ? 'text-amber-800' : ''}`}
      >
        <code>{node.selector}</code>{' '}
        <span className="text-gray-500">({node.textLength})</span>
      </button>
      {node.children.map((child) => (
        <Outline key={child.selector} node={child} selected={selected} disabled={disabled} onPick={onPick} t={t} />
      ))}
    </div>
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

function TextPanes({ preview, t }: { preview: Preview; t: ReturnType<typeof useTranslations> }) {
  const percent = useMemo(() => Math.round(preview.removalFraction * 100), [preview.removalFraction]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section>
        <h2 className="font-semibold">{t('keptHeading')}</h2>
        <pre className="h-64 overflow-auto whitespace-pre-wrap border border-gray-300 p-2 text-xs">
          {preview.keptText}
        </pre>
      </section>
      <section>
        {/* THE HALF THAT MAKES THIS PAGE HONEST. Never collapse or hide it. */}
        <h2 className="font-semibold">{t('removedHeading')}</h2>
        <p className="text-xs text-gray-600">{t('removedWhy')}</p>
        <p className="text-xs">{t('removalFraction', { percent })}</p>
        <pre className="h-64 overflow-auto whitespace-pre-wrap border border-amber-400 bg-amber-50 p-2 text-xs">
          {preview.removedText === '' ? t('removedNothing') : preview.removedText}
        </pre>
      </section>
    </div>
  );
}
