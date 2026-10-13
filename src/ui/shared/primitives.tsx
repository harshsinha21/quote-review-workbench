// Small presentational building blocks shared by every view: status text, chips, money, identifiers,
// buttons, progress, banners, headers, tabs and disclosures. Props in, markup out; no store access.
// Visual rule: the healthy default is quiet; color, chips and icons are for exceptions.

import clsx from 'clsx';
import {
  Ban, Check, ChevronRight, CircleDashed, Inbox, PenLine, ShieldCheck, TriangleAlert, type LucideIcon,
} from 'lucide-react';
import { Children, useId, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { Severity, Trust } from '../../domain/types';
import { formatApproxUsd, formatMoney } from './format';
import { CUSTOMER_TRUST_LABELS, SEVERITY_LABELS, TRUST_LABELS } from './labels';
import { TEXT } from './styles';
import { SEVERITY_ICONS, TONE_CLASSES, TONE_ICON, TONE_TEXT, type Tone } from './tones';

// ---------- status ----------

/** A small borderless chip: tint plus word. Use for a short state only, at most one per row. */
export function Badge({ tone = 'neutral', icon: Icon, children, title, className }: {
  tone?: Tone; icon?: LucideIcon; children: ReactNode; title?: string; className?: string;
}) {
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-px text-[11px] font-medium leading-4',
        TONE_CLASSES[tone], className,
      )}
    >
      {Icon && <Icon aria-hidden className="size-3 shrink-0" strokeWidth={2.25} />}
      {children}
    </span>
  );
}

/** Inline status: a colored icon plus a word, no chip. The default way to show state. */
export function StatusText({ tone, icon: Icon, children, title, className }: {
  tone: Tone; icon?: LucideIcon; children: ReactNode; title?: string; className?: string;
}) {
  return (
    <span title={title} className={clsx('inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-medium', TONE_TEXT[tone], className)}>
      {Icon && <Icon aria-hidden className={clsx('size-3.5 shrink-0', TONE_ICON[tone])} />}
      {children}
    </span>
  );
}

/** Just the severity icon, with the word for screen readers (for dense rows where the title says the rest). */
export function SeverityIcon({ severity, className }: { severity: Severity; className?: string }) {
  const Icon = SEVERITY_ICONS[severity];
  return (
    <span className={clsx('inline-flex shrink-0', className)}>
      <Icon aria-hidden className={clsx('size-3.5', TONE_ICON[severity])} />
      <span className="sr-only">{SEVERITY_LABELS[severity]}</span>
    </span>
  );
}

/** Severity as icon + word (+ optional count), never color alone: "Blockers 3". */
export function SeverityBadge({ severity, count, className }: { severity: Severity; count?: number; className?: string }) {
  return (
    <StatusText tone={severity} icon={SEVERITY_ICONS[severity]} className={className}>
      {SEVERITY_LABELS[severity]}
      {count !== undefined && <span className="tabular-nums text-zinc-400">{count}</span>}
    </StatusText>
  );
}

/** Trust state of a number, plus 'no-source' for rows with no eligible vendor. */
export type TrustState = Trust | 'no-source';

const TRUST_TONES: Record<'ops' | 'customer', Record<TrustState, Tone>> = {
  ops: { verified: 'verified', corrected: 'accent', 'open-issue': 'blocker', unverified: 'neutral', 'no-source': 'blocker' },
  customer: { verified: 'verified', corrected: 'accent', 'open-issue': 'warning', unverified: 'neutral', 'no-source': 'warning' },
};
const TRUST_ICONS: Record<TrustState, LucideIcon> = {
  verified: ShieldCheck, corrected: PenLine, 'open-issue': TriangleAlert, unverified: CircleDashed, 'no-source': Ban,
};

/**
 * Trust as icon + word. Ops wording by default ("Open issue"); audience 'customer' uses plain words and keeps
 * red out ("Being confirmed"). Callers usually skip it for 'verified', the quiet default.
 */
