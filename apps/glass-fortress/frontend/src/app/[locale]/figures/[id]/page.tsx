'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';

// Redirect /figures/:id → /figures?id=:id so deep-links from timeline badges still work.
export default function FigureRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/figures?id=${id}`);
  }, [id, router]);

  return null;
}
