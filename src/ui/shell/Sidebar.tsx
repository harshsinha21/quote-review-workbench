// Left navigation (232px). Its items change with the role: Ops gets vendors with status and counts.
// Reads the store and the derived model; computes nothing itself.

import clsx from 'clsx';
import {
  FileText, Inbox, LayoutDashboard, Mail, OctagonX, Scale, Send, TriangleAlert, type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { VendorReview } from '../../domain/types';
import { type View, useReview, useReviewModel } from '../../store/useReview';
import { shortVendorName } from '../shared/format';
import { Badge } from '../shared/primitives';
import type { Tone } from '../shared/tones';

/** Status pill wording and tone per vendor review status. */
const STATUS_PILLS: Record<VendorReview['status'], { label: string; tone: Tone }> = {
  'needs-review': { label: 'Needs review', tone: 'warning' },
  ready: { label: 'Ready', tone: 'accent' },
  submitted: { label: 'Verified', tone: 'verified' },
};

/** One clickable nav row. */
function NavItem({ icon: Icon, label, isActive, onClick, children }: {
  icon: LucideIcon; label: string; isActive: boolean; onClick: () => void; children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      className={clsx(
        'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
        isActive ? 'bg-white font-medium text-zinc-900 shadow-sm ring-1 ring-zinc-200' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900',
      )}
    >
      <Icon aria-hidden className={clsx('mt-0.5 size-4 shrink-0', isActive ? 'text-blue-700' : 'text-zinc-400')} />
      <span className="min-w-0 flex-1">{label}{children}</span>
    </button>
  );
}

/** Small group heading inside the nav. */
function NavHeading({ children }: { children: ReactNode }) {
  return <p className="px-2 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wide text-zinc-400">{children}</p>;
}

/** Status pill plus open blocker and warning counts for one vendor. */
function VendorNavMeta({ review }: { review: VendorReview }) {
  const pill = STATUS_PILLS[review.status];
  return (
    <span className="mt-1 flex items-center gap-2 text-[11px] font-normal text-zinc-500">
      <Badge tone={pill.tone}>{pill.label}</Badge>
      <span className="inline-flex items-center gap-0.5 tabular-nums text-red-600" aria-label={`${review.counts.blocker} open blockers`}>
        <OctagonX aria-hidden className="size-3" />{review.counts.blocker}
      </span>
      <span className="inline-flex items-center gap-0.5 tabular-nums text-amber-600" aria-label={`${review.counts.warning} open warnings`}>
        <TriangleAlert aria-hidden className="size-3" />{review.counts.warning}
      </span>
    </span>
  );
}

/** The left navigation for the active role. */
export function Sidebar() {
  const model = useReviewModel();
  const role = useReview((state) => state.role);
  const view = useReview((state) => state.view);
  const vendorId = useReview((state) => state.vendorId);
  const setView = useReview((state) => state.setView);
  const openVendorReview = useReview((state) => state.openVendorReview);
  const go = (target: View) => () => setView(target);

  return (
    <nav aria-label="Main" className="flex w-[232px] shrink-0 flex-col overflow-y-auto border-r border-zinc-200 bg-zinc-50 px-3 py-3">
      {role === 'ops' && (
        <>
          <NavItem icon={LayoutDashboard} label="Overview" isActive={view === 'overview'} onClick={go('overview')} />
          <NavHeading>Vendors</NavHeading>
          {model.vendors.map((review) => (
            <NavItem
              key={review.vendor.id}
              icon={Inbox}
              label={shortVendorName(review.vendor.name)}
              isActive={view === 'vendor-review' && vendorId === review.vendor.id}
              onClick={() => openVendorReview(review.vendor.id)}
            >
              <VendorNavMeta review={review} />
            </NavItem>
          ))}
          <NavHeading>Act</NavHeading>
          <NavItem icon={Send} label="Follow-ups" isActive={view === 'follow-ups'} onClick={go('follow-ups')} />
          <NavItem icon={Scale} label="Compare & PO" isActive={view === 'compare'} onClick={go('compare')} />
        </>
      )}
      {role === 'customer' && (
        <>
          <NavItem icon={LayoutDashboard} label="Summary" isActive={view === 'summary'} onClick={go('summary')} />
          <NavItem icon={Mail} label="Correspondence" isActive={view === 'correspondence'} onClick={go('correspondence')} />
        </>
      )}
      {role === 'vendor' && (
        <>
          <NavItem icon={FileText} label="Your quote request" isActive={view === 'portal'} onClick={go('portal')} />
          <p className="px-2 pt-3 text-[12px] leading-5 text-zinc-500">
            Portal preview. The vendor sees only their own request and reply.
          </p>
        </>
      )}
    </nav>
  );
}