export function TrustChip({ trust, audience = 'ops', className }: { trust: TrustState; audience?: 'ops' | 'customer'; className?: string }) {
  const labels = audience === 'customer' ? CUSTOMER_TRUST_LABELS : TRUST_LABELS;
  return <StatusText tone={TRUST_TONES[audience][trust]} icon={TRUST_ICONS[trust]} className={className}>{labels[trust]}</StatusText>;
}

/** A positive confirmation, used sparingly ("Matches email"). */
export function CheckChip({ children }: { children: ReactNode }) {
  return <StatusText tone="verified" icon={Check}>{children}</StatusText>;
}

// ---------- values ----------

/**
 * An amount in its own currency ("$1.74", "€2.16"), right-aligned digits. `approxUsd` adds a quiet "≈ $2.38"
 * for non-USD amounts. A null amount renders `emptyLabel` (pass "Missing" or "Not quoted"; never "n/a").
 */
export function Money({ amount, currency, approxUsd, emptyLabel = '—', emptyTone = 'neutral', className }: {
  amount: number | null | undefined; currency?: string; approxUsd?: number | null;
  emptyLabel?: string; emptyTone?: 'neutral' | 'blocker'; className?: string;
}) {
  if (amount === null || amount === undefined) {
    return (
      <span className={clsx(emptyTone === 'blocker' ? 'text-[12px] font-medium text-red-600' : 'text-zinc-400', className)}>
        {emptyLabel}
      </span>
    );
  }
  return (
    <span className={clsx('inline-flex items-baseline justify-end gap-1.5 tabular-nums', className)}>
      <span>{formatMoney(amount, currency || 'USD')}</span>
      {approxUsd !== undefined && approxUsd !== null && currency && currency !== 'USD' && (
        <span className="text-[11px] text-zinc-400">{formatApproxUsd(approxUsd)}</span>
      )}
    </span>
  );
}

/**
 * A compared amount: USD first ("$5.34"), with the vendor's own amount under it when it was converted ("€4.85").
 * Use wherever vendors are ranked, compared or totalled.
 */
export function UsdAmount({ usd, nativeAmount, nativeCurrency, className }: {
  usd: number | null | undefined; nativeAmount?: number | null; nativeCurrency?: string; className?: string;
}) {
  if (usd === null || usd === undefined) return <span className={clsx('text-zinc-400', className)}>—</span>;
  const isConverted = Boolean(nativeCurrency && nativeCurrency !== 'USD' && nativeAmount !== null && nativeAmount !== undefined);
  return (
    <span className={clsx('inline-flex flex-col items-end tabular-nums leading-tight', className)}>
      <span>{isConverted ? '≈ ' : ''}{formatMoney(usd, 'USD')}</span>
      {isConverted && nativeAmount !== null && nativeAmount !== undefined && (
        <span className="text-[11px] font-normal text-zinc-400">{formatMoney(nativeAmount, nativeCurrency)}</span>
      )}
    </span>
  );
}

/** Monospace text for part numbers, NSNs, CAGE codes and source text. */
export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx('font-mono text-[12px]', className)}>{children}</span>;
}

