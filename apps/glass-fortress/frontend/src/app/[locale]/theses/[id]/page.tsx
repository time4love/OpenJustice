'use client';

import { useState, useEffect, useMemo, useRef, Suspense, use } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { apiUrl, authHeaders, fetchJson } from '@/lib/api';
import { useAsyncData, type AsyncFetcher } from '@/hooks/useAsyncData';
import { truncateLabel } from '@/lib/format';
import { buildCitationNumbers } from '@/lib/citations';
import { TipTapRenderer, type EvidenceInfo, type TrajectoryInfo } from '@/components/TipTapRenderer';
import { LegalDisclaimer } from '@/components/LegalDisclaimer';
import type { EvidenceGap, AIAnalysis, PublicationState, ThesisViewer } from '@/types/thesis';
import { ThesisPublicationPanel } from '@/components/ThesisPublicationPanel';
import { ThesisProvenancePanel } from '@/components/ThesisProvenancePanel';
import { CitationSheet, type CitationTarget } from '@/components/CitationSheet';
import { ThesisVersionHistory } from '@/components/ThesisVersionHistory';
import { PublicationBadge } from '@/components/PublicationBadge';
import { CategoryBadges } from '@/components/CategoryBadges';
import { tierDotColor } from '@/components/TierBadge';
import { StrengthBadge, strengthLabel } from '@/components/StrengthBadge';
import { useAuth } from '@/context/AuthContext';
import { FoiaModal, type FoiaModalState } from '@/components/FoiaModal';
import { WhistleblowerModal } from '@/components/WhistleblowerModal';
import { addEvidenceToThesis } from '@/lib/thesisDocument';
import { generateFoiaRequest } from '@/lib/thesisApi';

// ---------------------------------------------------------------------------
// Types matching the versioned thesis API
// ---------------------------------------------------------------------------

interface ThesisMention {
  id: string;
  type: 'KEY_FIGURE' | 'EVIDENCE' | 'TRACKED_URL' | 'CLAIM_TRAJECTORY';
  /** For CLAIM_TRAJECTORY this is a ClaimTrajectory.id — one detection pass. */
  refId: string;
}


interface ThesisVersion {
  id: string;
  status: 'PENDING_AI' | 'COMPLETE';
  contentHash: string;
  userContent: Record<string, unknown>;
  aiAnalysis: AIAnalysis | null;
  mentions: ThesisMention[];
  createdAt: string;
}

// The version served depends on the viewer: the published one for the public,
// the head for an approved researcher (backend lib/thesisView.ts).
interface Thesis {
  id: string;
  title: string | null;
  createdAt: string;
  viewer: ThesisViewer;
  publication: PublicationState;
  publicInterestStatement: string | null;
  version: ThesisVersion | null;
}

/**
 * The two halves of this page: the argument, and the record of how it was made.
 *
 * Split because the page had become one scroll holding a legal document, its
 * citations, an adversarial critique, a publication gate and an append-only
 * provenance timeline. Two rather than four: on a narrow RTL screen a
 * four-item tab bar truncates, and the real boundary here is binary — what the
 * thesis argues, versus everything the platform did to get there.
 *
 * Citations stay with the ARGUMENT, never behind a tab. A reader following [7]
 * must land on the source; putting the evidence and trajectory lists in another
 * view would break the one link the whole citation layer exists to provide.
 */
type ThesisView = 'thesis' | 'process' | 'history';

/** The switcher's options, in reading order. */
const THESIS_VIEWS: readonly ThesisView[] = ['thesis', 'process', 'history'];

const VIEW_LABEL: Record<ThesisView, 'viewThesis' | 'viewProcess' | 'historyBtn'> = {
  thesis: 'viewThesis',
  process: 'viewProcess',
  history: 'historyBtn',
};

interface GapResolution {
  gapIndex: number;
  evidenceId: string;
  evidence: { summary: string; investigativeCategories: string[]; evidenceTier: string };
  createdAt: string;
}


// ---------------------------------------------------------------------------
// GapSearchPanel — inline vault search + Add to Thesis action
// ---------------------------------------------------------------------------

interface VaultHit {
  fileHash: string;
  summary: string;
  investigativeCategories: string[];
  tier: string;
  evidenceDate: string;
  targetEntity: string;
}

