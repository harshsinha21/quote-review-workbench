// Ops "Compare & PO" screen: the item-by-vendor price matrix, then the draft purchase orders.
// Reads the store and useReviewModel only; it must not recompute eligibility, best vendors or totals,
// and it renders vendor text only as React text nodes.

import clsx from 'clsx';
import { CircleCheck, FileText, OctagonX } from 'lucide-react';
import type { CompareCell, CompareRow, PoDraft, PoPlan, RfqItem } from '../../domain/types';
import { useReview, useReviewModel } from '../../store/useReview';
import { formatMoney, shortVendorName } from '../shared/format';
import { Badge, Banner, EmptyState, Mono, Money, SectionHeader, TrustChip } from '../shared/primitives';
import type { Tone } from '../shared/tones';

/** Padding and row rule shared by every matrix body cell. */
const CELL_CLASSES = 'border-b border-zinc-100 px-3 py-2';
/** Sticky column header style for the compare matrix. */
const MATRIX_HEADER_CLASSES =
  'sticky top-0 z-10 border-b border-zinc-200 bg-white px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500';
/** Column header style for the small PO line tables. */
const PO_HEADER_CLASSES = 'border-b border-zinc-200 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500';
/** Padding and row rule shared by every PO line cell. */
const PO_CELL_CLASSES = 'border-b border-zinc-100 px-3 py-1.5';
/** Badge colors for the engine's cell badges; anything unknown stays neutral. */
const BADGE_TONES: Partial<Record<string, Tone>> = { ALT: 'info', EUR: 'neutral', 'non-US COO': 'warning' };
/** Shown on a row, and on an unsourced item, that no vendor can supply yet. */
const NO_SOURCE_MESSAGE = 'No verified, compliant exact-PN source. Follow up.';

/** A vendor column: id for lookups, full name for tooltips and draft titles. */
interface VendorColumn { id: string; name: string }
/** The compare rows of one RFQ item, in the engine's order. */
interface ItemGroup { rfqNo: number; partNumber: string; rows: CompareRow[] }
/** Resolves a vendor id to its full name, falling back to the id when the vendor is missing. */
type VendorNameLookup = (vendorId: string) => string;

/** Groups the compare rows by RFQ item, keeping first-seen order. */
function groupRowsByItem(rows: CompareRow[]): ItemGroup[] {
  const groups = new Map<number, ItemGroup>();
  for (const row of rows) {
    const group = groups.get(row.rfqNo);
    if (group) group.rows.push(row);
    else groups.set(row.rfqNo, { rfqNo: row.rfqNo, partNumber: row.partNumber, rows: [row] });
  }
  return [...groups.values()];
}

/** "14d", or "n/a" when the lead time is unknown. */
function formatLead(leadTime: number | null): string {
  return leadTime === null ? 'n/a' : `${leadTime}d`;
}

/** "$250" for whole dollars, else "$249.50"; used in the minimum-order warning. */
function formatMinimum(amountUsd: number): string {
  return Number.isInteger(amountUsd) ? `$${amountUsd.toLocaleString('en-US')}` : formatMoney(amountUsd);
}

/** The lowest requested quantity (the PO default); undefined when the item lists none. */
function lowestQty(qtys: number[]): number | undefined {
  return qtys.length > 0 ? Math.min(...qtys) : undefined;
}

/** Ops screen: the compare matrix (one row per item and qty, one column per vendor) and the PO drafts. */
export function CompareAndPo() {
  const model = useReviewModel();
  const poQuantity = useReview((state) => state.overlay.poQuantity);
  const setPoQuantity = useReview((state) => state.setPoQuantity);

  const vendors: VendorColumn[] = model.vendors.map((review) => ({ id: review.vendor.id, name: review.vendor.name }));
  const vendorNameById = new Map(vendors.map((vendor): [string, string] => [vendor.id, vendor.name]));
  const vendorName: VendorNameLookup = (vendorId) => vendorNameById.get(vendorId) ?? vendorId;

  return (
    <div className="space-y-8 p-6 text-[13px] text-zinc-800">
      <header>
        <h1 className="text-[15px] font-semibold text-zinc-900">Compare &amp; PO</h1>
        <p className="mt-0.5 text-[12px] text-zinc-500">
          Every requested item and quantity across vendors. The cheapest verified, compliant exact-PN offer is recommended.
        </p>
      </header>
      <CompareSection rows={model.compare} vendors={vendors} vendorName={vendorName} />
      <PoSection
        items={model.rfq.items}
        plan={model.po}
        chosenQty={poQuantity}
        onChooseQty={setPoQuantity}
        vendorName={vendorName}
      />
    </div>
  );
}