/** "#1 MS27039-1-08": the item number in zinc-500, the part number in mono. The one identifier format everywhere. */
export function ItemLabel({ rfqNo, partNumber, className }: { rfqNo?: number; partNumber: string; className?: string }) {
  return (
    <span className={clsx('inline-flex items-baseline gap-1.5 whitespace-nowrap', className)}>
      {rfqNo !== undefined && <span className="tabular-nums text-zinc-400">#{rfqNo}</span>}
      <span className="font-mono text-[12px] font-medium text-zinc-900">{partNumber}</span>
    </span>
  );
}

/** "Terms NET 30 · Valid until Jun 13": facts as one quiet line, never as chips. Empty children are skipped. */
export function MetaLine({ children, className }: { children: ReactNode; className?: string }) {
  const visibleItems = Children.toArray(children).filter((item) => item !== '');
  return (
    <p className={clsx('flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5', TEXT.meta, className)}>
      {visibleItems.map((item, index) => (
        <span key={index} className="inline-flex items-baseline gap-1.5">
          {index > 0 && <span aria-hidden className="text-zinc-300">·</span>}
          {item}
        </span>
      ))}
    </p>
  );
}

/** One fact for a MetaLine: label in zinc-500, value in zinc-800. */
export function MetaItem({ label, children }: { label: string; children: ReactNode }) {
  return <span><span className="text-zinc-500">{label}</span> <span className="text-zinc-800">{children}</span></span>;
}

// ---------- actions ----------

/** Visual weight of a button. One primary per region. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-blue-700 text-white border-blue-700 hover:bg-blue-800 shadow-sm',
  secondary: 'bg-white text-zinc-800 border-zinc-200 hover:bg-zinc-50 hover:border-zinc-300 shadow-xs',
  ghost: 'bg-transparent text-zinc-600 border-transparent hover:bg-zinc-100 hover:text-zinc-900',
  danger: 'bg-white text-red-700 border-zinc-200 hover:bg-red-50 hover:border-red-200',
};

/** A keyboard shortcut hint ("E"). */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={clsx('inline-flex h-4 min-w-4 items-center justify-center rounded border border-current/25 px-1 font-sans text-[10px] font-medium leading-none opacity-70', className)}>
      {children}
    </kbd>
  );
}

/**
 * A button. `kbd` shows a shortcut hint. Avoid disabled primaries: show the gate as visible text instead.
 * When `disabledReason` is set the button is disabled and the reason is its tooltip (on a wrapper, since
 * disabled buttons swallow hover in some browsers).
 */
export function Button({ variant = 'secondary', size = 'sm', icon: Icon, kbd, disabledReason, className, children, ...rest }: {
  variant?: ButtonVariant; size?: 'xs' | 'sm' | 'md'; icon?: LucideIcon; kbd?: string; disabledReason?: string;
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
        size === 'xs' && 'h-6 px-2 text-[12px]',
        size === 'sm' && 'h-7 px-2.5 text-[12px]',
        size === 'md' && 'h-8 px-3 text-[13px]',
        BUTTON_VARIANTS[variant], className,
      )}
    >
      {Icon && <Icon aria-hidden className="size-3.5 shrink-0" />}
      {children}
      {kbd && <Kbd className="ml-0.5">{kbd}</Kbd>}
    </button>
  );
  return disabledReason ? <span title={disabledReason} className="inline-flex">{button}</span> : button;
}

// ---------- progress ----------

/** A thin progress bar: blue on a blue track, emerald once complete. */
export function ProgressBar({ value, total, label, className }: { value: number; total: number; label: string; className?: string }) {
  const percent = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  const isComplete = total > 0 && value >= total;
  return (
    <div
      role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={value}
      className={clsx('h-1.5 overflow-hidden rounded-full', isComplete ? 'bg-emerald-100' : 'bg-blue-100', className)}
    >
      <div className={clsx('h-full rounded-full', isComplete ? 'bg-emerald-600' : 'bg-blue-600')} style={{ width: `${percent}%` }} />
    </div>
  );
}

/** A progress bar with its label and "n/m" above it ("Breaks quoted 20/27"). */
export function Meter({ label, value, total, className }: { label: string; value: number; total: number; className?: string }) {
  return (
    <div className={clsx('min-w-0', className)}>
      <div className="mb-1 flex items-baseline justify-between text-[12px] text-zinc-500">
        <span>{label}</span>
        <span className="tabular-nums font-medium text-zinc-800">{value}/{total}</span>
      </div>
      <ProgressBar value={value} total={total} label={label} />
    </div>
  );
}

// ---------- notices ----------

