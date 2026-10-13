// Tone palette shared by chips, status text and banners. One color, one meaning:
// red = blocker or error, amber = warning or needs attention, emerald = explicit success,
// blue = action, link or selection, zinc = neutral and info. Data only, no components.
import { Info, OctagonX, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { Severity } from '../../domain/types';

/** Color family of a chip, status text or banner. Severity is never shown by color alone: always icon + word too. */
export type Tone = 'neutral' | 'accent' | 'blocker' | 'warning' | 'info' | 'verified';

/** Chip fill and text per tone. Borderless on purpose: a chip is tint plus word, nothing more. */
export const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-zinc-100 text-zinc-700',
  accent: 'bg-blue-50 text-blue-700',
  blocker: 'bg-red-50 text-red-700',
  warning: 'bg-amber-50 text-amber-800',
  info: 'bg-zinc-100 text-zinc-600',
  verified: 'bg-emerald-50 text-emerald-700',
};

/** Text color per tone, for inline status text (icon + word, no chip). */
export const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-zinc-600',
  accent: 'text-blue-700',
  blocker: 'text-red-700',
  warning: 'text-amber-700',
  info: 'text-zinc-500',
  verified: 'text-emerald-700',
};

/** Icon color per tone (one step lighter than the text so the word carries the weight). */
export const TONE_ICON: Record<Tone, string> = {
  neutral: 'text-zinc-400',
  accent: 'text-blue-600',
  blocker: 'text-red-600',
  warning: 'text-amber-600',
  info: 'text-zinc-400',
  verified: 'text-emerald-600',
};

/** Icon per severity, so status never depends on color alone. */
export const SEVERITY_ICONS: Record<Severity, LucideIcon> = { blocker: OctagonX, warning: TriangleAlert, info: Info };
