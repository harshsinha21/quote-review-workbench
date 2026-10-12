// Ops triage screen: one card per vendor, then a "Needs attention" table of every open blocker.
// Reads the store and the derived model only; it never recomputes rules or edits review data.
// Vendor text (names, terms, flag titles and details) renders only as React text nodes.

import clsx from 'clsx';
import { CalendarX, CircleCheck, CircleDashed, ShieldCheck, type LucideIcon } from 'lucide-react';
import type { Flag, Rfq, Severity, VendorReview } from '../../domain/types';
import { useReview, useReviewModel } from '../../store/useReview';
import { formatDate, shortVendorName } from '../shared/format';
import { SEVERITY_LABELS } from '../shared/labels';
import { Badge, Button, EmptyState, Meter, Mono, SectionHeader, SeverityBadge } from '../shared/primitives';
import { SEVERITY_ICONS, type Tone } from '../shared/tones';

/** How many open issues a vendor card lists before "+N more". */
const TOP_ISSUE_COUNT = 3;
/** Severities in display order, most serious first. */
const SEVERITY_ORDER: readonly Severity[] = ['blocker', 'warning', 'info'];
/** Icon color per severity (section 8: red-600, amber-600, sky-700). */
const SEVERITY_TEXT: Record<Severity, string> = {
  blocker: 'text-red-600', warning: 'text-amber-600', info: 'text-sky-700',
};
/** Status pill per review status. */
const STATUS_BADGES: Record<VendorReview['status'], { label: string; tone: Tone; icon: LucideIcon }> = {
  'needs-review': { label: 'Needs review', tone: 'warning', icon: CircleDashed },
  ready: { label: 'Ready', tone: 'accent', icon: CircleCheck },
  submitted: { label: 'Verified', tone: 'verified', icon: ShieldCheck },
};
/** Column header cell: small uppercase label, sticky inside the table's scroll area. */
const HEADER_CELL =
  'sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-zinc-500';
/** Column labels of the "Needs attention" table, in order. */
const BLOCKER_COLUMNS = ['Vendor', 'Severity', 'Issue', 'Detail', 'Item'] as const;

/** Opens one vendor's review screen, optionally with a flag selected (the store action). */
type OpenVendorReview = (vendorId: string, flag?: Flag) => void;

/** One open blocker together with the vendor review it belongs to. */
interface BlockerRow { review: VendorReview; flag: Flag }

/** Ops triage: one card per vendor, then every open blocker across vendors. */
export function OpsOverview() {
  const model = useReviewModel();
  const openVendorReview = useReview((state) => state.openVendorReview);
  const blockers: BlockerRow[] = model.vendors.flatMap((review) =>
    review.open.filter((flag) => flag.severity === 'blocker').map((flag) => ({ review, flag })));

  return (
    <div className="max-w-[1200px] p-6 text-[13px] text-zinc-800">
      <header className="mb-4 min-w-0">
        <h1 className="text-[15px] font-semibold text-zinc-900">Overview</h1>
        <p className="mt-0.5 truncate text-zinc-500">{rfqSummary(model.rfq)}</p>
      </header>

      {model.vendors.length === 0 ? (
        <div className="rounded-md border border-zinc-200 bg-white px-4 py-8 text-center text-zinc-500">
          No vendor replies to review yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {model.vendors.map((review) => (
            <VendorCard key={review.vendor.id} review={review} onOpen={openVendorReview} />
          ))}
        </div>
      )}

      <section aria-label="Needs attention" className="mt-8">
        <SectionHeader title="Needs attention" className="mb-2">
          <span className="text-[12px] tabular-nums text-zinc-500">
            {blockers.length} open {blockers.length === 1 ? 'blocker' : 'blockers'}
          </span>
        </SectionHeader>
        <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
          {blockers.length === 0
            ? <EmptyState>No open blockers.</EmptyState>
            : <BlockerTable rows={blockers} onOpen={openVendorReview} />}
        </div>
      </section>
    </div>
  );
}

