import { Suspense } from 'react';
import { OAuthInteractionClient } from './OAuthInteractionClient';

// ---------------------------------------------------------------------------
// Server component shell, matching the app's existing pattern for dynamic
// routes (see call/[thesisId]/page.tsx) — params is a Promise here, awaited
// once, then handed to the interactive client component as a plain prop.
//
// Suspense boundary here because OAuthInteractionClient reads useSearchParams
// (for loginError) — same requirement login/page.tsx already has.
// ---------------------------------------------------------------------------

export default async function OAuthInteractionPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const { uid } = await params;
  return (
    <Suspense>
      <OAuthInteractionClient uid={uid} />
    </Suspense>
  );
}
