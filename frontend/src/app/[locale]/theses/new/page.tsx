'use client';

import {
  forwardRef,
  useImperativeHandle,
  useState,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import { PluginKey } from '@tiptap/pm/state';
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiUrl } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FigureItem = { id: string; name: string };
type EvidenceItem = { id: string; summary: string; category: string; evidenceDate: string };
type AnyItem = FigureItem | EvidenceItem;

interface FalsificationAttempt {
  claim: string;
  counterArgument: string;
  evidenceGap: string;
}

interface FalsificationResult {
  survivingClaims: string[];
  falsificationAttempts: FalsificationAttempt[];
  weakestLink: string;
  recommendedEvidence: string[];
}

// TipTap JSON node shape (just enough for traversal)
interface TipTapNode {
  type?: string;
  attrs?: Record<string, string | null | undefined>;
  content?: TipTapNode[];
}

// Suggestion popup state
interface ActiveSuggestion {
  char: '@' | '#';
  items: AnyItem[];
  command: (item: AnyItem) => void;
  rect: DOMRect;
}

// ---------------------------------------------------------------------------
// Stable PluginKeys and editor props (module-level — never re-created)
// ---------------------------------------------------------------------------

const figureMentionKey = new PluginKey('figureMention');
const evidenceMentionKey = new PluginKey('evidenceMention');

// Must be module-level: useEditor's compareOptions does a reference check on
// editorProps on every render. A new object literal would trigger setOptions →
// plugin reconfiguration → AbortError on the in-flight items() fetch.
const EDITOR_PROPS = {
  attributes: {
    class:
      'prose prose-sm max-w-none focus:outline-none min-h-[200px] px-4 py-4 text-slate-800 [&_.mention-pill]:inline-block [&_.mention-pill]:rounded-full [&_.mention-pill]:px-2 [&_.mention-pill]:py-0.5 [&_.mention-pill]:text-xs [&_.mention-pill]:font-medium [&_.mention-figure]:bg-violet-100 [&_.mention-figure]:text-violet-700 [&_.mention-evidence]:bg-amber-100 [&_.mention-evidence]:text-amber-700',
  },
};

// ---------------------------------------------------------------------------
// MentionList — suggestion dropdown (rendered as a portal)
// ---------------------------------------------------------------------------

interface MentionListProps {
  items: AnyItem[];
  char: string;
  command: (item: AnyItem) => void;
}

interface MentionListRef {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

const MentionList = forwardRef<MentionListRef, MentionListProps>(
  ({ items, char, command }, ref) => {
    const safeItems = Array.isArray(items) ? items : [];
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => setSelectedIndex(0), [safeItems.length]);

    useImperativeHandle(ref, () => ({
      onKeyDown(event: KeyboardEvent) {
        if (safeItems.length === 0) return false;
        if (event.key === 'ArrowUp') {
          setSelectedIndex(i => (i + safeItems.length - 1) % safeItems.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex(i => (i + 1) % safeItems.length);
          return true;
        }
        if (event.key === 'Enter') {
          command(safeItems[selectedIndex]);
          return true;
        }
        return false;
      },
    }));

    if (safeItems.length === 0) return null;

    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden min-w-[220px] max-w-xs">
        {safeItems.map((item, index) => (
          <button
            key={item.id}
            onMouseDown={e => { e.preventDefault(); command(item); }}
            className={`w-full text-start px-3 py-2 text-sm transition-colors border-b border-slate-100 last:border-0 ${
              index === selectedIndex ? 'bg-slate-100' : 'hover:bg-slate-50'
            }`}
          >
            {char === '@' ? (
              <span className="text-violet-700 font-medium">
                {(item as FigureItem).name}
              </span>
            ) : (
              <div>
                <div className="text-amber-600 font-medium text-xs">
                  {(item as EvidenceItem).category}
                </div>
                <div className="text-slate-500 text-xs mt-0.5 truncate">
                  {(item as EvidenceItem).summary?.slice(0, 70)}
                </div>
              </div>
            )}
          </button>
        ))}
      </div>
    );
  }
);

MentionList.displayName = 'MentionList';

// ---------------------------------------------------------------------------
// Extract tagged IDs from TipTap JSON doc
// ---------------------------------------------------------------------------

