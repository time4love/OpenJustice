#!/usr/bin/env node
/**
 * Build-time gate on help-centre content.
 *
 * Enforces the mechanically checkable parts of
 * `docs/gf-help-centre-redaction-policy.md`:
 *
 *   Rule C — images are allowed for INTERFACES and barred for CONTENT. A phase
 *            may show a screenshot of a client's settings dialog; it may not
 *            show one of a conversation, a thesis, a tool response or a
 *            terminal. What this file can check is the boundary: an image is
 *            referenced only by a phase that declared it, only from
 *            `public/guide/`, only with a caption, and only if the file is
 *            really there. What is INSIDE the picture is a review rule.
 *   Rule E — no infrastructure identifiers. This repository is public.
 *
 * Plus the structural completeness the type system cannot see from JSON alone:
 * every phase carries the same fields, and every step carries a title and a
 * body. (Slug and step-id existence, and he/en shape equality, are locked at
 * compile time in `src/lib/guide.ts` — this file does not repeat those.)
 *
 * Rules A, B, D and F are judgement calls about whether a sentence describes a
 * document or a person. No regex decides that honestly, so they are review
 * rules and are deliberately NOT claimed here.
 *
 * Runs as part of `npm run build`, so a violation fails the deploy instead of
 * shipping.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = ['he', 'en'];

const PHASE_FIELDS = ['title', 'summary', 'goal', 'verify', 'pitfall'];
const STEP_FIELDS = ['title', 'body'];

/** Where a declared screenshot must live, so an image cannot arrive from anywhere else. */
const SCREENSHOT_DIR = join(root, 'public', 'guide');

/**
 * Screenshot ids the manifest declares, read from `src/lib/guide.ts`.
 *
 * Read as text on purpose: the manifest is TypeScript and this runs on plain
 * node before the build. The type system already guarantees a declared id has a
 * caption — what it cannot see is whether the FILE exists, which is what this
 * adds. A page rendering a broken image is its own kind of lie about maturity.
 */
/**
 * Phases whose manifest declares a worked example, and steps that declare a
 * collapsed detail block.
 *
 * Both are booleans/lists in TypeScript and prose in JSON, so nothing in the
 * type system connects them. A phase claiming `hasProductionExample: true` with
 * no example text renders an empty box under a heading that promises one —
 * which is exactly the "displays its own maturity" claim being false.
 */
function declaredExtras() {
  const src = readFileSync(join(root, 'src', 'lib', 'guide.ts'), 'utf8');
  const examples = new Set();
  const details = new Set();
  for (const m of src.matchAll(/slug: '([a-z]+)',[\s\S]*?hasProductionExample: (true|false),/g)) {
    if (m[2] === 'true') examples.add(m[1]);
  }
  for (const m of src.matchAll(/slug: '([a-z]+)',[\s\S]*?detailSteps: \[([^\]]*)\]/g)) {
    for (const step of m[2].matchAll(/'([a-zA-Z]+)'/g)) details.add(`${m[1]}.${step[1]}`);
  }
  return { examples, details };
}

function declaredScreenshotIds() {
  const src = readFileSync(join(root, 'src', 'lib', 'guide.ts'), 'utf8');
  const ids = new Set();
  for (const m of src.matchAll(/\bid:\s*'([^']+)'/g)) ids.add(m[1]);
  return ids;
}

/**
 * Rule C — prose is not where a picture gets smuggled in.
 *
 * A screenshot is declared in the manifest and rendered by the page; a message
 * string has no legitimate reason to carry an image reference, so one appearing
 * there means the declaration was bypassed.
 */
const IMAGE_PATTERNS = [
  { re: /<img\b/i, why: 'inline image tag' },
  { re: /!\[[^\]]*\]\(/, why: 'markdown image' },
  { re: /\.(png|jpe?g|webp|gif|avif)\b/i, why: 'image file reference' },
];

