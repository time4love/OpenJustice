import type { Metadata } from 'next';
import { CallPageClient } from './CallPageClient';

// ---------------------------------------------------------------------------
// Server-side thesis fetch for generateMetadata.
// Uses BACKEND_URL directly (server → backend, bypasses the Next.js proxy).
// ---------------------------------------------------------------------------

// Not the same shape as the canonical ThesisSummary in @/types/thesis — this
// is the flattened title/summary/strength projection generateMetadata needs
// for Open Graph tags, not a subset of the listing-card type.
interface ThesisMetaSummary {
  title: string | null;
  summaryHe: string | null;
  strength: string | null;
}

async function fetchThesisSummary(thesisId: string): Promise<ThesisMetaSummary> {
  const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:3001';
  try {
    const res = await fetch(`${backendUrl}/api/thesis/${thesisId}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return { title: null, summaryHe: null, strength: null };
    const data = (await res.json()) as {
      thesis: { title?: string | null; headVersion?: { aiAnalysis?: { summaryHe?: string; overallStrengthAssessment?: string } | null } | null };
    };
    const hv = data.thesis?.headVersion;
    return {
      title: data.thesis?.title ?? null,
      summaryHe: hv?.aiAnalysis?.summaryHe ?? null,
      strength: hv?.aiAnalysis?.overallStrengthAssessment ?? null,
    };
  } catch {
    return { title: null, summaryHe: null, strength: null };
  }
}

// ---------------------------------------------------------------------------
// generateMetadata — Open Graph + Twitter card for social sharing
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ thesisId: string }>;
}): Promise<Metadata> {
  const { thesisId } = await params;
  const { title, summaryHe, strength } = await fetchThesisSummary(thesisId);

  const pageTitle = title
    ? `קריאה לעדים: ${title}`
    : 'קריאה לעדים — צדק לעם';

  const description = summaryHe
    ? summaryHe.slice(0, 160)
    : 'אנחנו בונים תיק משפטי מבוסס ראיות. יש לך מידע פנימי? שלח אנונימית.';

  const strengthLabel = strength ? ` · חוזק: ${strength}` : '';

  return {
    title: pageTitle,
    description: `${description}${strengthLabel}`,
    openGraph: {
      title: pageTitle,
      description,
      type: 'article',
      locale: 'he_IL',
    },
    twitter: {
      card: 'summary_large_image',
      title: pageTitle,
      description,
    },
  };
}

// ---------------------------------------------------------------------------
// Page — server component shell, renders the interactive client component
// ---------------------------------------------------------------------------

export default async function CallPage({
  params,
}: {
  params: Promise<{ thesisId: string }>;
}) {
  const { thesisId } = await params;
  return <CallPageClient thesisId={thesisId} />;
}