function extractTaggedIds(doc: TipTapNode): { figureIds: string[]; evidenceIds: string[] } {
  const figureIds: string[] = [];
  const evidenceIds: string[] = [];

  function walk(node: TipTapNode) {
    if (node.type === 'mention') {
      const id = node.attrs?.id;
      if (!id) return;
      if (node.attrs?.mentionSuggestionChar === '@') figureIds.push(id);
      if (node.attrs?.mentionSuggestionChar === '#') evidenceIds.push(id);
    }
    node.content?.forEach(walk);
  }

  walk(doc);
  return { figureIds: [...new Set(figureIds)], evidenceIds: [...new Set(evidenceIds)] };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewThesisPage() {
  const t = useTranslations('theses');
  useLocale();

  // -----------------------------------------------------------------------
  // Suggestion popup — managed as React state, rendered as a portal
  // -----------------------------------------------------------------------

  const [activeSuggestion, setActiveSuggestion] = useState<ActiveSuggestion | null>(null);
  // Stable ref so render callbacks (created once in useMemo) always call the latest setter
  const setActiveSuggestionRef = useRef(setActiveSuggestion);
  setActiveSuggestionRef.current = setActiveSuggestion;


  const mentionListRef = useRef<MentionListRef>(null);
  // Stable ref so render callbacks always reach the latest MentionList instance
  const mentionListRefRef = useRef(mentionListRef);
  mentionListRefRef.current = mentionListRef;

  // -----------------------------------------------------------------------
  // Suggestion render factory — uses refs so closures are never stale
  // -----------------------------------------------------------------------

  function buildRender(char: '@' | '#') {
    return (): {
      onStart?: (props: SuggestionProps<AnyItem>) => void;
      onUpdate?: (props: SuggestionProps<AnyItem>) => void;
      onExit?: () => void;
      onKeyDown?: (props: SuggestionKeyDownProps) => boolean;
    } => ({
      onStart(props) {
        const rect = props.clientRect?.();
        if (!rect) return;
        setActiveSuggestionRef.current({
          char,
          items: Array.isArray(props.items) ? props.items : [],
          command: props.command as unknown as (item: AnyItem) => void,
          rect,
        });
      },
      onUpdate(props) {
        const rect = props.clientRect?.();
        setActiveSuggestionRef.current(prev =>
          !prev
            ? null
            : {
                ...prev,
                items: Array.isArray(props.items) ? props.items : [],
                command: props.command as unknown as (item: AnyItem) => void,
                ...(rect && { rect }),
              }
        );
      },
      onExit() {
        setActiveSuggestionRef.current(null);
      },
      onKeyDown({ event }) {
        if (event.key === 'Escape') {
          setActiveSuggestionRef.current(null);
          return true;
        }
        return mentionListRefRef.current.current?.onKeyDown(event) ?? false;
      },
    });
  }

  // Stable suggestions config — created once, render callbacks use refs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const suggestions = useMemo(() => [
    {
      char: '@' as const,
      pluginKey: figureMentionKey,
      items: async ({ query, signal }: { query: string; signal: AbortSignal }) => {
        try {
          const res = await fetch(
            apiUrl(`/api/mentions/figures?q=${encodeURIComponent(query)}`),
            { signal }
          );
          if (!res.ok) return [];
          const data = await res.json() as { figures: AnyItem[] };
          return data.figures ?? [];
        } catch {
          return [];
        }
      },
      command({ editor: ed, range, props }: { editor: ReturnType<typeof useEditor>; range: { from: number; to: number }; props: unknown }) {
        const item = props as FigureItem;
        (ed as NonNullable<typeof ed>)
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({ type: 'mention', attrs: { id: item.id, label: item.name, mentionSuggestionChar: '@' } })
          .insertContent(' ')
          .run();
      },
      render: buildRender('@'),
    },
    {
      char: '#' as const,
      pluginKey: evidenceMentionKey,
      items: async ({ query, signal }: { query: string; signal: AbortSignal }) => {
        try {
          const res = await fetch(
            apiUrl(`/api/mentions/evidence?q=${encodeURIComponent(query)}`),
            { signal }
          );
          if (!res.ok) return [];
          const data = await res.json() as { evidence: AnyItem[] };
          return data.evidence ?? [];
        } catch {
          return [];
        }
      },
      command({ editor: ed, range, props }: { editor: ReturnType<typeof useEditor>; range: { from: number; to: number }; props: unknown }) {
        const item = props as EvidenceItem;
        (ed as NonNullable<typeof ed>)
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({
            type: 'mention',
            attrs: {
              id: item.id,
              label: item.summary?.slice(0, 30) ?? item.id,
              mentionSuggestionChar: '#',
            },
          })
          .insertContent(' ')
          .run();
      },
      render: buildRender('#'),
    },
  ], []); // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------------------------------
  // Form state
  // -----------------------------------------------------------------------

  const [title, setTitle] = useState('');
  const [thesisId, setThesisId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [evaluation, setEvaluation] = useState<FalsificationResult | null>(null);
  const [evalLimitReached, setEvalLimitReached] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Editor — extensions must be stable to avoid aborting in-flight fetches
  // -----------------------------------------------------------------------

  const extensions = useMemo(() => [
    StarterKit,
    Mention.configure({
      HTMLAttributes: {},
      renderText({ node }) {
        const char = node.attrs['mentionSuggestionChar'] ?? '@';
        return `${char}${node.attrs['label'] ?? node.attrs['id']}`;
      },
      renderHTML({ node }) {
        const char = node.attrs['mentionSuggestionChar'] ?? '@';
        const label = node.attrs['label'] ?? node.attrs['id'];
        return [
          'span',
          {
            class: char === '@' ? 'mention-pill mention-figure' : 'mention-pill mention-evidence',
            'data-type': 'mention',
            'data-id': node.attrs['id'],
            'data-char': char,
          },
          `${char}${label}`,
        ];
      },
      suggestions,
    }),
  // suggestions is stable (useMemo []); this array must never be recreated
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    editorProps: EDITOR_PROPS,
  });

  // -----------------------------------------------------------------------
  // Save draft
  // -----------------------------------------------------------------------

  async function saveDraft(): Promise<string | null> {
    if (!title.trim() || !authorAddress.trim()) return null;
    setSaving(true);
    setSaveError(null);
    setDraftSaved(false);
    try {
      const doc = (editor?.getJSON() as TipTapNode | undefined) ?? { type: 'doc', content: [] };
      const { figureIds, evidenceIds } = extractTaggedIds(doc);
      const content = JSON.stringify(doc);

      const body = {
        title: title.trim(),
        content,
        taggedEvidenceIds: evidenceIds,
        taggedFigureIds: figureIds,
      };

      let res: Response;
      if (thesisId) {
        res = await fetch(apiUrl(`/api/thesis/${thesisId}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch(apiUrl('/api/thesis'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }

      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { thesis: { id: string } };
      setThesisId(data.thesis.id);
      setDraftSaved(true);
      return data.thesis.id;
    } catch {
      setSaveError(t('errorSave'));
      return null;
    } finally {
      setSaving(false);
    }
  }

  // -----------------------------------------------------------------------
  // Evaluate
  // -----------------------------------------------------------------------

  async function handleEvaluate() {
    setEvalError(null);
    const id = await saveDraft();
    if (!id) {
      if (!saveError) setSaveError(t('errorSave'));
      return;
    }
    setEvaluating(true);
    try {
      const res = await fetch(apiUrl(`/api/thesis/${id}/evaluate`), { method: 'POST' });
      if (res.status === 429) {
        setEvalLimitReached(true);
        return;
      }
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { feedback: FalsificationResult };
      setEvaluation(data.feedback);
      setTimeout(
        () => document.getElementById('eval-results')?.scrollIntoView({ behavior: 'smooth' }),
        100
      );
    } catch {
      setEvalError(t('errorEvaluate'));
    } finally {
      setEvaluating(false);
    }
  }

  // -----------------------------------------------------------------------
  // Submit
  // -----------------------------------------------------------------------

  async function handleSubmit() {
    setSubmitError(null);
    const id = thesisId ?? (await saveDraft());
    if (!id) return;
    setSubmitting(true);
    try {
      const res = await fetch(apiUrl(`/api/thesis/${id}/submit`), { method: 'POST' });
      if (res.status === 409) {
        setSubmitError(t('requiresEvaluation'));
        return;
      }
      if (!res.ok) throw new Error();
      setSubmitted(true);
    } catch {
      setSubmitError(t('errorSubmit'));
    } finally {
      setSubmitting(false);
    }
  }

  const formReady = title.trim().length > 0;

  // -----------------------------------------------------------------------
  // Submitted state
  // -----------------------------------------------------------------------

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="text-5xl text-emerald-500">✓</div>
          <h2 className="text-2xl font-bold text-slate-900">{t('submittedTitle')}</h2>
          <p className="text-slate-600">{t('submittedSub')}</p>
          <Link
            href="/theses"
            className="inline-block mt-4 px-5 py-2 bg-violet-700 hover:bg-violet-600 rounded-lg text-white text-sm font-medium transition-colors"
          >
            ← {t('pageTitle')}
          </Link>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Main render
  // -----------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Suggestion popup portal */}
      {activeSuggestion &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: activeSuggestion.rect.bottom + 4,
              left: activeSuggestion.rect.left,
              zIndex: 9999,
            }}
          >
            <MentionList
              ref={mentionListRef}
              items={activeSuggestion.items}
              char={activeSuggestion.char}
              command={activeSuggestion.command}
            />
          </div>,
          document.body
        )}

      {/* Header */}
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <Link href="/theses" className="text-slate-600 hover:text-slate-900 text-sm transition-colors">
            ← {t('pageTitle')}
          </Link>
          <span className="text-slate-400 text-xs hidden sm:block">{t('tagline')}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {/* Heading */}
        <section>
          <h1 className="text-2xl font-bold text-slate-900">{t('newThesisHeading')}</h1>
        </section>

        {/* Thesis card */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 shadow-sm">
          {/* Title */}
          <div className="px-5 py-4">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              {t('titleLabel')}
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={t('titlePlaceholder')}
              className="w-full bg-transparent text-slate-900 placeholder-slate-400 text-lg font-semibold focus:outline-none"
            />
          </div>

          {/* Body — TipTap */}
          <div>
            <div className="px-5 pt-4 pb-1">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('contentLabel')}
              </label>
            </div>
            <EditorContent editor={editor} />
            <p className="px-5 pb-3 text-xs text-slate-400">{t('contentPlaceholder')}</p>
          </div>

        </div>

        {/* Errors */}
        {saveError && <p className="text-red-600 text-sm">{saveError}</p>}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={saveDraft}
            disabled={saving || !formReady}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg text-sm font-medium text-slate-700 transition-colors"
          >
            {saving ? t('savingBtn') : t('saveDraftBtn')}
          </button>

          {draftSaved && !saving && (
            <span className="text-emerald-600 text-xs">{t('draftSaved')}</span>
          )}

          <button
            onClick={handleEvaluate}
            disabled={evaluating || saving || !formReady}
            className="px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 rounded-lg text-sm font-medium text-white transition-colors"
          >
            {evaluating ? t('evaluatingBtn') : t('evaluateBtn')}
          </button>

          {evaluation && (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="ms-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-lg text-sm font-medium text-white transition-colors"
            >
              {submitting ? t('submittingBtn') : t('submitBtn')}
            </button>
          )}
        </div>

        {evalLimitReached && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-700 text-sm">
            {t('evalLimitWarning')}
          </div>
        )}

        {evalError && <p className="text-red-600 text-sm">{evalError}</p>}
        {submitError && <p className="text-red-600 text-sm">{submitError}</p>}

        {/* Falsification results */}
        {evaluation && (
          <section id="eval-results" className="space-y-5 pt-2">
            <h2 className="text-lg font-bold text-slate-900 border-b border-slate-200 pb-3">
              {t('evaluationTitle')}
            </h2>

            {evaluation.survivingClaims.length > 0 ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
                <h3 className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">
                  {t('survivingClaimsLabel')}
                </h3>
                <ul className="space-y-1.5">
                  {evaluation.survivingClaims.map((claim, i) => (
                    <li key={i} className="text-sm text-emerald-800 flex gap-2">
                      <span className="text-emerald-600 shrink-0">✓</span>
                      <span>{claim}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
                {t('noSurvivingClaims')}
              </div>
            )}

            {evaluation.falsificationAttempts.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t('falsificationLabel')}
                </h3>
                {evaluation.falsificationAttempts.map((attempt, i) => (
                  <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        {t('claimLabel')}
                      </span>
                      <p className="text-sm text-slate-900 mt-0.5">{attempt.claim}</p>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-red-600 uppercase tracking-wide">
                        {t('counterArgLabel')}
                      </span>
                      <p className="text-sm text-red-700 mt-0.5">{attempt.counterArgument}</p>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-amber-600 uppercase tracking-wide">
                        {t('evidenceGapLabel')}
                      </span>
                      <p className="text-sm text-amber-700 mt-0.5">{attempt.evidenceGap}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-red-600 uppercase tracking-wide">
                {t('weakestLinkLabel')}
              </h3>
              <p className="text-sm text-red-700 mt-1">{evaluation.weakestLink}</p>
            </div>

            {evaluation.recommendedEvidence.length > 0 && (
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-2">
                <h3 className="text-xs font-semibold text-violet-700 uppercase tracking-wide">
                  {t('recommendedEvidenceLabel')}
                </h3>
                <ul className="space-y-1.5">
                  {evaluation.recommendedEvidence.map((rec, i) => (
                    <li key={i} className="text-sm text-violet-800 flex gap-2">
                      <span className="text-violet-600 shrink-0">→</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-4 gap-4">
              <p className="text-sm text-slate-600">{t('submittedSub')}</p>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="shrink-0 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-lg text-sm font-medium text-white transition-colors"
              >
                {submitting ? t('submittingBtn') : t('submitBtn')}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
