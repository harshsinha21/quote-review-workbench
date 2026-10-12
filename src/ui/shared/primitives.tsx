// Small presentational building blocks shared by every view: badges, severity and trust chips,
// money, monospace text, buttons, meters and banners. Props in, markup out; no store access.

import clsx from 'clsx';
import { Ban, CircleCheck, CircleDashed, PenLine, ShieldCheck, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Severity, Trust } from '../../domain/types';
import { SEVERITY_LABELS, TRUST_LABELS } from './labels';
import { SEVERITY_ICONS, TONE_CLASSES, type Tone } from './tones';

/** A small rounded label. */
export function Badge({ tone = 'neutral', icon: Icon, children, title, className }: {
  tone?: Tone; icon?: LucideIcon; children: ReactNode; title?: string; className?: string;
}) {
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-px text-[11px] font-medium leading-4',
        TONE_CLASSES[tone], className,
      )}
    >
      {Icon && <Icon aria-hidden className="size-3 shrink-0" strokeWidth={2.25} />}
      {children}
    </span>
  );
}

/** Severity as icon + word + color, optionally with a count ("Blocker 3"). */
export function SeverityBadge({ severity, count, className }: { severity: Severity; count?: number; className?: string }) {
  return (
    <Badge tone={severity} icon={SEVERITY_ICONS[severity]} className={className}>
      {SEVERITY_LABELS[severity]}
      {count !== undefined && <span className="tabular-nums">{count}</span>}
    </Badge>
  );
}

/** Trust state of a number, plus 'no-source' for rows with no compliant vendor. */
export type TrustState = Trust | 'no-source';

const TRUST_TONES: Record<TrustState, Tone> = {
  verified: 'verified', corrected: 'accent', 'open-issue': 'blocker', unverified: 'neutral', 'no-source': 'warning',
};
const TRUST_ICONS: Record<TrustState, LucideIcon> = {
  verified: ShieldCheck, corrected: PenLine, 'open-issue': TriangleAlert, unverified: CircleDashed, 'no-source': Ban,
};

/** "Verified against email", "Corrected from email", "Open issue", "Unverified", "No compliant source". */
export function TrustChip({ trust, className }: { trust: TrustState; className?: string }) {
  return <Badge tone={TRUST_TONES[trust]} icon={TRUST_ICONS[trust]} className={className}>{TRUST_LABELS[trust]}</Badge>;
}

/** A positive confirmation chip ("Matches email"). */
export function CheckChip({ children }: { children: ReactNode }) {
  return <Badge tone="verified" icon={CircleCheck}>{children}</Badge>;
}

/**
 * Money with two decimals, tabular digits and the currency code. Null renders an em-free dash placeholder.
 * `approxUsd` adds "≈ $x.xx" for non-USD amounts.
 */
export function Money({ amount, currency, approxUsd, className }: {
  amount: number | null | undefined; currency?: string; approxUsd?: number | null; className?: string;
}) {
  if (amount === null || amount === undefined) return <span className={clsx('text-zinc-400', className)}>n/a</span>;
  return (
    <span className={clsx('inline-flex items-baseline justify-end gap-1 tabular-nums', className)}>
      <span>{amount.toFixed(2)}</span>
      {currency && <span className="text-[10px] font-medium text-zinc-400">{currency}</span>}
      {approxUsd !== undefined && approxUsd !== null && currency !== 'USD' && (
        <span className="text-[11px] text-zinc-500">≈ ${approxUsd.toFixed(2)}</span>
      )}
    </span>
  );
}

/** Monospace text for part numbers, NSNs, CAGE codes and source text. */
export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx('font-mono text-[12px] tracking-tight', className)}>{children}</span>;
}

/** Visual weight of a button. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-blue-700 text-white border-blue-700 hover:bg-blue-800',
  secondary: 'bg-white text-zinc-800 border-zinc-300 hover:bg-zinc-50',
  ghost: 'bg-transparent text-zinc-700 border-transparent hover:bg-zinc-100',
  danger: 'bg-white text-red-700 border-red-200 hover:bg-red-50',
};

/**
 * A button. When `disabledReason` is set the button is disabled and the reason shows as its tooltip
 * (on a wrapper, because disabled buttons swallow hover in some browsers).
 */
export function Button({ variant = 'secondary', size = 'sm', icon: Icon, disabledReason, className, children, ...rest }: {
  variant?: ButtonVariant; size?: 'xs' | 'sm' | 'md'; icon?: LucideIcon; disabledReason?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const isDisabled = Boolean(disabledReason) || rest.disabled;
  const button = (
    <button
      type="button"
      {...rest}
      disabled={isDisabled}
      aria-disabled={isDisabled || undefined}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600',
        'disabled:cursor-not-allowed disabled:opacity-50',
        size === 'xs' && 'h-6 px-2 text-[11px]',
        size === 'sm' && 'h-7 px-2.5 text-[12px]',
        size === 'md' && 'h-8 px-3 text-[13px]',
        BUTTON_VARIANTS[variant], className,
      )}
    >
      {Icon && <Icon aria-hidden className="size-3.5 shrink-0" />}
      {children}
    </button>
  );
  return disabledReason ? <span title={disabledReason} className="inline-flex">{button}</span> : button;
}

/** A thin progress meter with a label and "n/m" ("Parts 9/10"). */
export function Meter({ label, value, total, className }: { label: string; value: number; total: number; className?: string }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className={clsx('min-w-0', className)}>
      <div className="flex items-baseline justify-between text-[11px] text-zinc-500">
        <span>{label}</span>
        <span className="tabular-nums font-medium text-zinc-800">{value}/{total}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100" role="meter" aria-valuemin={0} aria-valuemax={total} aria-valuenow={value} aria-label={label}>
        <div className={clsx('h-full rounded-full', percent === 100 ? 'bg-emerald-600' : 'bg-blue-700')} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/** A full-width notice (yellow warning, red error, blue info) with optional actions. */
export function Banner({ tone = 'warning', title, children, actions, className }: {
  tone?: Extract<Tone, 'warning' | 'blocker' | 'info'>; title: string; children?: ReactNode; actions?: ReactNode; className?: string;
}) {
  const Icon = SEVERITY_ICONS[tone === 'blocker' ? 'blocker' : tone];
  return (
    <div role={tone === 'blocker' ? 'alert' : 'status'} className={clsx('flex items-start gap-2 rounded-md border px-3 py-2 text-[13px]', TONE_CLASSES[tone], className)}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        {children && <div className="mt-0.5 text-[12px] opacity-90">{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}

/** A quiet centered message for empty lists ("No open issues. Ready to mark verified."). */
export function EmptyState({ icon: Icon = CircleCheck, children }: { icon?: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-[13px] text-zinc-500">
      <Icon aria-hidden className="size-5 text-emerald-600" />
      <p>{children}</p>
    </div>
  );
}

/** A section heading with an optional right-aligned slot. */
export function SectionHeader({ title, children, className }: { title: string; children?: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex items-center justify-between gap-2', className)}>
      <h2 className="text-[13px] font-semibold text-zinc-900">{title}</h2>
      {children}
    </div>
  );
}
