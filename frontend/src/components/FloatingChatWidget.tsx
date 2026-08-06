'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { apiUrl } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ---------------------------------------------------------------------------
// FloatingChatWidget
// Locale-aware: greeting, UI strings, text direction, and bubble alignment
// all derive from the active next-intl locale.
// ---------------------------------------------------------------------------

export default function FloatingChatWidget() {
  const locale = useLocale();
  const t = useTranslations('chat');

  const isRtl = locale === 'he';
  const dir = isRtl ? 'rtl' : 'ltr';

  // In RTL (Hebrew) the user's side is the start (right), agent is end (left).
  // In LTR (English) the user's side is the end (right), agent is start (left).
  const userAlign = isRtl ? 'justify-start' : 'justify-end';
  const agentAlign = isRtl ? 'justify-end' : 'justify-start';

  // Bubble corner: tail should cut the corner nearest to the sender's edge.
  // rounded-ss-none = top-start corner; rounded-se-none = top-end corner.
  // In RTL: start=right → user tail on top-right = ss-none; agent on top-left = se-none.
  // In LTR: end=right  → user tail on top-right = se-none; agent on top-left = ss-none.
  const userCorner = isRtl ? 'rounded-ss-none' : 'rounded-se-none';
  const agentCorner = isRtl ? 'rounded-se-none' : 'rounded-ss-none';

  // Build the initial greeting from the translation dictionary
  const greeting: ChatMessage = { role: 'assistant', content: t('greeting') };

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([greeting]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom when messages or loading state changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Focus input whenever the panel is opened
  useEffect(() => {
    if (open) {
      const id = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(id);
    }
  }, [open]);

  async function sendMessage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    // History excludes the initial greeting to keep context clean
    const history = messages.slice(1);
    const userMessage: ChatMessage = { role: 'user', content: text };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(apiUrl('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history, locale }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { message?: string };
        throw new Error(data.message ?? `Error ${res.status}`);
      }

      const data = (await res.json()) as { response: string };
      setMessages((prev) => [...prev, { role: 'assistant', content: data.response }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorFallback'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Chat panel                                                           */}
      {/* ------------------------------------------------------------------ */}
      {open && (
        <div
          dir={dir}
          className="fixed bottom-20 end-5 z-50 w-80 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ maxHeight: '520px' }}
        >
          {/* Header */}
          <div className="bg-slate-900 px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold select-none">
                ⬡
              </div>
              <div>
                <p className="text-white text-xs font-semibold">{t('agentName')}</p>
                <p className="text-slate-400 text-xs">{t('agentStatus')}</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-white transition-colors text-xl leading-none"
              aria-label={t('closeLabel')}
            >
              ×
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50"
            style={{ minHeight: 0 }}
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? userAlign : agentAlign}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? `bg-blue-600 text-white ${userCorner}`
                      : `bg-white border border-slate-200 text-slate-700 shadow-sm ${agentCorner}`
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className={`flex ${agentAlign}`}>
                <div
                  className={`bg-white border border-slate-200 rounded-2xl ${agentCorner} px-4 py-3 shadow-sm`}
                >
                  <div className="flex gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce"
                        style={{ animationDelay: `${i * 150}ms` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">
                {error}
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={sendMessage}
            className="shrink-0 border-t border-slate-200 bg-white px-3 py-3 flex gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('placeholder')}
              disabled={loading}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-300/50 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t('sendBtn')}
            </button>
          </form>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* FAB toggle button                                                    */}
      {/* ------------------------------------------------------------------ */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 end-5 z-50 w-14 h-14 rounded-full bg-slate-900 text-white shadow-lg hover:bg-slate-700 transition-colors flex items-center justify-center"
        aria-label={t('openLabel')}
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path
              d="M4 4l12 12M16 4L4 16"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
    </>
  );
}
