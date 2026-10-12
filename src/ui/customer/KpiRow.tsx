// Customer KPI strip: parts, price breaks, breaks with and without a compliant source, and the
// earliest quote expiry. Presentational: counts come in as props; it reads no store.

import clsx from 'clsx';
import { CalendarX, ShieldCheck, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatDate } from '../shared/format';
import { Badge } from '../shared/primitives';
import type { EarliestExpiry } from './customerView';

/** Props for KpiRow: the numbers a customer reads before any table. */
export interface KpiRowProps {
  partCount: number;
  breakCount: number;
  sourcedBreakCount: number;    // breaks with a recommended vendor (verified, compliant, exact PN)
  followUpBreakCount: number;   // breaks with no recommended vendor yet
  earliestExpiry?: EarliestExpiry;
  className?: string;
}

/** Five figures in one divided panel, set larger than the Ops view. */
export function KpiRow({ partCount, breakCount, sourcedBreakCount, followUpBreakCount, earliestExpiry, className }: KpiRowProps) {
  return (
    <dl className={clsx('grid grid-cols-2 gap-px overflow-clip rounded-md border border-zinc-200 bg-zinc-200 lg:grid-cols-5', className)}>
      <Kpi label="Parts requested" value={partCount} />
      <Kpi label="Price breaks" value={breakCount} note="Part and quantity pairs" />
      <Kpi
        label="Verified, compliant source" value={sourcedBreakCount} note={`of ${breakCount} price breaks`}
        icon={ShieldCheck} iconClassName="text-emerald-600"
      />
      <Kpi
        label="Need vendor follow-up" value={followUpBreakCount} note="No compliant source yet"
        icon={TriangleAlert} iconClassName="text-amber-600"
      />
      <Kpi
        label="Earliest quote expiry"
        value={earliestExpiry ? formatDate(earliestExpiry.date) : 'Not stated'}
        isTextValue
        note={earliestExpiry && <ExpiryNote expiry={earliestExpiry} />}
        className="col-span-2 lg:col-span-1"
      />
    </dl>
  );
}

/** One figure: label, large value and an optional note under it. */
function Kpi({ label, value, note, icon: Icon, iconClassName, isTextValue = false, className }: {
  label: string; value: ReactNode; note?: ReactNode; icon?: LucideIcon; iconClassName?: string;
  isTextValue?: boolean; className?: string;
}) {
  return (
    <div className={clsx('flex flex-col gap-1 bg-white px-5 py-4', className)}>
      <dt className="flex items-center gap-1.5 text-[13px] text-zinc-500">
        {Icon && <Icon aria-hidden className={clsx('size-4 shrink-0', iconClassName)} />}
        {label}
      </dt>
      <dd className={clsx(
        'font-semibold tracking-tight text-zinc-900 tabular-nums',
        isTextValue ? 'text-[20px] leading-9' : 'text-[28px] leading-9',
      )}
      >
        {value}
      </dd>
      {note && <dd className="text-[12px] text-zinc-500">{note}</dd>}
    </div>
  );
}

/** Which vendor's quote expires first, with an Expired badge once the date has passed. */
function ExpiryNote({ expiry }: { expiry: EarliestExpiry }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span>{expiry.vendorName}</span>
      {expiry.isExpired && <Badge tone="warning" icon={CalendarX}>Expired</Badge>}
    </span>
  );
}