/** The compare matrix: grouped by item, best cell tinted emerald, rows with no eligible cell tinted red. */
function CompareSection({ rows, vendors, vendorName }: {
  rows: CompareRow[]; vendors: VendorColumn[]; vendorName: VendorNameLookup;
}) {
  const groups = groupRowsByItem(rows);
  const sourcedCount = rows.filter((row) => row.bestVendorId !== undefined).length;
  const columnCount = vendors.length + 3;

  return (
    <section aria-label="Compare" className="space-y-2">
      <SectionHeader title="Compare">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm bg-emerald-100 ring-1 ring-emerald-300" />
            Best eligible price
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm bg-red-100 ring-1 ring-red-200" />
            No compliant source
          </span>
          <span className="tabular-nums">{sourcedCount}/{rows.length} rows sourced</span>
        </div>
      </SectionHeader>
      <div className="max-h-[70vh] overflow-auto rounded-md border border-zinc-200 bg-white">
        {rows.length === 0 ? (
          <EmptyState icon={FileText}>No quotes to compare yet.</EmptyState>
        ) : (
          <table className="w-full border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr>
                <th scope="col" className={clsx(MATRIX_HEADER_CLASSES, 'w-14 text-left')}>Item</th>
                <th scope="col" className={clsx(MATRIX_HEADER_CLASSES, 'w-16 text-right')}>Qty</th>
                {vendors.map((vendor) => (
                  <th key={vendor.id} scope="col" title={vendor.name} className={clsx(MATRIX_HEADER_CLASSES, 'min-w-[11rem] text-right')}>
                    {shortVendorName(vendor.name)}
                  </th>
                ))}
                <th scope="col" className={clsx(MATRIX_HEADER_CLASSES, 'min-w-[13rem] text-left')}>Recommendation</th>
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.rfqNo}>
                <tr>
                  <th
                    scope="rowgroup"
                    colSpan={columnCount}
                    className="border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 text-left font-normal"
                  >
                    <span className="inline-flex items-baseline gap-2">
                      <span className="text-[11px] font-medium tabular-nums text-zinc-500">#{group.rfqNo}</span>
                      <Mono className="font-medium text-zinc-900">{group.partNumber}</Mono>
                      <span className="text-[11px] text-zinc-500">
                        {group.rows.length} qty {group.rows.length === 1 ? 'break' : 'breaks'}
                      </span>
                    </span>
                  </th>
                </tr>
                {group.rows.map((row) => (
                  <CompareTableRow key={`${row.rfqNo}:${row.qty}`} row={row} vendors={vendors} vendorName={vendorName} />
                ))}
              </tbody>
            ))}
          </table>
        )}
      </div>
    </section>
  );
}

/** One item and qty across vendors plus the recommendation; tinted red when no cell is eligible. */
function CompareTableRow({ row, vendors, vendorName }: {
  row: CompareRow; vendors: VendorColumn[]; vendorName: VendorNameLookup;
}) {
  const bestVendorId = row.bestVendorId;
  const bestUsd = bestVendorId === undefined ? null : (row.cells[bestVendorId]?.usd ?? null);

  return (
    <tr className={bestVendorId === undefined ? 'bg-red-50/60' : 'hover:bg-zinc-50'}>
      <td className={clsx(CELL_CLASSES, 'align-top')}>
        <span className="sr-only">Item {row.rfqNo}, {row.partNumber}</span>
      </td>
      <th scope="row" className={clsx(CELL_CLASSES, 'text-right align-top font-medium tabular-nums text-zinc-900')}>
        {row.qty}
      </th>
      {vendors.map((vendor) => (
        <VendorCell key={vendor.id} cell={row.cells[vendor.id]} isBest={bestVendorId === vendor.id} />
      ))}
      <td className={clsx(CELL_CLASSES, 'align-top')}>
        {bestVendorId === undefined ? (
          <p className="flex items-start gap-1.5 text-[12px] font-medium text-red-700">
            <OctagonX aria-hidden className="mt-0.5 size-3.5 shrink-0 text-red-600" />
            {NO_SOURCE_MESSAGE}
          </p>
        ) : (
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium text-zinc-900" title={vendorName(bestVendorId)}>
              {shortVendorName(vendorName(bestVendorId))}
            </span>
            <span className="tabular-nums text-zinc-900">{bestUsd === null ? 'n/a' : formatMoney(bestUsd)}</span>
          </div>
        )}
      </td>
    </tr>
  );
}