function GapSearchPanel({
  gap, gapIndex, thesisId, thesisContent, resolution, onVersionAdded, onResolved, onGenerateFoia, onSubmitTip, canEdit,
}: {
  gap: EvidenceGap;
  gapIndex: number;
  thesisId: string;
  thesisContent: Record<string, unknown>;
  resolution: GapResolution | null;
  onVersionAdded: () => void;
  onResolved: () => void;
  onGenerateFoia: () => void;
  onSubmitTip: () => void;
  canEdit: boolean;
}) {
  const t = useTranslations('theses');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<VaultHit[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const [resolving, setResolving] = useState<string | null>(null); // fileHash being resolved
  const [unresolving, setUnresolving] = useState(false);

  async function search() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (hits.length > 0) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/evidence/search?q=${encodeURIComponent(gap.suggestedSearch)}&limit=5`));
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { results: { metadata: VaultHit }[] };
      setHits((data.results ?? []).map(r => r.metadata));
    } catch {
      setHits([]);
    } finally {
      setLoading(false);
    }
  }

  async function addToThesis(hit: VaultHit) {
    setAdding(prev => new Set(prev).add(hit.fileHash));
    try {
      await addEvidenceToThesis(thesisId, hit.fileHash, hit.summary, thesisContent);
      setAdded(prev => new Set(prev).add(hit.fileHash));
      onVersionAdded();
    } finally {
      setAdding(prev => { const s = new Set(prev); s.delete(hit.fileHash); return s; });
    }
  }

  async function markResolved(hit: VaultHit) {
    setResolving(hit.fileHash);
    try {
      const res = await fetch(apiUrl(`/api/thesis/${thesisId}/gaps/${gapIndex}/resolve`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evidenceId: hit.fileHash }),
      });
      if (!res.ok) throw new Error();
      onResolved();
    } finally {
      setResolving(null);
    }
  }

  async function unresolve() {
    setUnresolving(true);
    try {
      await fetch(apiUrl(`/api/thesis/${thesisId}/gaps/${gapIndex}/resolve`), { method: 'DELETE' });
      onResolved();
    } finally {
      setUnresolving(false);
    }
  }

  const isResolved = !!resolution;
  const headerBg = isResolved ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200';
  const headerText = isResolved ? 'text-emerald-800' : 'text-amber-800';

  return (
    <div className={`border rounded-xl overflow-hidden ${isResolved ? 'border-emerald-200' : 'border-amber-200'}`}>
      <div className={`${headerBg} p-4 flex items-start justify-between gap-4`}>
        <div className="flex-1 space-y-2 min-w-0">
          <p className={`text-sm ${headerText}`}>{gap.description}</p>
          {isResolved && (
            <p className="text-xs text-emerald-600 font-medium truncate">
              ✓ {resolution.evidence.summary.slice(0, 80)}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={onGenerateFoia}
              className="flex flex-col items-center gap-1 text-xs font-semibold px-4 py-2 rounded-lg bg-sky-100 hover:bg-sky-200 active:bg-sky-300 text-sky-700 transition-colors"
            >
              <Image src="/icon_foia.png" alt="" width={28} height={28} className="w-7 h-7" />
              {t('foiaBtn')}
            </button>
            <button
              onClick={onSubmitTip}
              className="flex flex-col items-center gap-1 text-xs font-semibold px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-600 transition-colors"
            >
              <Image src="/icon_anon.png" alt="" width={28} height={28} className="w-7 h-7" />
              {t('tipBtn')}
            </button>
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2 shrink-0">
            {isResolved && (
              <button
                onClick={() => void unresolve()}
                disabled={unresolving}
                className="text-xs font-semibold px-3 py-1.5 bg-emerald-100 hover:bg-red-100 text-emerald-700 hover:text-red-600 rounded-lg transition-colors"
              >
                {unresolving ? '…' : 'Unresolve'}
              </button>
            )}
            <button
              onClick={search}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                isResolved
                  ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-700'
                  : 'bg-amber-100 hover:bg-amber-200 text-amber-700'
              }`}
            >
              {open ? 'Hide' : 'Search Evidence'}
            </button>
          </div>
        )}
      </div>

      {open && canEdit && (
        <div className="bg-white border-t border-amber-200">
          {gap.suggestedSearch && (
            <p className="text-xs text-slate-400 px-4 pt-3 pb-1 font-mono">{gap.suggestedSearch}</p>
          )}
          {loading && <p className="text-xs text-slate-500 px-4 py-3">Searching vault…</p>}
          {!loading && hits.length === 0 && (
            <p className="text-xs text-slate-400 px-4 py-3">
              No matching evidence in vault — submit new evidence via MCP or the evidence form.
            </p>
          )}
          {!loading && hits.map(hit => (
            <div key={hit.fileHash} className="flex items-start gap-3 px-4 py-3 border-b border-slate-100 last:border-0">
              <span className={`mt-1 shrink-0 w-2 h-2 rounded-full ${tierDotColor(hit.tier)}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 leading-snug">{hit.summary.slice(0, 120)}</p>
                <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                  <CategoryBadges categories={hit.investigativeCategories} max={2} />
                  <span>{hit.evidenceDate}</span>
                </p>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <button
                  disabled={added.has(hit.fileHash) || adding.has(hit.fileHash)}
                  onClick={() => void addToThesis(hit)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                    added.has(hit.fileHash)
                      ? 'bg-emerald-100 text-emerald-700 cursor-default'
                      : adding.has(hit.fileHash)
                      ? 'bg-slate-100 text-slate-400 cursor-wait'
                      : 'bg-violet-100 hover:bg-violet-200 text-violet-700'
                  }`}
                >
                  {added.has(hit.fileHash) ? 'Added ✓' : adding.has(hit.fileHash) ? '…' : 'Add to Thesis'}
                </button>
                <button
                  disabled={resolving === hit.fileHash || resolution?.evidenceId === hit.fileHash}
                  onClick={() => void markResolved(hit)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                    resolution?.evidenceId === hit.fileHash
                      ? 'bg-emerald-100 text-emerald-700 cursor-default'
                      : resolving === hit.fileHash
                      ? 'bg-slate-100 text-slate-400 cursor-wait'
                      : 'bg-amber-100 hover:bg-amber-200 text-amber-700'
                  }`}
                >
                  {resolution?.evidenceId === hit.fileHash ? 'Resolved ✓' : resolving === hit.fileHash ? '…' : 'Mark Resolved'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface ThesisLoad {
  thesis: Thesis;
  evidenceMap: Record<string, EvidenceInfo>;
  trajectoryMap?: Record<string, TrajectoryInfo>;
  gapResolutions?: GapResolution[];
}

// Stable identities for the "not loaded yet" case, so a render that has no
// thesis does not hand children a fresh object each time.
const EMPTY_EVIDENCE_MAP: Record<string, EvidenceInfo> = {};
const EMPTY_TRAJECTORY_MAP: Record<string, TrajectoryInfo> = {};
const EMPTY_GAPS: GapResolution[] = [];

function ThesisPageInner({ id }: { id: string }) {
  const t = useTranslations('theses');
  const tStrength = useTranslations('strengths');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const historicalVersionId = searchParams.get('v');
  // The URL seeds the view, and from then on state owns it.
  //
  // It used to be read from useSearchParams on every render, with router.replace
  // doing the switching. The App Router treats router.replace as a NAVIGATION:
  // every toggle fetched this route's RSC payload from the server, remounted the
  // tree, and re-ran the fetches under it — a toggle that should cost nothing
  // cost a round trip, felt stuck, and re-requested data already on screen.
  const viewParam = searchParams.get('view');
  const initialView: ThesisView =
    viewParam === 'process' || viewParam === 'history' ? viewParam : 'thesis';
  const isHistorical = !!historicalVersionId;
  const { researcher } = useAuth();
  const canEdit = researcher?.approved ?? false;

  const [analyzing, setAnalyzing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [foiaModal, setFoiaModal] = useState<FoiaModalState | null>(null);
  const [tipModalGapIndex, setTipModalGapIndex] = useState<number | null>(null);
  const [foiaError, setFoiaError] = useState<number | null>(null); // gapIndex of failed FOIA gen
  const [view, setView] = useState<ThesisView>(initialView);
  // The process panel mounts on first use and then STAYS mounted, hidden with
  // display. Its provenance timeline fetches on mount, so unmounting it would
  // re-fetch the same record every time the reader looked twice — and mounting
  // it eagerly would fetch it for every reader who never opens it.
  const [processMounted, setProcessMounted] = useState(initialView === 'process');
  const [historyMounted, setHistoryMounted] = useState(initialView === 'history');
  // Which citation is open. One id, resolved to its source at render — holding
  // the resolved object instead would go stale the moment the thesis reloads.
  const [openCitationId, setOpenCitationId] = useState<string | null>(null);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // The dependency is the resolved *string*, never `t` itself: the fetcher's
  // identity is the cache key, and a `t` that is not referentially stable would
  // make it a new key on every render — an endless refetch loop.
  const offlineMessage = t('errorEvaluate');
  const fetchThesis = useMemo<AsyncFetcher<ThesisLoad> | null>(
    () => (signal) =>
      fetchJson<ThesisLoad>(
        historicalVersionId
          ? `/api/thesis/${id}/versions/${historicalVersionId}`
          : `/api/thesis/${id}`,
        { headers: authHeaders(), signal, offline: offlineMessage },
      ),
    [id, historicalVersionId, offlineMessage],
  );
  const { state, reload } = useAsyncData(fetchThesis);

  const thesis = state.status === 'ok' ? state.data.thesis : null;
  const evidenceMap = state.status === 'ok' ? state.data.evidenceMap : EMPTY_EVIDENCE_MAP;
  const trajectoryMap =
    state.status === 'ok' ? state.data.trajectoryMap ?? EMPTY_TRAJECTORY_MAP : EMPTY_TRAJECTORY_MAP;
  const gapResolutions = state.status === 'ok' ? state.data.gapResolutions ?? EMPTY_GAPS : EMPTY_GAPS;
  const loading = state.status === 'loading';
  const error = state.status === 'error';

  // Must run unconditionally (before the loading/error early returns below) per
  // the rules of hooks — derives the same footnote numbers TipTapRenderer uses
  // inline, so the "ראיות (N)" list below can show matching [n] markers.
  const citationNumbers = useMemo(
    () => (thesis?.version?.userContent ? buildCitationNumbers(thesis.version.userContent) : new Map<string, number>()),
    [thesis],
  );

  async function runAnalysis() {
    setAnalyzing(true);
    try {
      await fetch(apiUrl(`/api/thesis/${id}/analyze`), { method: 'POST' });
      pollRef.current = setInterval(() => {
        void reload().then((settled) => {
          // A failed poll is not an answer — keep polling. Only COMPLETE stops.
          if (settled.status !== 'ok') return;
          if (settled.data.thesis.version?.status === 'COMPLETE') {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setAnalyzing(false);
          }
        });
      }, 3000);
    } catch {
      setAnalyzing(false);
    }
  }

  async function generateFoia(gapIndex: number) {
    setFoiaError(null);
    setFoiaModal({ status: 'loading', gapIndex });
    try {
      const data = await generateFoiaRequest(id, gapIndex);
      setFoiaModal({ status: 'ready', gapIndex, ...data });
    } catch {
      setFoiaError(gapIndex);
      setFoiaModal(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-500 text-sm">{t('loading')}</p>
      </div>
    );
  }

  if (error || !thesis) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-red-600">{t('errorEvaluate')}</p>
          <Link href="/theses" className="text-slate-600 hover:text-slate-900 text-sm transition-colors">
            ← {t('pageTitle')}
          </Link>
        </div>
      </div>
    );
  }

  const hv = thesis.version;
  const isDraft = !thesis.publication.isPublished;
  // The process view exists for researchers only. The public page keeps
  // everything in one scroll, critique included: the Devil's Advocate answer to
  // a thesis is part of how it is presented honestly, and a tab is a place
  // things go unread.
  const hasProcessView = thesis.viewer === 'RESEARCHER';
  const showThesis = !hasProcessView || view === 'thesis';
  const showProcess = !hasProcessView || view === 'process';
  const showHistory = hasProcessView && view === 'history';

  function switchView(next: ThesisView): void {
    // State first, so the switch is immediate. Nothing here waits on the
    // network: the only fetch is the provenance timeline, and only the first
    // time the process panel is opened.
    setView(next);
    if (next === 'process') setProcessMounted(true);
    if (next === 'history') setHistoryMounted(true);

    // The URL still carries the view, so a refresh or a shared link lands in
    // the right place — written with the History API rather than router.replace,
    // which would make this a navigation again.
    const params = new URLSearchParams(window.location.search);
    if (next === 'thesis') params.delete('view');
    else params.set('view', next);
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);

    // Nothing scrolls. The switcher is pinned under the site header, so it
    // never moves and never has to be brought back into view — and moving the
    // page under the button that was just pressed is the jump this replaced.
  }
  const analysis = hv?.aiAnalysis ?? null;
  const evidenceMentions = hv?.mentions.filter(m => m.type === 'EVIDENCE') ?? [];
  const trajectoryMentions = hv?.mentions.filter(m => m.type === 'CLAIM_TRAJECTORY') ?? [];

  // Collapsed by co-movement. A thesis citing an eight-claim block cites eight
  // rows — the group has no citable id of its own — so rendering a card per row
  // would report one finding as eight. Members of a group share every field
  // below except their claim text: that is what "moved as one unit" means.
  const trajectoryGroups = (() => {
    const byKey = new Map<string, { info: TrajectoryInfo; claims: string[]; firstRefId: string }>();
    for (const m of trajectoryMentions) {
      const info = trajectoryMap[m.refId];
      if (!info) continue;
      const key = info.coMovementKey || m.refId;
      const existing = byKey.get(key);
      if (existing) existing.claims.push(info.claimText);
      else byKey.set(key, { info, claims: [info.claimText], firstRefId: m.refId });
    }
    return [...byKey.values()];
  })();

  // The open citation, resolved from its id at render. A trajectory id resolves
  // to its whole co-movement, because that is what one marker stands for.
  const openCitation: CitationTarget | null = (() => {
    if (!openCitationId) return null;
    const trajectory = trajectoryMap[openCitationId];
    if (trajectory) {
      const key = trajectory.coMovementKey || openCitationId;
      const group = trajectoryGroups.find((g) => (g.info.coMovementKey || g.firstRefId) === key);
      return {
        kind: 'trajectory',
        info: trajectory,
        claims: group?.claims ?? [trajectory.claimText],
        ...(citationNumbers.get(group?.firstRefId ?? openCitationId) !== undefined
          ? { number: citationNumbers.get(group?.firstRefId ?? openCitationId) }
          : {}),
      };
    }
    return {
      kind: 'evidence',
      hash: openCitationId,
      info: evidenceMap[openCitationId],
      ...(citationNumbers.get(openCitationId) !== undefined
        ? { number: citationNumbers.get(openCitationId) }
        : {}),
    };
  })();

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header — the shared site header, not a bespoke one. This page is
          public (reached via citations, share links, /call), so it must not
          carry a back-link to /theses (the researcher-gated thesis builder)
          the way it used to — most visitors here can't use that page. */}
      <SiteHeader
        current="theses"
        maxWidth="max-w-4xl"
        // No actions. The header is for navigation, and both things that used to
        // live here were something else: editing is an authoring act reached from
        // the researcher's own surfaces, and the call for witnesses is an ASK,
        // which now sits beneath the evidence gaps that motivate it.
      />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {/* Thesis title */}
        {thesis.title && (
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{thesis.title}</h1>
        )}

        {/* Publication state. Global to the thesis, so it stays above
            everything else: a draft is invisible to the public, and a published
            thesis may be sitting behind its head version. */}
        {thesis.viewer === 'RESEARCHER' && !isHistorical && (
          <>
            {isDraft && (
              <div className="flex items-center gap-3 bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700">
                <PublicationBadge publication={thesis.publication} />
                <span>{t('publication.draftNotice')}</span>
              </div>
            )}
            {!isDraft && !thesis.publication.headIsPublished && (
              <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-sm text-orange-900">
                <PublicationBadge publication={thesis.publication} />
                <span>{t('publication.publicBehind', { count: thesis.publication.versionsAhead })}</span>
              </div>
            )}
          </>
        )}
        {/* Historical version banner */}
        {isHistorical && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
            <span>📋</span>
            <span>{locale === 'he' ? 'צפייה בגרסה היסטורית — לקריאה בלבד' : 'Viewing historical version — read only'}</span>
            <Link href={`/theses/${id}`} className="ms-auto font-medium text-amber-900 hover:underline shrink-0">
              {locale === 'he' ? 'לגרסה הנוכחית ←' : 'Current version →'}
            </Link>
          </div>
        )}

        {/* The two views. Below the publication banners on purpose: those state
            what is true of the thesis as a whole, so they belong to both. */}
        {hasProcessView && (
          /* Pinned under the site header. A switcher that scrolls away is one
             the reader has to go find, and bringing it back into view on every
             click moved the page under the button they had just pressed. The
             band spans the container's padding so content scrolls under it
             rather than beside it. */
          <div className="sticky top-14 z-10 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 bg-slate-50/95 backdrop-blur print:hidden flex items-center gap-2">
            <div
              role="tablist"
              aria-label={t('viewsLabel')}
              className="flex flex-1 gap-1 bg-slate-100 border border-slate-200 rounded-xl p-1"
            >
              {THESIS_VIEWS.map((v) => (
                <button
                  key={v}
                  id={`thesis-tab-${v}`}
                  role="tab"
                  type="button"
                  aria-selected={view === v}
                  aria-controls={`thesis-panel-${v}`}
                  onKeyDown={(e) => {
                    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                    e.preventDefault();
                    // Logical next/previous: in RTL the right arrow moves toward
                    // the start of the list, which is what the reader means.
                    const step = (e.key === 'ArrowLeft' ? 1 : -1) * (locale === 'he' ? -1 : 1);
                    const at = THESIS_VIEWS.indexOf(view);
                    const nextView = THESIS_VIEWS[(at + step + THESIS_VIEWS.length) % THESIS_VIEWS.length];
                    switchView(nextView);
                  }}
                  onClick={() => { switchView(v); }}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    view === v
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t(VIEW_LABEL[v])}
                </button>
              ))}
            </div>
          </div>
        )}

        <div
          id="thesis-panel-thesis"
          role={hasProcessView ? 'tabpanel' : undefined}
          aria-labelledby={hasProcessView ? 'thesis-tab-thesis' : undefined}
          // print:block — a thesis is a legal document and someone will print it.
          // Tabs hide content from print, so the argument and its citations are
          // always in the printed output whichever view is on screen.
          className={showThesis ? 'space-y-8' : 'hidden print:block space-y-8'}
        >
        {/* Rule 5 — the public-interest anchor, rendered on every published
            thesis as a dedicated field rather than hunted for in the body. */}
        {thesis.publicInterestStatement && (
          <div className="bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 text-sm text-sky-900 space-y-1" dir="auto">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">{t('publication.statementHeading')}</div>
            <p className="leading-relaxed">{thesis.publicInterestStatement}</p>
          </div>
        )}

        {/* AI-content disclaimer (status pill folded in, not gated on `analysis`
            existing — the thesis body is already AI-assisted regardless of
            whether critique has run) sits directly above the thesis body card,
            deliberately outside the outer space-y-8 rhythm so the two read as
            one attached unit instead of two separately-floating boxes. */}
        <div className="space-y-2">
          <LegalDisclaimer status={hv?.status} />

          {/* Thesis body — date sits top-left inside the card, letterhead-style */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="text-xs text-slate-400" style={{ textAlign: 'left' }}>
              {new Date(thesis.createdAt).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US')}
            </div>
            {hv ? (
              <TipTapRenderer
                doc={hv.userContent}
                evidenceMap={evidenceMap}
                trajectoryMap={trajectoryMap}
                onCitationClick={setOpenCitationId}
              />
            ) : null}
          </div>
        </div>

        {/* Mentioned evidence */}
        {evidenceMentions.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {t('evidenceSuggestion')} ({evidenceMentions.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {evidenceMentions.map(m => {
                const info = evidenceMap[m.refId];
                const tierDotClass = tierDotColor(info?.evidenceTier ?? '');
                const label = (info?.summary ? truncateLabel(info.summary, 60) : undefined) || m.refId.slice(0, 8);
                const number = citationNumbers.get(m.refId);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { setOpenCitationId(m.refId); }}
                    className="inline-flex items-center gap-1.5 bg-amber-100 hover:bg-amber-200 text-amber-700 text-xs px-3 py-1 rounded-full transition-colors"
                  >
                    <span className="font-semibold">{number ? `[${number}]` : '#'}</span>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${tierDotClass}`} />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Sources — one compact line each, opened from here or from the [n]
            marker in the argument above. This block used to stand every source
            open: seven evidence chips and, once a real co-movement was cited,
            eight trajectory panels each carrying eighty-three archived captures.
            A citation is consulted, not read through. */}
        {trajectoryGroups.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {t('trajectoriesTitle')} ({trajectoryGroups.length})
            </h3>
            <ul className="space-y-1">
              {trajectoryGroups.map(({ info, claims, firstRefId }) => {
                const number = citationNumbers.get(firstRefId);
                return (
                  <li key={firstRefId}>
                    <button
                      type="button"
                      onClick={() => { setOpenCitationId(firstRefId); }}
                      className="w-full text-start flex items-baseline gap-2 px-3 py-2 rounded-lg bg-teal-50/60 hover:bg-teal-100/70 border border-teal-200 transition-colors"
                    >
                      <span className="text-teal-700 text-xs font-semibold shrink-0">
                        {number ? `[${number}]` : '#'}
                      </span>
                      <span className="text-xs text-slate-700 leading-relaxed line-clamp-2" dir="auto">
                        {claims[0]}
                      </span>
                      {info.coMovementCount > 1 && (
                        <span className="ms-auto text-[11px] text-teal-800 font-medium shrink-0">
                          {t('trajectoryCoMovement', { count: info.coMovementCount })}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            {/* The limitation stays in the list as well as in the sheet: a
                reader who never opens one still has to be told what a
                trajectory is computed over. */}
            <p className="text-xs text-slate-500 leading-relaxed">{t('trajectoryCaveat')}</p>
          </div>
        )}

        {/* The Devil's Advocate critique, in the MAIN view rather than behind the
            researcher-only process tab. A thesis that publishes the strongest case
            against itself is read differently from one that publishes only its own
            argument — and it is the difference the publication gate assumes. This
            is served to the public already; only its placement was researcher-only. */}
        {analysis && (
          <section className="space-y-5 pt-4 border-t border-slate-200">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-slate-900">{t('aiAnalysisTitle')}</h2>
              <StrengthBadge strength={analysis.overallStrengthAssessment} />
            </div>

            {/* Hebrew summary */}
            {analysis.summaryHe && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4" dir="rtl">
                <p className="text-sm text-slate-700 leading-relaxed">{analysis.summaryHe}</p>
              </div>
            )}

            {/* Counter-arguments — horizontal, swipeable on mobile via native
                scroll-snap rather than a vertical stack. */}
            {analysis.counterArguments.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t('counterArgumentsLabel')}
                </h3>
                <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1">
                  {analysis.counterArguments.map((ca, i) => (
                    <div
                      key={i}
                      className="snap-start shrink-0 w-[85%] sm:w-[380px] bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-sm"
                    >
                      <p className="text-sm text-slate-900 font-bold">{ca.claim}</p>
                      <p className="text-sm text-slate-700">{ca.rebuttal}</p>
                      <span className="inline-block text-xs text-slate-400 font-medium">
                        {strengthLabel(tStrength, ca.strength)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Evidence gaps — horizontal, same swipeable pattern as counter-arguments,
                which also frees up width for larger icon-forward action buttons
                inside GapSearchPanel. */}
            {analysis.evidenceGaps.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t('evidenceGapsLabel')}
                </h3>
                <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1">
                  {analysis.evidenceGaps.map((gap, i) => {
                    const resolution = gapResolutions.find(r => r.gapIndex === i) ?? null;
                    return (
                      <div key={i} className="snap-start shrink-0 w-[85%] sm:w-[420px]">
                        {isHistorical
                          ? (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1">
                              <p className="text-sm text-slate-800 font-medium">{gap.description}</p>
                              {gap.suggestedSearch && (
                                <p className="text-xs text-slate-500 font-mono">{gap.suggestedSearch}</p>
                              )}
                            </div>
                          )
                          : (
                            <GapSearchPanel
                              gap={gap}
                              gapIndex={i}
                              thesisId={id}
                              thesisContent={hv?.userContent ?? {}}
                              resolution={resolution}
                              onVersionAdded={() => { void reload(); }}
                              onResolved={() => { void reload(); }}
                              onGenerateFoia={() => { void generateFoia(i); }}
                              onSubmitTip={() => { setTipModalGapIndex(i); }}
                              canEdit={canEdit}
                            />
                          )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Alternative interpretations */}
            {analysis.alternativeInterpretations.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t('alternativeInterpretationsLabel')}
                </h3>
                <ul className="space-y-1.5">
                  {analysis.alternativeInterpretations.map((interp, i) => (
                    <li key={i} className="text-sm text-slate-700 flex gap-2">
                      <span className="text-slate-400 shrink-0">↔</span>
                      <span>{interp}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

                      </section>
        )}

        {/* The call for witnesses, directly beneath the evidence gaps it answers.
            It used to sit in the top menu, where it read as navigation. A gap the
            archive cannot close is exactly what a witness closes, so the ask
            belongs where a reader has just been told what is missing — and where
            the public can see it, which the header placement also allowed but
            without the reason beside it. */}
        <Link
          href={`/call/${id}`}
          className="block bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl px-5 py-4 transition-colors"
        >
          <span className="text-sm font-semibold text-amber-900">{t('callForWitnessesBtn')}</span>
        </Link>
        </div>

        {hasProcessView && historyMounted && (
          <div
            id="thesis-panel-history"
            role="tabpanel"
            aria-labelledby="thesis-tab-history"
            className={showHistory ? '' : 'hidden'}
          >
            <ThesisVersionHistory id={id} />
          </div>
        )}

        {(!hasProcessView || processMounted) && (
        <div
          id="thesis-panel-process"
          role={hasProcessView ? 'tabpanel' : undefined}
          aria-labelledby={hasProcessView ? 'thesis-tab-process' : undefined}
          className={showProcess ? 'space-y-8' : 'hidden'}
        >
        {/* The apparatus of publication, BELOW the thesis it judges. It used to
            open the page: a reader arriving at a legal argument met the gate
            checks and the provenance timeline before meeting a sentence of it.
            The artifact comes first; the record of how it was made follows. */}
        {thesis.viewer === 'RESEARCHER' && !isHistorical && (
          <>
            <ThesisPublicationPanel
              thesisId={id}
              publication={thesis.publication}
              publicInterestStatement={thesis.publicInterestStatement}
              onChanged={reload}
            />
            {/* The record beside the checks: the timeline is what has happened,
                the checks above are what remains. Researcher-only on both sides
                — the backend route refuses anyone else, and this whole block is
                already gated on viewer === 'RESEARCHER'. */}
            <ThesisProvenancePanel thesisId={id} locale={locale} />
          </>
        )}


        {/* Pending AI notice + trigger button — hidden for historical versions, researcher-only */}
        {canEdit && !isHistorical && hv?.status === 'PENDING_AI' && !analyzing && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
            <p className="text-amber-700 text-sm">{t('pendingAiNotice')}</p>
            <button
              onClick={runAnalysis}
              className="shrink-0 px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              Run AI Analysis
            </button>
          </div>
        )}
        {analyzing && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3 text-amber-700 text-sm">
            <span className="animate-spin">⏳</span>
            <span>Running Devil&apos;s Advocate analysis… this takes ~30 seconds</span>
          </div>
        )}
        </div>
        )}
      </main>

      {/* The open citation */}
      {openCitation && (
        <CitationSheet target={openCitation} locale={locale} onClose={() => { setOpenCitationId(null); }} />
      )}

      {/* FOIA Modal */}
      {foiaModal !== null && (
        <FoiaModal state={foiaModal} onClose={() => setFoiaModal(null)} />
      )}

      {/* Whistleblower Modal */}
      {tipModalGapIndex !== null && analysis?.evidenceGaps[tipModalGapIndex] && (
        <WhistleblowerModal
          gapIndex={tipModalGapIndex}
          gap={analysis.evidenceGaps[tipModalGapIndex]!}
          thesisId={id}
          onClose={() => setTipModalGapIndex(null)}
        />
      )}

      {/* FOIA generation error toast */}
      {foiaError !== null && (
        <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:left-auto sm:w-80 z-40 bg-red-600 text-white text-sm px-4 py-3 rounded-xl shadow-lg flex items-center justify-between gap-3">
          <span>{t('foiaError')}</span>
          <button
            onClick={() => setFoiaError(null)}
            className="text-white/80 hover:text-white leading-none shrink-0"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

export default function ThesisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <ThesisPageInner id={id} />
    </Suspense>
  );
}