/** "RFQ subject · 10 items · Due May 28, 2026" for the title row. */
function rfqSummary(rfq: Rfq): string {
  const itemCount = rfq.items.length;
  const segments = [
    rfq.subject || 'RFQ',
    `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`,
    rfq.dueDate ? `Due ${formatDate(rfq.dueDate)}` : 'No due date stated',
  ];
  return segments.join(' · ');
}

/** Sort comparator: blockers, then warnings, then info. Stable, so engine order holds within a severity. */
function bySeverity(first: Flag, second: Flag): number {
  return SEVERITY_ORDER.indexOf(first.severity) - SEVERITY_ORDER.indexOf(second.severity);
}

/** One vendor's triage card: reply, coverage, open counts, top issues, terms, validity, status and Review. */
function VendorCard({ review, onOpen }: { review: VendorReview; onOpen: OpenVendorReview }) {
  const { vendor, coverage, counts, open } = review;
  const status = STATUS_BADGES[review.status];
  const topIssues = [...open].sort(bySeverity).slice(0, TOP_ISSUE_COUNT);
  const hiddenIssueCount = open.length - topIssues.length;
  const replyLine = [
    review.respondedAt ? `Replied ${formatDate(review.respondedAt)}` : 'No reply yet',
    review.sourceLabel,
  ].filter(Boolean).join(' · ');

  return (
    <article className="flex min-w-0 flex-col rounded-md border border-zinc-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-[13px] font-semibold text-zinc-900" title={vendor.name}>{vendor.name}</h2>
          <p className="mt-0.5 text-[12px] text-zinc-500">
            CAGE{' '}
            {vendor.cage ? <Mono className="text-zinc-700">{vendor.cage}</Mono> : 'not stated'}
          </p>
        </div>
        <Badge tone={status.tone} icon={status.icon}>{status.label}</Badge>
      </div>

      <p className="mt-1 truncate text-[12px] text-zinc-500" title={replyLine}>{replyLine}</p>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <Meter label="Parts" value={coverage.partsQuoted} total={coverage.parts} />
        <Meter label="Breaks" value={coverage.breaksQuoted} total={coverage.breaks} />
      </div>

      <div role="group" aria-label="Open issues by severity" className="mt-4 flex flex-wrap items-center gap-1.5">
        {SEVERITY_ORDER.map((severity) => (
          <SeverityBadge
            key={severity}
            severity={severity}
            count={counts[severity]}
            className={counts[severity] === 0 ? 'opacity-50' : undefined}
          />
        ))}
      </div>

      {topIssues.length === 0 ? (
        <p className="mt-3 flex items-center gap-1.5 text-[12px] text-zinc-500">
          <CircleCheck aria-hidden className="size-3.5 shrink-0 text-emerald-600" />
          No open issues.
        </p>
      ) : (
        <ul className="-mx-1.5 mt-3 space-y-px">
          {topIssues.map((flag) => (
            <IssueLine key={flag.id} flag={flag} onOpen={() => onOpen(vendor.id, flag)} />
          ))}
          {hiddenIssueCount > 0 && (
            <li className="px-1.5 pt-0.5 text-[12px] tabular-nums text-zinc-500">+{hiddenIssueCount} more</li>
          )}
        </ul>
      )}

      <div className="mt-auto pt-4">
        <div className="flex items-end justify-between gap-3 border-t border-zinc-100 pt-3">
          <dl className="min-w-0 space-y-1 text-[12px]">
            <div className="flex min-w-0 gap-1.5">
              <dt className="shrink-0 text-zinc-500">Terms</dt>
              <dd className="truncate text-zinc-800" title={vendor.paymentTerms}>
                {vendor.paymentTerms || 'Not stated'}
              </dd>
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
              <dt className="sr-only">Validity</dt>
              <dd className="flex min-w-0 items-center gap-1.5 text-zinc-500">
                <span className="truncate">
                  {review.validUntil ? `Valid until ${formatDate(review.validUntil)}` : 'Validity not stated'}
                </span>
                {review.expired && <Badge tone="blocker" icon={CalendarX}>Expired</Badge>}
              </dd>
            </div>
          </dl>
          <Button variant="primary" onClick={() => onOpen(vendor.id)} aria-label={`Review ${vendor.name}`}>
            Review
          </Button>
        </div>
      </div>
    </article>
  );
}