/** A full-width notice (amber warning, red error, neutral info) with optional actions. Say a shared fact once, here. */
export function Banner({ tone = 'warning', title, children, actions, icon, className }: {
  tone?: Extract<Tone, 'warning' | 'blocker' | 'info'>; title: ReactNode; children?: ReactNode; actions?: ReactNode;
  icon?: LucideIcon; className?: string;
}) {
  const Icon = icon ?? SEVERITY_ICONS[tone === 'blocker' ? 'blocker' : tone];
  const surface = { warning: 'bg-amber-50 text-amber-900', blocker: 'bg-red-50 text-red-900', info: 'bg-zinc-100 text-zinc-800' }[tone];
  return (
    <div role={tone === 'blocker' ? 'alert' : 'status'} className={clsx('flex items-start gap-2.5 rounded-md px-3 py-2.5 text-[13px]', surface, className)}>
      <Icon aria-hidden className={clsx('mt-px size-4 shrink-0', TONE_ICON[tone])} />
      <div className="min-w-0 flex-1">
        <div className="font-medium">{title}</div>
        {children && <div className="mt-0.5 text-[12px] opacity-90">{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}

/** A quiet centered message for empty lists. Pass tone 'verified' only when the emptiness is good news. */
export function EmptyState({ icon: Icon = Inbox, tone = 'neutral', children }: { icon?: LucideIcon; tone?: Tone; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-[13px] text-zinc-500">
      <Icon aria-hidden className={clsx('size-5', TONE_ICON[tone])} />
      <p>{children}</p>
    </div>
  );
}

// ---------- layout ----------

/** Every screen header: title, one status sentence that says what is next, and the primary action. */
export function PageHeader({ title, description, actions, children, className }: {
  title: ReactNode; description?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string;
}) {
  return (
    <header className={clsx('mb-6', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className={TEXT.pageTitle}>{title}</h1>
          {description && <div className="mt-1 text-[13px] text-zinc-600">{description}</div>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/** A section heading (15px) with an optional quiet description and a right-aligned slot. */
export function SectionHeader({ title, description, children, className }: {
  title: ReactNode; description?: ReactNode; children?: ReactNode; className?: string;
}) {
  return (
    <div className={clsx('flex flex-wrap items-end justify-between gap-x-4 gap-y-2', className)}>
      <div className="min-w-0">
        <h2 className={TEXT.sectionTitle}>{title}</h2>
        {description && <p className="mt-0.5 text-[12px] text-zinc-500">{description}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

/** One tab option. `count` renders quietly after the label. */
export interface TabItem { id: string; label: ReactNode; count?: number; accessory?: ReactNode }

/** Text tabs with an underline for the active one. Use to split a page into jobs, never to hide the main task. */
export function Tabs({ items, value, onChange, label, className }: {
  items: TabItem[]; value: string; onChange: (id: string) => void; label: string; className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={clsx('flex gap-5 border-b border-zinc-200', className)}>
      {items.map((item) => {
        const isActive = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item.id)}
            className={clsx(
              '-mb-px inline-flex h-9 items-center gap-1.5 border-b-2 text-[13px] font-medium transition-colors',
              isActive ? 'border-blue-700 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-800',
            )}
          >
            {item.label}
            {item.count !== undefined && <span className="tabular-nums text-zinc-400">{item.count}</span>}
            {item.accessory}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Detail one click away: a summary line with a chevron that reveals its content in place.
 * Uncontrolled by default; pass `open` and `onOpenChange` to control it.
 */
export function Disclosure({ summary, children, defaultOpen = false, open, onOpenChange, className, summaryClassName }: {
  summary: ReactNode; children: ReactNode; defaultOpen?: boolean; open?: boolean; onOpenChange?: (isOpen: boolean) => void;
  className?: string; summaryClassName?: string;
}) {
  const [isOpenLocal, setIsOpenLocal] = useState(defaultOpen);
  const isOpen = open ?? isOpenLocal;
  const contentId = useId();
  const toggle = () => {
    const next = !isOpen;
    if (open === undefined) setIsOpenLocal(next);
    onOpenChange?.(next);
  };
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={toggle}
        className={clsx('group inline-flex items-center gap-1.5 rounded text-left text-[12px] font-medium text-zinc-600 hover:text-zinc-900', summaryClassName)}
      >
        <ChevronRight aria-hidden className={clsx('size-3.5 shrink-0 text-zinc-400 transition-transform', isOpen && 'rotate-90')} />
        {summary}
      </button>
      {isOpen && <div id={contentId} className="mt-2">{children}</div>}
    </div>
  );
}
