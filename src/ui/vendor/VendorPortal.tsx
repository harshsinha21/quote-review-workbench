// Vendor portal: a read-only, polite page showing one vendor what we still need and their quote
// against our request. Shows only that vendor's own data: never other vendors, internal flags,
// variance, decisions or reviewer notes. Vendor text renders only as React text nodes.

import { CircleDashed, FileText } from 'lucide-react';
import type { FollowUpAsk, VendorReview } from '../../domain/types';
import { useReview, useReviewModel } from '../../store/useReview';
import { formatShortDate } from '../shared/format';
import { EmptyState, Mono, SectionHeader } from '../shared/primitives';
import { QuoteTable } from '../shared/QuoteTable';

/** The customer that sent the RFQ, as the vendor knows it. */
const CUSTOMER_NAME = 'Argus Defense';
/** Joins an ask's item label and part number ("Item 3 · MS21042L3") and the header's date segments. */
const SEPARATOR = ' · ';

/** Splits "Item 3 · MS21042L3" so the part number can be set in monospace; "General" has none. */
function splitSection(section: string): { label: string; partNumber?: string } {
  const separatorIndex = section.indexOf(SEPARATOR);
  if (separatorIndex < 0) return { label: section };
  return {
    label: section.slice(0, separatorIndex),
    partNumber: section.slice(separatorIndex + SEPARATOR.length),
  };
}

/** The document header: who asked, when, and who the request was sent to. */
function RequestHeader({ review }: { review: VendorReview }) {
  const { vendor, rfq } = review;
  const timeline = [
    `RFQ from ${CUSTOMER_NAME}`,
    rfq.sentAt ? `sent ${formatShortDate(rfq.sentAt)}` : undefined,
    rfq.dueDate ? `due ${formatShortDate(rfq.dueDate)}` : undefined,
    review.respondedAt ? `your reply received ${formatShortDate(review.respondedAt)}` : undefined,
  ].filter((segment): segment is string => segment !== undefined).join(SEPARATOR);
  const contact = [vendor.contactName, vendor.contactEmail].filter((part) => part.length > 0).join(SEPARATOR);

  return (
    <header className="rounded-md border border-zinc-200 bg-white px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-[18px] font-semibold leading-7 text-zinc-900">
            Quote request from {CUSTOMER_NAME}
          </h1>
          <p className="mt-1 text-[13px] text-zinc-600">{timeline}</p>
        </div>
        <div className="min-w-0 text-[13px] sm:text-right">
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Sent to</p>
          <p className="mt-1 font-medium text-zinc-900">{vendor.name}</p>
          {contact && <p className="text-zinc-600">{contact}</p>}
          {vendor.cage && (
            <p className="mt-0.5 text-[12px] text-zinc-500">
              CAGE <Mono className="text-zinc-700">{vendor.cage}</Mono>
            </p>
          )}
        </div>
      </div>
    </header>
  );
}

/** The vendor-facing asks still open, as a read-only checklist (nothing here is clickable). */
function StillNeededList({ asks }: { asks: FollowUpAsk[] }) {
  if (asks.length === 0) {
    return (
      <div className="mt-3 rounded-md border border-zinc-200 bg-white">
        <EmptyState>Nothing outstanding. Thank you.</EmptyState>
      </div>
    );
  }
  return (
    <ul className="mt-3 divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white">
      {asks.map((ask, index) => {
        const { label, partNumber } = splitSection(ask.section);
        return (
          <li key={`${index}:${ask.section}`} className="flex items-start gap-3 px-4 py-3">
            <CircleDashed aria-hidden className="mt-0.5 size-4 shrink-0 text-zinc-400" />
            <div className="min-w-0">
              <p className="text-[12px] text-zinc-500">
                {label}
                {partNumber && (
                  <>
                    {SEPARATOR}
                    <Mono className="text-zinc-700">{partNumber}</Mono>
                  </>
                )}
              </p>
              <p className="mt-0.5 text-[13px] leading-5 text-zinc-900">{ask.text}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** The vendor's read-only page: what we still need from them, then their quote against our request. */
export function VendorPortal() {
  const vendorId = useReview((state) => state.vendorId);
  const model = useReviewModel();
  const review: VendorReview | undefined =
    model.vendors.find((candidate) => candidate.vendor.id === vendorId) ?? model.vendors[0];

  if (!review) {
    return (
      <div className="mx-auto max-w-[960px] p-8">
        <div className="flex flex-col items-center gap-2 rounded-md border border-zinc-200 bg-white px-4 py-10 text-center text-[13px] text-zinc-500">
          <FileText aria-hidden className="size-5 text-zinc-400" />
          <p>No quote request to show yet.</p>
        </div>
      </div>
    );
  }

  const openAsks = (review.followUp.asks ?? []).filter((ask) => !ask.excluded);

  return (
    <div className="mx-auto max-w-[960px] space-y-8 p-8">
      <RequestHeader review={review} />

      <section>
        <SectionHeader title="What we still need">
          {openAsks.length > 0 && (
            <span className="text-[12px] tabular-nums text-zinc-500">
              {openAsks.length} {openAsks.length === 1 ? 'item' : 'items'}
            </span>
          )}
        </SectionHeader>
        {openAsks.length > 0 && (
          <p className="mt-1 text-[13px] text-zinc-600">Please reply to our RFQ email with the details below.</p>
        )}
        <StillNeededList asks={openAsks} />
      </section>

      <section>
        <SectionHeader title="Your quote vs. our request" />
        <p className="mt-1 text-[13px] text-zinc-600">Each part and quantity we asked for, next to what you quoted.</p>
        <div className="mt-3 overflow-x-auto rounded-md border border-zinc-200 bg-white">
          <QuoteTable review={review} audience="vendor" />
        </div>
      </section>
    </div>
  );
}