/** One open flag as a single clickable line: severity icon (and the word, for screen readers) plus title. */
function IssueLine({ flag, onOpen }: { flag: Flag; onOpen: () => void }) {
  const Icon = SEVERITY_ICONS[flag.severity];
  const severityLabel = SEVERITY_LABELS[flag.severity];
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        title={`${severityLabel}: ${flag.title}`}
        className={clsx(
          'flex w-full min-w-0 items-center gap-1.5 rounded px-1.5 py-1 text-left text-[12px] text-zinc-700',
          'hover:bg-zinc-50 hover:text-zinc-900',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600',
        )}
      >
        <Icon aria-hidden className={clsx('size-3.5 shrink-0', SEVERITY_TEXT[flag.severity])} />
        <span className="sr-only">{severityLabel}: </span>
        <span className="truncate">{flag.title}</span>
      </button>
    </li>
  );
}

/** Every open blocker across vendors; clicking a row opens that vendor with the flag selected. */
function BlockerTable({ rows, onOpen }: { rows: BlockerRow[]; onOpen: OpenVendorReview }) {
  return (
    <div className="max-h-[480px] overflow-auto">
      <table className="w-full table-fixed border-separate border-spacing-0 text-[13px]">
        <colgroup>
          <col className="w-28" />
          <col className="w-28" />
          <col className="w-[30%]" />
          <col />
          <col className="w-44" />
        </colgroup>
        <thead>
          <tr>
            {BLOCKER_COLUMNS.map((label) => (
              <th key={label} scope="col" className={HEADER_CELL}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ review, flag }, index) => {
            const cell = clsx('px-3 py-2 align-middle', index < rows.length - 1 && 'border-b border-zinc-100');
            return (
              <tr
                key={flag.id}
                onClick={() => onOpen(review.vendor.id, flag)}
                className="cursor-pointer hover:bg-zinc-50"
              >
                <td className={clsx(cell, 'truncate font-medium text-zinc-900')} title={review.vendor.name}>
                  {shortVendorName(review.vendor.name)}
                </td>
                <td className={cell}><SeverityBadge severity={flag.severity} /></td>
                <td className={clsx(cell, 'truncate')}>
                  {/* The row handles the click; this button gives keyboard users a focus target (Enter bubbles up). */}
                  <button
                    type="button"
                    title={flag.title}
                    className="block w-full truncate rounded-sm text-left font-medium text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  >
                    {flag.title}
                  </button>
                </td>
                <td className={clsx(cell, 'truncate text-zinc-500')} title={flag.detail}>{flag.detail}</td>
                <td className={clsx(cell, 'truncate')}>
                  <ItemReference review={review} flag={flag} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** "#3 MS21042L3": the RFQ item number and the quoted (or requested) PN; "General" for vendor-level flags. */
function ItemReference({ review, flag }: { review: VendorReview; flag: Flag }) {
  const product = flag.productId
    ? review.products.find((candidate) => candidate.product.id === flag.productId)
    : undefined;
  const rfqNo = flag.rfqNo ?? product?.rfqNo;
  const partNumber = product?.product.partNumber
    ?? review.rfq.items.find((item) => item.no === rfqNo)?.partNumber;
  if (rfqNo === undefined && !partNumber) return <span className="text-zinc-400">General</span>;
  return (
    <>
      {rfqNo !== undefined && <span className="tabular-nums text-zinc-500">#{rfqNo}</span>}
      {rfqNo !== undefined && partNumber && ' '}
      {partNumber && <Mono className="text-zinc-800">{partNumber}</Mono>}
    </>
  );
}
