import type { Change } from 'diff';

// Pure text-processing helpers over a line-diff result. Deliberately dependency-free
// (no jsdom/readability/axios, unlike WaybackScraper.ts) so they — and the tests
// that exercise them against real snapshot fixtures — never need to mock the DOM
// or HTTP stack just to import a function.

/** Minimum character length for a diff chunk to be considered substantive. */
const MIN_CHUNK_LENGTH = 40;

/** Maximum raw diff chunks per side sent to the AI. */
const MAX_CHUNKS_PER_SIDE = 8;

/**
 * Group consecutive diff changes of the same type into single string chunks.
 * Returns ALL non-empty chunks (no minimum length), largest first, capped at
 * MAX_CHUNKS_PER_SIDE. Use this for storage and display.
 */
export function groupDiffChunks(raw: Change[], type: 'added' | 'removed'): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const part of raw) {
    const isMatch = type === 'added' ? part.added : part.removed;
    if (isMatch) {
      current += part.value;
    } else {
      const trimmed = current.trim();
      if (trimmed.length > 0) chunks.push(trimmed);
      current = '';
    }
  }
  const trimmed = current.trim();
  if (trimmed.length > 0) chunks.push(trimmed);

  return chunks.sort((a, b) => b.length - a.length).slice(0, MAX_CHUNKS_PER_SIDE);
}

/**
 * Returns only chunks long enough to be meaningful AI input (≥ MIN_CHUNK_LENGTH).
 * Use this exclusively when deciding whether to invoke the ForensicAgent.
 */
export function chunksForAI(chunks: string[]): string[] {
  return chunks.filter((c) => c.length >= MIN_CHUNK_LENGTH);
}
