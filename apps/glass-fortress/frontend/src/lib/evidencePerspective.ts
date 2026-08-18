import type { EvidencePerspective } from '@/types/evidence';

interface PerspectiveStyle {
  dot: string;
  card: string;
  border: string;
  header: string;
  badge: string;
}

const PERSPECTIVE_STYLES: Record<EvidencePerspective, PerspectiveStyle> = {
  'Internal Knowledge': {
    dot: 'bg-red-500',
    card: 'bg-red-50/50',
    border: 'border-red-200',
    header: 'bg-red-50 border-red-100',
    badge: 'bg-red-100 text-red-700 border-red-200',
  },
  'Public Statement': {
    dot: 'bg-blue-500',
    card: 'bg-blue-50/50',
    border: 'border-blue-200',
    header: 'bg-blue-50 border-blue-100',
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  'Citizen Experience': {
    dot: 'bg-slate-400',
    card: 'bg-slate-50',
    border: 'border-slate-200',
    header: 'bg-slate-100 border-slate-200',
    badge: 'bg-slate-100 text-slate-600 border-slate-200',
  },
};

const FALLBACK_STYLES: PerspectiveStyle = {
  dot: 'bg-slate-400',
  card: 'bg-slate-50',
  border: 'border-slate-200',
  header: 'bg-slate-100 border-slate-200',
  badge: 'bg-slate-100 text-slate-600 border-slate-200',
};

export function perspectiveStyles(p?: string): PerspectiveStyle {
  return PERSPECTIVE_STYLES[p as EvidencePerspective] ?? FALLBACK_STYLES;
}
