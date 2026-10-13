// Ops navigation (220px), shaped as the order of the work: verify each reply, follow up, compare and award.
// Each step shows the one number that says how much is left. Reads the store and the model; computes nothing.

import clsx from 'clsx';
import { OctagonX, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import type { VendorReview } from '../../domain/types';
import { useReview, useReviewModel } from '../../store/useReview';
import { shortVendorName } from '../shared/format';
import { openAsks } from '../shared/reviewLookups';
import { SELECTED_ROW } from '../shared/styles';

/** One clickable nav row: label on the left, a quiet status on the right. */
function NavRow({ label, status, isActive, onClick, className }: {
  label: ReactNode; status?: ReactNode; isActive: boolean; onClick: () => void; className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      className={clsx(
        'flex h-8 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-[13px]',
        isActive ? clsx(SELECTED_ROW, 'font-medium text-zinc-900') : 'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900',
        className,
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      {status}
    </button>
  );
}

/** A step number in front of a label ("2  Follow up"). */
function Step({ number, children }: { number: number; children: ReactNode }) {
  return <span><span className="mr-2 tabular-nums text-zinc-400">{number}</span>{children}</span>;
}

/** The one signal per vendor: open blockers, "Ready", or verified. */
function VendorStatus({ review }: { review: VendorReview }) {
  if (review.status === 'submitted') {
    return <span title="Verified"><ShieldCheck aria-label="Verified" className="size-3.5 text-emerald-600" /></span>;
  }
  if (review.counts.blocker > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-medium tabular-nums text-red-700" aria-label={`${review.counts.blocker} open blockers`}>
        <OctagonX aria-hidden className="size-3" />{review.counts.blocker}
      </span>
    );
  }
  return <span className="text-[12px] text-blue-700">Ready</span>;
}

/** The Ops navigation. */
export function Sidebar() {
  const model = useReviewModel();
  const view = useReview((state) => state.view);
  const vendorId = useReview((state) => state.vendorId);
  const setView = useReview((state) => state.setView);
  const openVendorReview = useReview((state) => state.openVendorReview);
  const openAskCount = model.vendors.reduce((total, review) => total + openAsks(review).length, 0);
  const sourcedCount = model.compare.filter((row) => row.bestVendorId).length;
  const quiet = (text: string) => <span className="text-[12px] tabular-nums text-zinc-400">{text}</span>;

  return (
    <nav aria-label="Main" className="w-[220px] shrink-0 overflow-y-auto border-r border-zinc-200 bg-zinc-50 px-3 py-4">
      <NavRow label="Overview" isActive={view === 'overview'} onClick={() => setView('overview')} />
      <p className="mt-4 px-2 pb-1 text-[13px] text-zinc-700"><Step number={1}>Verify replies</Step></p>
      {model.vendors.map((review) => (
        <NavRow
          key={review.vendor.id}
          className="pl-[26px]"
          label={shortVendorName(review.vendor.name)}
          status={<VendorStatus review={review} />}
          isActive={view === 'vendor-review' && vendorId === review.vendor.id}
          onClick={() => openVendorReview(review.vendor.id)}
        />
      ))}
      <NavRow className="mt-1" label={<Step number={2}>Follow up</Step>} status={quiet(String(openAskCount))} isActive={view === 'follow-ups'} onClick={() => setView('follow-ups')} />
      <NavRow label={<Step number={3}>Compare &amp; award</Step>} status={quiet(`${sourcedCount}/${model.compare.length}`)} isActive={view === 'compare'} onClick={() => setView('compare')} />
    </nav>
  );
}
