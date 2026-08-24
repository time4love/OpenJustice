'use client';

import {
  forwardRef,
  useImperativeHandle,
  useState,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import { PluginKey } from '@tiptap/pm/state';
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';
import { apiUrl } from '@/lib/api';
import { CategoryBadges } from '@/components/CategoryBadges';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ThesisEditorHandle {
  getJSON(): Record<string, unknown>;
  isEmpty(): boolean;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type FigureItem = { id: string; name: string };
type EvidenceItem = { fileHash: string; summary: string; investigativeCategories: string[]; tier?: string };
type AnyItem = FigureItem | EvidenceItem;

const TIER_DOT: Record<string, string> = {
  '1': 'bg-red-500',
  '2': 'bg-orange-500',
  '3': 'bg-yellow-500',
  '4': 'bg-slate-400',
};

function tierDotClass(tier?: string): string {
  const num = tier?.match(/\d/)?.[0] ?? '';
  return TIER_DOT[num] ?? 'bg-slate-300';
}

interface ActiveSuggestion {
  char: '@' | '#';
  items: AnyItem[];
  command: (item: AnyItem) => void;
  rect: DOMRect;
}

interface MentionListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

// ---------------------------------------------------------------------------
// Module-level stable values
// ---------------------------------------------------------------------------

// PluginKeys must be module-level singletons — one per extension type.
const figureMentionKey = new PluginKey('keyFigureMention');
const evidenceMentionKey = new PluginKey('evidenceMention');

// editorProps reference must be stable: useEditor does a reference equality
// check and will abort in-flight suggestion fetches if the object changes.
const EDITOR_PROPS = {
  attributes: {
    class:
      'prose prose-slate prose-sm max-w-none focus:outline-none min-h-[200px] px-4 py-4 text-slate-800 ' +
      '[&_.mention-pill]:inline-block [&_.mention-pill]:rounded-full [&_.mention-pill]:px-2 [&_.mention-pill]:py-0.5 ' +
      '[&_.mention-pill]:text-xs [&_.mention-pill]:font-medium ' +
      '[&_.mention-figure]:bg-violet-100 [&_.mention-figure]:text-violet-700 ' +
      '[&_.mention-evidence]:bg-amber-100 [&_.mention-evidence]:text-amber-700',
  },
};

// ---------------------------------------------------------------------------
// buildMentionExtension — factory eliminating duplicated Mention config
// ---------------------------------------------------------------------------

interface MentionExtensionConfig {
  name: 'keyFigureMention' | 'evidenceMention';
  char: '@' | '#';
  pluginKey: PluginKey;
  pillClass: string;
  fetchItems: (query: string, signal: AbortSignal) => Promise<AnyItem[]>;
  buildAttrs: (item: AnyItem) => { id: string; label: string };
  // Both are stable for the life of the component — a `useState` setter, and a
  // callback that reads the dropdown's ref when a key is actually pressed — so
  // the closures built once in `useMemo` below can hold them directly. They used
  // to be wrapped in refs "so the closure is never stale", which a value that
  // cannot go stale does not need, and which meant writing (and passing) refs
  // during render.
  setActiveSuggestion: React.Dispatch<React.SetStateAction<ActiveSuggestion | null>>;
  onListKeyDown: (event: KeyboardEvent) => boolean;
}

function buildMentionExtension(cfg: MentionExtensionConfig) {
  return Mention.extend({ name: cfg.name }).configure({
    HTMLAttributes: {},
    renderText({ node }) {
      return `${cfg.char}${String(node.attrs['label'] ?? node.attrs['id'] ?? '')}`;
    },
    renderHTML({ node }) {
      return [
        'span',
        { class: `mention-pill ${cfg.pillClass}`, 'data-type': cfg.name, 'data-id': node.attrs['id'] },
        `${cfg.char}${String(node.attrs['label'] ?? node.attrs['id'] ?? '')}`,
      ];
    },
    suggestion: {
      char: cfg.char,
      pluginKey: cfg.pluginKey,
      items: async ({ query, signal }: { query: string; signal: AbortSignal }) => {
        try { return await cfg.fetchItems(query, signal); } catch { return []; }
      },
      command({ editor: ed, range, props }) {
        const attrs = cfg.buildAttrs(props as unknown as AnyItem);
        (ed as NonNullable<typeof ed>)
          .chain().focus().deleteRange(range)
          .insertContent({ type: cfg.name, attrs })
          .insertContent(' ').run();
      },
      render: () => ({
        onStart(props: SuggestionProps<AnyItem>) {
          const rect = props.clientRect?.();
          if (!rect) return;
          cfg.setActiveSuggestion({
            char: cfg.char,
            items: Array.isArray(props.items) ? props.items : [],
            command: props.command as unknown as (item: AnyItem) => void,
            rect,
          });
        },
        onUpdate(props: SuggestionProps<AnyItem>) {
          const rect = props.clientRect?.();
          cfg.setActiveSuggestion(prev =>
            !prev ? null : {
              ...prev,
              items: Array.isArray(props.items) ? props.items : [],
              command: props.command as unknown as (item: AnyItem) => void,
              ...(rect && { rect }),
            }
          );
        },
        onExit() { cfg.setActiveSuggestion(null); },
        onKeyDown({ event }: SuggestionKeyDownProps) {
          if (event.key === 'Escape') { cfg.setActiveSuggestion(null); return true; }
          return cfg.onListKeyDown(event);
        },
      }),
    },
  });
}

// ---------------------------------------------------------------------------
// MentionList — keyboard-navigable autocomplete dropdown
// ---------------------------------------------------------------------------

const MentionList = forwardRef<MentionListHandle, { items: AnyItem[]; char: string; command: (item: AnyItem) => void }>(
  ({ items, char, command }, ref) => {
    const safeItems = Array.isArray(items) ? items : [];
    // The selection belongs to the list it was made in. Tagging it with that
    // list's length makes "a new list starts at the top" a derivation rather
    // than an effect that has to write 0 back after the wrong row has already
    // rendered as selected for a frame.
    const [selection, setSelection] = useState({ forLength: safeItems.length, index: 0 });
    const selectedIndex = selection.forLength === safeItems.length ? selection.index : 0;
    const setSelectedIndex = (next: (current: number) => number) => {
      setSelection({ forLength: safeItems.length, index: next(selectedIndex) });
    };

    useImperativeHandle(ref, () => ({
      onKeyDown(event: KeyboardEvent) {
        if (safeItems.length === 0) return false;
        if (event.key === 'ArrowUp') { setSelectedIndex(i => (i + safeItems.length - 1) % safeItems.length); return true; }
        if (event.key === 'ArrowDown') { setSelectedIndex(i => (i + 1) % safeItems.length); return true; }
        if (event.key === 'Enter') { command(safeItems[selectedIndex]); return true; }
        return false;
      },
    }));

    if (safeItems.length === 0) return null;

    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden min-w-[220px] max-w-xs">
        {safeItems.map((item, index) => (
          <button
            key={char === '@' ? (item as FigureItem).id : (item as EvidenceItem).fileHash}
            onMouseDown={e => { e.preventDefault(); command(item); }}
            className={`w-full text-start px-3 py-2 text-sm transition-colors border-b border-slate-100 last:border-0 ${
              index === selectedIndex ? 'bg-slate-100' : 'hover:bg-slate-50'
            }`}
          >
            {char === '@' ? (
              <span className="text-violet-700 font-medium">{(item as FigureItem).name}</span>
            ) : (
              <div>
                <div className="flex items-center gap-1.5">
                  <span className={`shrink-0 w-2 h-2 rounded-full ${tierDotClass((item as EvidenceItem).tier)}`} />
                  <CategoryBadges categories={(item as EvidenceItem).investigativeCategories} max={2} />
                </div>
                <div className="text-slate-500 text-xs mt-0.5 truncate ps-3.5">{(item as EvidenceItem).summary?.slice(0, 70)}</div>
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
// ToolbarBtn
// ---------------------------------------------------------------------------

function ToolbarBtn({ active, title, onClick, children }: {
  active?: boolean; title?: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
        active ? 'bg-slate-200 text-slate-900' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// ThesisEditor
// ---------------------------------------------------------------------------

export const ThesisEditor = forwardRef<ThesisEditorHandle, { initialContent?: Record<string, unknown> }>(
  ({ initialContent }, ref) => {
    const [activeSuggestion, setActiveSuggestion] = useState<ActiveSuggestion | null>(null);
    const mentionListRef = useRef<MentionListHandle>(null);

    // Reads the ref at keypress time, never during render — which is the whole
    // point of a ref, and lets the extensions below hold a plain function.
    const onListKeyDown = useCallback(
      (event: KeyboardEvent) => mentionListRef.current?.onKeyDown(event) ?? false,
      [],
    );

    // `react-hooks/refs` cannot see past `buildMentionExtension`: it warns that
    // handing a ref-reading callback to a function during render might read the
    // ref during render. It does not — the callback is *stored* in the ProseMirror
    // suggestion plugin and invoked by TipTap on a real keypress. Reading the
    // ref at that moment is precisely what a ref is for, and the alternative the
    // rule wants (state) cannot work: the extensions are built once, and TipTap
    // holds that object for the life of the editor.
    const extensions = useMemo(() => [
      StarterKit,
      // eslint-disable-next-line react-hooks/refs
      buildMentionExtension({
        name: 'keyFigureMention',
        char: '@',
        pluginKey: figureMentionKey,
        pillClass: 'mention-figure',
        fetchItems: async (query, signal) => {
          const res = await fetch(apiUrl(`/api/evidence/key-figures?q=${encodeURIComponent(query)}&limit=8`), { signal });
          if (!res.ok) return [];
          const data = (await res.json()) as { keyFigures: FigureItem[] };
          return data.keyFigures ?? [];
        },
        buildAttrs: (item) => ({ id: (item as FigureItem).id, label: (item as FigureItem).name }),
        setActiveSuggestion,
        onListKeyDown,
      }),
      // eslint-disable-next-line react-hooks/refs
      buildMentionExtension({
        name: 'evidenceMention',
        char: '#',
        pluginKey: evidenceMentionKey,
        pillClass: 'mention-evidence',
        fetchItems: async (query, signal) => {
          const res = await fetch(apiUrl(`/api/evidence/search?q=${encodeURIComponent(query)}&limit=8`), { signal });
          if (!res.ok) return [];
          const data = (await res.json()) as { results: { metadata: EvidenceItem }[] };
          return (data.results ?? []).map(r => r.metadata);
        },
        buildAttrs: (item) => {
          const ev = item as EvidenceItem;
          return { id: ev.fileHash, label: ev.summary?.slice(0, 30) ?? ev.fileHash.slice(0, 8) };
        },
        setActiveSuggestion,
        onListKeyDown,
      }),
    ], [setActiveSuggestion, onListKeyDown]);

    const editor = useEditor({ immediatelyRender: false, extensions, editorProps: EDITOR_PROPS, content: initialContent });

    useImperativeHandle(ref, () => ({
      getJSON: () => (editor?.getJSON() ?? { type: 'doc', content: [] }) as Record<string, unknown>,
      isEmpty: () => editor?.isEmpty ?? true,
    }));

    if (!editor) return null;

    return (
      <div className="flex flex-col">
        <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-slate-100 flex-wrap">
          <ToolbarBtn active={editor.isActive('bold')} title="Bold" onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong></ToolbarBtn>
          <ToolbarBtn active={editor.isActive('italic')} title="Italic" onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></ToolbarBtn>
          <span className="w-px h-4 bg-slate-200 mx-1 shrink-0" />
          <ToolbarBtn active={editor.isActive('heading', { level: 1 })} title="Heading 1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</ToolbarBtn>
          <ToolbarBtn active={editor.isActive('heading', { level: 2 })} title="Heading 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolbarBtn>
          <ToolbarBtn active={editor.isActive('heading', { level: 3 })} title="Heading 3" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</ToolbarBtn>
          <span className="w-px h-4 bg-slate-200 mx-1 shrink-0" />
          <ToolbarBtn active={editor.isActive('blockquote')} title="Blockquote" onClick={() => editor.chain().focus().toggleBlockquote().run()}>❝</ToolbarBtn>
          <ToolbarBtn active={editor.isActive('bulletList')} title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()}>•—</ToolbarBtn>
          <ToolbarBtn active={editor.isActive('orderedList')} title="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}>1.</ToolbarBtn>
        </div>

        <EditorContent editor={editor} />

        {activeSuggestion && typeof document !== 'undefined' &&
          createPortal(
            <div style={{ position: 'fixed', top: activeSuggestion.rect.bottom + 4, left: activeSuggestion.rect.left, zIndex: 9999 }}>
              <MentionList ref={mentionListRef} items={activeSuggestion.items} char={activeSuggestion.char} command={activeSuggestion.command} />
            </div>,
            document.body
          )
        }
      </div>
    );
  }
);

ThesisEditor.displayName = 'ThesisEditor';