/** One vendor's offer for a row: price in its own currency, lead days, badges and trust; "n/a" when absent. */
function VendorCell({ cell, isBest }: { cell: CompareCell | undefined; isBest: boolean }) {
  if (cell === undefined) {
    return <td className={clsx(CELL_CLASSES, 'text-right align-top text-zinc-400')}>n/a</td>;
  }
  return (
    <td className={clsx(CELL_CLASSES, 'text-right align-top', isBest && 'bg-emerald-50 ring-1 ring-inset ring-emerald-300')}>
      <div className="flex items-baseline justify-end gap-2">
        {isBest && (
          <span className="inline-flex items-center gap-1 self-center text-[11px] font-medium text-emerald-700">
            <CircleCheck aria-hidden className="size-3.5" />
            Best
          </span>
        )}
        <Money
          amount={cell.unitCost}
          currency={cell.currency}
          approxUsd={cell.currency === 'EUR' ? cell.usd : undefined}
          className="font-medium text-zinc-900"
        />
        <span className="text-[12px] tabular-nums text-zinc-500" title="Lead time in days">{formatLead(cell.leadTime)}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-end gap-1">
        {cell.badges.map((badge) => (
          <Badge key={badge} tone={BADGE_TONES[badge] ?? 'neutral'}>{badge}</Badge>
        ))}
        <TrustChip trust={cell.trust} />
      </div>
    </td>
  );
}

/** PO drafts: the order quantity per item, one draft per winning vendor, then items nobody can supply. */
function PoSection({ items, plan, chosenQty, onChooseQty, vendorName }: {
  items: RfqItem[]; plan: PoPlan; chosenQty: Record<number, number>;
  onChooseQty: (rfqNo: number, qty: number) => void; vendorName: VendorNameLookup;
}) {
  return (
    <section aria-label="PO drafts" className="space-y-3">
      <SectionHeader title="PO drafts">
        <span className="text-[12px] tabular-nums text-zinc-500">
          {plan.drafts.length} {plan.drafts.length === 1 ? 'draft' : 'drafts'} · {plan.unsourced.length} unsourced
        </span>
      </SectionHeader>
      <OrderQuantities items={items} chosenQty={chosenQty} onChooseQty={onChooseQty} />
      {plan.drafts.length === 0 ? (
        <div className="rounded-md border border-zinc-200 bg-white">
          <EmptyState icon={FileText}>No drafts yet. A draft appears once a vendor wins an item.</EmptyState>
        </div>
      ) : (
        <div className="grid items-start gap-3 xl:grid-cols-2">
          {plan.drafts.map((draft) => (
            <PoDraftCard key={draft.vendorId} draft={draft} vendorName={vendorName(draft.vendorId)} />
          ))}
        </div>
      )}
      <UnsourcedList items={plan.unsourced} />
    </section>
  );
}

