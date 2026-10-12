// Tone palette shared by chips, banners and highlights (section 8). Data only, no components.
import { Info, OctagonX, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { Severity } from '../../domain/types';

/** Color family of a chip or banner. Severity is never shown by color alone: always icon + word too. */
export type Tone = 'neutral' | 'accent' | 'blocker' | 'warning' | 'info' | 'verified';

/** Background, text and border classes per tone (section 8 palette). */
export const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  accent: 'bg-blue-50 text-blue-700 border-blue-200',
  blocker: 'bg-red-50 text-red-700 border-red-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  info: 'bg-sky-50 text-sky-700 border-sky-200',
  verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

/** Icon per severity, so status never depends on color alone. */
export const SEVERITY_ICONS: Record<Severity, LucideIcon> = { blocker: OctagonX, warning: TriangleAlert, info: Info };

