// Ops triage: one sentence on where the review stands, the one next step, the three vendors, and every open
// blocker grouped by vendor. Reads the store and the model; computes no rules.

import { CalendarX, Check, ChevronRight, OctagonX, ShieldCheck } from 'lucide-react';
import type { Flag, VendorReview } from '../../domain/types';
import { useReview, useReviewModel } from '../../store/useReview';
import { formatDate, formatShortDate, pluralize, shortVendorName } from '../shared/format';
import { IssueComparison } from '../shared/IssueComparison';
import { Banner, Button, EmptyState, ItemLabel, PageHeader, ProgressBar, SectionHeader, SeverityIcon, StatusText } from '../shared/primitives';
import { FOCUS_RING, PAGE, SURFACE, TABLE } from '../shared/styles';
import { orderIssues } from './issueOrder';

/** Where a vendor stands, in a few words: blockers to fix, ready to verify, or verified. */
function VendorState({ review }: { review: VendorReview }) {
  if (review.status === 'submitted') {
    return <StatusText tone="verified" icon={ShieldCheck}>Verified</StatusText>;
  }
  if (review.counts.blocker > 0) {
    return <StatusText tone="blocker" icon={OctagonX}>{pluralize(review.counts.blocker, 'blocker')} to fix</StatusText>;
  }
  return <StatusText tone="accent" icon={Check}>Ready to verify</StatusText>;
}

/** "10 blockers across 3 vendors · none verified yet", or what is left once blockers are gone. */
function statusSentence(vendors: VendorReview[]): string {
  const blockerCount = vendors.reduce((total, review) => total + review.counts.blocker, 0);
  const verifiedCount = vendors.filter((review) => review.status === 'submitted').length;
  if (blockerCount > 0) {
    const blockedVendors = vendors.filter((review) => review.counts.blocker > 0).length;
    return `${pluralize(blockerCount, 'blocker')} across ${pluralize(blockedVendors, 'vendor')} · ${verifiedCount === 0 ? 'none verified yet' : `${verifiedCount} verified`}`;
  }
  if (verifiedCount < vendors.length) return `No blockers left · ${pluralize(vendors.length - verifiedCount, 'vendor')} ready to mark verified`;
  return `All ${vendors.length} vendors verified · ready to award`;
}

/** Where an issue applies: the RFQ item, a part that is not on the RFQ, or the whole quote. */
function IssueScope({ flag, review }: { flag: Flag; review: VendorReview }) {
  const product = review.products.find((productReview) => productReview.product.id === flag.productId);
  if (flag.rfqNo !== undefined) {
    const partNumber = product?.product.partNumber ?? review.rfq.items.find((item) => item.no === flag.rfqNo)?.partNumber ?? '';
    return <ItemLabel rfqNo={flag.rfqNo} partNumber={partNumber} />;
  }
  if (product) return <span className="text-[12px] text-zinc-500">Not in RFQ · <span className="font-mono">{product.product.partNumber}</span></span>;
  return <span className="text-[12px] text-zinc-500">Whole quote</span>;
}

/** The Ops overview screen. */
export function OpsOverview() {
  const { vendors } = useReviewModel();
  const asOf = useReview((state) => state.overlay.settings.asOf);
  const setView = useReview((state) => state.setView);
  const openVendorReview = useReview((state) => state.openVendorReview);
  const blocked = vendors.filter((review) => review.counts.blocker > 0);
  const ready = vendors.find((review) => review.status === 'ready');
  const expired = vendors.filter((review) => review.expired && review.validUntil).map((review) => review.validUntil ?? '').sort();

  const nextAction = blocked[0]
    ? <Button size="md" variant="primary" onClick={() => openVendorReview(blocked[0].vendor.id, orderIssues(blocked[0].open)[0])}>Review next blocker</Button>
    : ready
      ? <Button size="md" variant="primary" onClick={() => openVendorReview(ready.vendor.id)}>Verify {shortVendorName(ready.vendor.name)}</Button>
      : <Button size="md" variant="primary" onClick={() => setView('compare')}>Compare &amp; award</Button>;

  return (
    <div className={PAGE}>
      <PageHeader title="Overview" description={statusSentence(vendors)} actions={nextAction} />

      {expired.length >= 2 && (
        <Banner
          className="mb-6"
          icon={CalendarX}
          title={`${expired.length === vendors.length ? `All ${expired.length}` : `${expired.length} of ${vendors.length}`} quotes have expired (${formatShortDate(expired[0])} to ${formatDate(expired[expired.length - 1])}) as of ${formatDate(asOf)}.`}
        >
          Each follow-up asks the vendor to reconfirm pricing.
        </Banner>
      )}

      <section aria-label="Vendors" className={SURFACE}>
        <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_16px] gap-4 border-b border-zinc-200 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          <span>Vendor</span><span>Breaks quoted</span><span>Status</span><span />
        </div>
        <ul className="divide-y divide-zinc-100">
          {vendors.map((review) => (
            <li key={review.vendor.id}>
              <button
                type="button"
                onClick={() => openVendorReview(review.vendor.id)}
                className="grid w-full grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_16px] items-center gap-4 px-4 py-3 text-left hover:bg-zinc-50"
              >
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-zinc-900">{review.vendor.name}</span>
                  <span className="block text-[12px] text-zinc-500">Replied {formatShortDate(review.respondedAt)} · {review.sourceLabel}</span>
                </span>
                <span className="flex items-center gap-3">
                  <ProgressBar className="w-24" value={review.coverage.breaksQuoted} total={review.coverage.breaks} label="Breaks quoted" />
                  <span className="text-[12px] tabular-nums text-zinc-600">{review.coverage.breaksQuoted}/{review.coverage.breaks}</span>
                </span>
                <VendorState review={review} />
                <ChevronRight aria-hidden className="size-4 text-zinc-400" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Open blockers" className="mt-8">
        <SectionHeader className="mb-3" title="Open blockers" description="Each one blocks marking its vendor verified. Select one to open it next to the vendor's quote." />
        {blocked.length === 0 ? (
          <div className={SURFACE}><EmptyState icon={Check} tone="verified">No open blockers. Every reply is ready to mark verified.</EmptyState></div>
        ) : (
          <div className={`${SURFACE} overflow-hidden`}>
            <table className={TABLE.table}>
              {blocked.map((review) => (
                <tbody key={review.vendor.id}>
                  <tr className={TABLE.groupRow}>
                    <th scope="rowgroup" colSpan={3} className="px-4 py-2 text-left font-medium">
                      {review.vendor.name} <span className="font-normal tabular-nums text-zinc-400">{review.counts.blocker}</span>
                    </th>
                  </tr>
                  {orderIssues(review.open).filter((flag) => flag.severity === 'blocker').map((flag) => {
                    const open = () => openVendorReview(review.vendor.id, flag);
                    return (
                      <tr
                        key={flag.id}
                        tabIndex={0}
                        onClick={open}
                        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } }}
                        className={`${TABLE.rowInteractive} ${FOCUS_RING}`}
                      >
                        <td className="px-4 py-2.5">
                          <span className="flex items-center gap-2 text-[13px] font-medium text-zinc-900"><SeverityIcon severity={flag.severity} />{flag.title}</span>
                          <IssueComparison flag={flag} review={review} compact className="mt-1 pl-[22px]" />
                        </td>
                        <td className="px-4 py-2.5"><IssueScope flag={flag} review={review} /></td>
                        <td className="w-10 px-4 py-2.5"><ChevronRight aria-hidden className="size-4 text-zinc-400" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