/** One quantity picker per RFQ item; the choice goes to the store and the engine rebuilds the drafts. */
function OrderQuantities({ items, chosenQty, onChooseQty }: {
  items: RfqItem[]; chosenQty: Record<number, number>; onChooseQty: (rfqNo: number, qty: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Order quantity per item</p>
      <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-x-6 gap-y-2">
        {items.map((item) => {
          const selectId = `po-qty-${item.no}`;
          const selectedQty = chosenQty[item.no] ?? lowestQty(item.qtys);
          return (
            <div key={item.no} className="flex items-center justify-between gap-2">
              <label htmlFor={selectId} className="flex min-w-0 items-baseline gap-1.5">
                <span className="text-[11px] tabular-nums text-zinc-500">#{item.no}</span>
                <Mono className="truncate text-zinc-900">{item.partNumber}</Mono>
              </label>
              <select
                id={selectId}
                value={selectedQty ?? ''}
                disabled={item.qtys.length === 0}
                onChange={(event) => onChooseQty(item.no, Number(event.target.value))}
                className="h-7 shrink-0 rounded-md border border-zinc-300 bg-white px-2 text-[12px] tabular-nums text-zinc-900 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 disabled:opacity-50"
              >
                {item.qtys.map((qty) => (
                  <option key={qty} value={qty}>{qty}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** One vendor's draft PO: lines, totals with one-time charges, and the minimum-order warning. */
function PoDraftCard({ draft, vendorName }: { draft: PoDraft; vendorName: string }) {
  const isUsd = draft.currency === 'USD';
  const minimumLabel = draft.minimumOrderUsd === undefined ? "the vendor's" : formatMinimum(draft.minimumOrderUsd);

  return (
    <article aria-label={`PO draft, ${vendorName}`} className="flex flex-col rounded-md border border-zinc-200 bg-white">
      <header className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-semibold text-zinc-900">{vendorName}</h3>
          <p className="mt-0.5 text-[12px] text-zinc-500">
            Payment terms{' '}
            <span className={draft.paymentTerms ? 'text-zinc-800' : 'text-zinc-400'}>{draft.paymentTerms || 'not stated'}</span>
          </p>
        </div>
        <Badge>{draft.currency}</Badge>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              <th scope="col" className={clsx(PO_HEADER_CLASSES, 'text-left')}>Item</th>
              <th scope="col" className={clsx(PO_HEADER_CLASSES, 'text-left')}>PN</th>
              <th scope="col" className={clsx(PO_HEADER_CLASSES, 'text-right')}>Qty</th>
              <th scope="col" className={clsx(PO_HEADER_CLASSES, 'text-right')}>Unit</th>
              <th scope="col" className={clsx(PO_HEADER_CLASSES, 'text-right')}>Extended</th>
              <th scope="col" className={clsx(PO_HEADER_CLASSES, 'text-right')}>Lead</th>
            </tr>
          </thead>
          <tbody>
            {draft.lines.map((line) => (
              <tr key={line.lineId} className="hover:bg-zinc-50">
                <td className={clsx(PO_CELL_CLASSES, 'tabular-nums text-zinc-500')}>#{line.rfqNo}</td>
                <td className={PO_CELL_CLASSES}><Mono className="text-zinc-900">{line.partNumber}</Mono></td>
                <td className={clsx(PO_CELL_CLASSES, 'text-right tabular-nums')}>{line.qty}</td>
                <td className={clsx(PO_CELL_CLASSES, 'text-right tabular-nums')}>{formatMoney(line.unitCost, line.currency)}</td>
                <td className={clsx(PO_CELL_CLASSES, 'text-right font-medium tabular-nums text-zinc-900')}>
                  {formatMoney(line.extended, line.currency)}
                </td>
                <td className={clsx(PO_CELL_CLASSES, 'text-right tabular-nums text-zinc-500')}>{formatLead(line.leadTime)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="w-full max-w-xs space-y-1 self-end px-4 py-3">
        <TotalRow label="Parts total" value={formatMoney(draft.partsTotal, draft.currency)} />
        {draft.oneTimeCharges.map((charge, index) => (
          <TotalRow key={`${charge.label}-${index}`} label={charge.label} value={formatMoney(charge.amount, draft.currency)} />
        ))}
        <TotalRow label="Subtotal" value={formatMoney(draft.subtotal, draft.currency)} isStrong />
        {!isUsd && (
          <div className="flex justify-end text-[12px] text-zinc-500">
            <dt className="sr-only">Subtotal in USD</dt>
            <dd className="tabular-nums">≈ {formatMoney(draft.subtotalUsd)} USD</dd>
          </div>
        )}
      </dl>
      {draft.isBelowMinimum && (
        <div className="px-4 pb-4">
          <Banner tone="warning" title={`Below ${minimumLabel} minimum order`}>
            Subtotal {isUsd ? '' : '≈ '}{formatMoney(draft.subtotalUsd)} USD.
          </Banner>
        </div>
      )}
    </article>
  );
}

/** One label and amount in a draft's totals; the strong variant marks the subtotal. */
function TotalRow({ label, value, isStrong = false }: { label: string; value: string; isStrong?: boolean }) {
  return (
    <div className={clsx('flex items-baseline justify-between gap-4', isStrong && 'border-t border-zinc-200 pt-1.5 font-semibold text-zinc-900')}>
      <dt className={isStrong ? undefined : 'text-zinc-500'}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

/** Items no vendor can supply at the chosen quantity, or a note that every item has a source. */
function UnsourcedList({ items }: { items: PoPlan['unsourced'] }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-2.5">
        <h3 className="text-[13px] font-semibold text-zinc-900">Unsourced</h3>
        {items.length > 0 && (
          <Badge tone="blocker" icon={OctagonX}>
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </Badge>
        )}
      </div>
      {items.length === 0 ? (
        <EmptyState>Every item has a source.</EmptyState>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {items.map((item) => (
            <li key={`${item.rfqNo}:${item.qty}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
              <span className="text-[11px] tabular-nums text-zinc-500">#{item.rfqNo}</span>
              <Mono className="font-medium text-zinc-900">{item.partNumber}</Mono>
              <span className="tabular-nums text-zinc-600">Qty {item.qty}</span>
              <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-medium text-red-700">
                <OctagonX aria-hidden className="size-3.5 shrink-0 text-red-600" />
                {NO_SOURCE_MESSAGE}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