/** Rule E — infrastructure identifiers that must never reach a public repo. */
const SECRET_PATTERNS = [
  { re: /postgres(ql)?:\/\//i, why: 'database connection string' },
  { re: /:\/\/[^/\s]+:[^/\s]+@/, why: 'credentials embedded in a URL' },
  { re: /\beyJ[A-Za-z0-9_-]{10,}/, why: 'JWT' },
  { re: /\bsk-[A-Za-z0-9_-]{16,}/, why: 'API key' },
  { re: /\b[a-z]{20}\.supabase\.(co|in)\b/i, why: 'Supabase project ref' },
  { re: /\b[a-z]{20}\b/, why: 'bare 20-character project ref' },
  { re: /\.railway\.internal\b/i, why: 'Railway internal hostname' },
  { re: /-----BEGIN [A-Z ]*(KEY|CERTIFICATE)-----/, why: 'embedded key material' },
  { re: /\b(SERVICE_ROLE|ANON_KEY|SUPABASE_[A-Z_]+|OAUTH_JWKS)\b/, why: 'environment variable name' },
];

const failures = [];

function fail(locale, path, message) {
  failures.push(`${locale}: guide.${path} — ${message}`);
}

function scanString(locale, path, value) {
  for (const { re, why } of IMAGE_PATTERNS) {
    if (re.test(value)) fail(locale, path, `Rule C violation: ${why}`);
  }
  for (const { re, why } of SECRET_PATTERNS) {
    if (re.test(value)) fail(locale, path, `Rule E violation: ${why}`);
  }
}

function walk(locale, path, value) {
  if (typeof value === 'string') {
    scanString(locale, path, value);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      walk(locale, path ? `${path}.${key}` : key, child);
    }
    return;
  }
  fail(locale, path, `expected a string or an object, got ${typeof value}`);
}

for (const locale of LOCALES) {
  const messages = JSON.parse(readFileSync(join(root, 'messages', `${locale}.json`), 'utf8'));
  const guide = messages.guide;

  if (!guide || typeof guide !== 'object') {
    failures.push(`${locale}: the "guide" namespace is missing`);
    continue;
  }

  walk(locale, '', guide);

  const phases = guide.phases ?? {};
  for (const [slug, phase] of Object.entries(phases)) {
    for (const field of PHASE_FIELDS) {
      if (typeof phase?.[field] !== 'string' || phase[field].trim() === '') {
        fail(locale, `phases.${slug}.${field}`, 'missing or empty');
      }
    }
    const steps = phase?.steps ?? {};
    if (Object.keys(steps).length === 0) {
      fail(locale, `phases.${slug}.steps`, 'a phase with no steps teaches nothing');
    }
    for (const [stepId, step] of Object.entries(steps)) {
      for (const field of STEP_FIELDS) {
        if (typeof step?.[field] !== 'string' || step[field].trim() === '') {
          fail(locale, `phases.${slug}.steps.${stepId}.${field}`, 'missing or empty');
        }
      }
    }
  }
}

// A declared example or detail must have text behind it, in EVERY locale.
{
  const { examples, details } = declaredExtras();
  for (const locale of LOCALES) {
    const phases = JSON.parse(readFileSync(join(root, 'messages', `${locale}.json`), 'utf8')).guide?.phases ?? {};
    for (const slug of examples) {
      const text = phases[slug]?.example;
      if (typeof text !== 'string' || text.trim() === '') {
        failures.push(`${locale}: phase "${slug}" declares hasProductionExample but has no example text`);
      }
    }
    for (const ref of details) {
      const [slug, step] = ref.split('.');
      const text = phases[slug]?.steps?.[step]?.detail;
      if (typeof text !== 'string' || text.trim() === '') {
        failures.push(`${locale}: step "${ref}" is in detailSteps but has no detail text`);
      }
    }
  }
}

// Rule C, the half a machine can check: every declared screenshot is really
// there, and nothing else is sitting in the directory unreferenced.
const declared = declaredScreenshotIds();
for (const id of declared) {
  if (!existsSync(join(SCREENSHOT_DIR, `${id}.png`))) {
    failures.push(`manifest declares screenshot "${id}" but public/guide/${id}.png does not exist`);
  }
}
if (existsSync(SCREENSHOT_DIR)) {
  for (const file of readdirSync(SCREENSHOT_DIR)) {
    const id = file.replace(/\.png$/, '');
    if (file.endsWith('.png') && !declared.has(id)) {
      failures.push(
        `public/guide/${file} is not declared in src/lib/guide.ts — an image nobody listed is an image nobody reviewed`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error(`\ncheck-guide-content: ${failures.length} violation(s)\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error('\nSee docs/gf-help-centre-redaction-policy.md\n');
  process.exit(1);
}

console.log('check-guide-content: ok');
