// Ops "Compare & award": every requested qty break across vendors in USD with the cheapest eligible offer marked,
// and the PO drafts that follow from it. Reads the store and the model; never recomputes rules or eligibility.

import clsx from 'clsx';
import { CircleDashed, PenLine } from 'lucide-react';
import { useState } from 'react';
import type { CompareCell, CompareRow, PoDraft, VendorReview } from '../../domain/types';
import { useReview, useReviewModel } from '../../store/useReview';
import { formatApproxUsd, formatLeadTime, formatMoney, formatQty, shortVendorName } from '../shared/format';
import { Banner, Button, Disclosure, EmptyState, ItemLabel, MetaItem, MetaLine, PageHeader, Tabs, UsdAmount } from '../shared/primitives';
import { findItemDescription } from '../shared/reviewLookups';
import { PAGE, SURFACE, TABLE } from '../shared/styles';

type CompareTab = 'compare' | 'po';

/** Currencies a vendor quoted in other than USD ("EUR"), shown once in its column header. */
function foreignCurrencies(review: VendorReview): string {
  const currencies = new Set(review.products.flatMap((productReview) => productReview.lines.map((lineReview) => lineReview.line.currency)));
  return [...currencies].filter((currency) => currency && currency !== 'USD').join(', ');
}

/** The Compare & award screen. */
export function CompareAndPo() {
  const { vendors, compare, po } = useReviewModel();
  const setView = useReview((state) => state.setView);
  const [tab, setTab] = useState<CompareTab>('compare');
  const unsourced = compare.filter((row) => !row.bestVendorId);
  const sourcedCount = compare.length - unsourced.length;

  return (
    <div className={clsx(PAGE, 'max-w-[1280px]')}>
      <PageHeader
        title="Compare & award"
        description={`${sourcedCount} of ${compare.length} qty breaks have an eligible offer. The cheapest verified exact-part offer wins each break.`}
      />
      {unsourced.length > 0 && (
        <Banner
          className="mb-5"
          title={`${unsourced.length} qty ${unsourced.length === 1 ? 'break has' : 'breaks have'} no eligible offer`}
          actions={<Button size="xs" variant="ghost" onClick={() => setView('follow-ups')}>Go to follow-ups</Button>}
        >
          {unsourced.map((row) => `#${row.rfqNo} ${row.partNumber} @ ${formatQty(row.qty)}`).join(' · ')}
        </Banner>
      )}
      <Tabs
        label="Compare or PO drafts"
        className="mb-4"
        value={tab}
        onChange={(id) => setTab(id as CompareTab)}
        items={[{ id: 'compare', label: 'Compare prices' }, { id: 'po', label: 'PO drafts', count: po.drafts.length }]}
      />
      {tab === 'compare'
        ? <CompareTable rows={compare} vendors={vendors} onFollowUp={() => setView('follow-ups')} />
        : <PoDrafts vendors={vendors} />}
    </div>
  );
}

/** The matrix: one row per item and qty break, one USD column per vendor, and the award. */
function CompareTable({ rows, vendors, onFollowUp }: { rows: CompareRow[]; vendors: VendorReview[]; onFollowUp: () => void }) {
  const eurUsd = useReview((state) => state.overlay.settings.eurUsd);
  if (rows.length === 0) return <div className={SURFACE}><EmptyState>No quotes to compare yet.</EmptyState></div>;
  const vendorName = (vendorId: string | undefined) => shortVendorName(vendors.find((review) => review.vendor.id === vendorId)?.vendor.name ?? '');
  const groups = [...new Set(rows.map((row) => row.rfqNo))].map((rfqNo) => rows.filter((row) => row.rfqNo === rfqNo));
  return (
    <>
      <p className="mb-2 text-[12px] text-zinc-500">
        Prices in USD · EUR converted at {eurUsd.toFixed(2)} · matches the vendor's quote unless marked · grey = not eligible
      </p>
      <div className={clsx(SURFACE, 'overflow-hidden')}>
        <table className={TABLE.table}>
          <thead>
            <tr>
              <th scope="col" className={clsx(TABLE.thNum, 'w-20')}>Qty</th>
              {vendors.map((review) => (
                <th key={review.vendor.id} scope="col" className={TABLE.thNum}>
                  {shortVendorName(review.vendor.name)}
                  {foreignCurrencies(review) && <span className="block text-[11px] font-normal normal-case tracking-normal text-zinc-400">{foreignCurrencies(review)}</span>}
                </th>
              ))}
              <th scope="col" className={clsx(TABLE.th, 'w-40')}>Award</th>
            </tr>
          </thead>
          {groups.map((groupRows) => (
            <tbody key={groupRows[0].rfqNo}>
              <tr className={TABLE.groupRow}>
                <th scope="rowgroup" colSpan={vendors.length + 2} className="px-3 py-2 text-left font-medium">
                  <ItemLabel rfqNo={groupRows[0].rfqNo} partNumber={groupRows[0].partNumber} />
                  <span className="ml-2 font-normal text-zinc-500">{findItemDescription(vendors, groupRows[0].rfqNo)}</span>
                </th>
              </tr>
              {groupRows.map((row) => (
                <tr key={`${row.rfqNo}-${row.qty}`} className={TABLE.row}>
                  <th scope="row" className="px-3 py-2 text-right font-medium tabular-nums text-zinc-800">
                    {formatQty(row.qty)}
                  </th>
                  {vendors.map((review) => (
                    <OfferCell key={review.vendor.id} cell={row.cells[review.vendor.id]} isBest={row.bestVendorId === review.vendor.id} />
                  ))}
                  <td className="px-3 py-2 text-[13px]">
                    {row.bestVendorId ? <span className="font-medium text-zinc-900">{vendorName(row.bestVendorId)}</span> : (
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-[12px] font-medium text-red-700">No eligible offer</span>
                        <button type="button" onClick={onFollowUp} className="text-[12px] text-blue-700 hover:underline">Follow up</button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </>
  );
}

/** One vendor's offer: USD price (vendor's own amount under it when converted) and lead time; exceptions only. */
function OfferCell({ cell, isBest }: { cell: CompareCell | undefined; isBest: boolean }) {
  if (!cell) return <td className="px-3 py-2"><span className="sr-only">Not quoted</span></td>;
  if (cell.usd === null) return <td className="px-3 py-2 text-right text-[12px] font-medium text-red-600">Missing</td>;
  const reason = cell.eligible ? undefined : cell.kind === 'alternate' ? 'alt' : cell.trust === 'open-issue' ? 'open issue' : 'not eligible';
  return (
    <td className={clsx('px-3 py-2 text-right', isBest && 'bg-emerald-50')}>
      <span className="inline-flex items-start justify-end gap-2">
        {cell.trust === 'corrected' && <span title="Corrected from the vendor's quote"><PenLine aria-label="Corrected" className="mt-0.5 size-3 text-blue-700" /></span>}
        {cell.trust === 'unverified' && <span title="Not checked against a line of the quote"><CircleDashed aria-label="Not checked" className="mt-0.5 size-3 text-zinc-400" /></span>}
        <UsdAmount
          usd={cell.usd}
          nativeAmount={cell.unitCost}
          nativeCurrency={cell.currency}
          className={clsx(isBest ? 'font-semibold text-zinc-900' : cell.eligible ? 'text-zinc-700' : 'text-zinc-400')}
        />
        <span className="w-9 text-left text-[12px] tabular-nums text-zinc-400">{formatLeadTime(cell.leadTime)}</span>
      </span>
      {reason && <span className="block text-[11px] text-zinc-500">{reason}</span>}
      {isBest && <span className="sr-only">best eligible offer</span>}
    </td>
  );
}

/** The award as purchase orders: one per winning vendor, plus anything still unsourced. */
function PoDrafts({ vendors }: { vendors: VendorReview[] }) {
  const { po, rfq } = useReviewModel();
  const poQuantity = useReview((state) => state.overlay.poQuantity);
  const setPoQuantity = useReview((state) => state.setPoQuantity);
  return (
    <div className="space-y-5">
      <Disclosure summary="Each part is ordered at its lowest requested quantity. Change quantities">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-3">
          {rfq.items.map((item) => (
            <label key={item.no} className="flex items-center justify-between gap-3 text-[13px]">
              <ItemLabel rfqNo={item.no} partNumber={item.partNumber} />
              <select
                value={poQuantity[item.no] ?? Math.min(...item.qtys)}
                onChange={(event) => setPoQuantity(item.no, Number(event.target.value))}
                className="h-7 rounded-md border border-zinc-300 bg-white px-1.5 text-[12px] tabular-nums"
              >
                {item.qtys.map((qty) => <option key={qty} value={qty}>{formatQty(qty)}</option>)}
              </select>
            </label>
          ))}
        </div>
      </Disclosure>
      {po.drafts.length === 0 && <div className={SURFACE}><EmptyState>No vendor wins a part yet.</EmptyState></div>}
      {po.drafts.map((draft) => {
        const review = vendors.find((candidate) => candidate.vendor.id === draft.vendorId);
        return <PoDraftCard key={draft.vendorId} draft={draft} vendorName={review?.vendor.name ?? draft.vendorId} />;
      })}
      {po.unsourced.length > 0 && (
        <section aria-label="Not on any PO yet" className={clsx(SURFACE, 'px-5 py-4')}>
          <h2 className="text-[13px] font-medium text-zinc-900">Not on any PO yet</h2>
          <ul className="mt-2 space-y-1">
            {po.unsourced.map((item) => (
              <li key={item.rfqNo} className="flex gap-3 text-[13px]"><ItemLabel rfqNo={item.rfqNo} partNumber={item.partNumber} /><span className="text-zinc-500">{formatQty(item.qty)} pcs</span></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** One vendor's PO draft: lines, one-time charges and the total, with a note when it is under the minimum order. */
function PoDraftCard({ draft, vendorName }: { draft: PoDraft; vendorName: string }) {
  const isUsd = draft.currency === 'USD';
  const total = formatMoney(draft.subtotal, draft.currency);
  return (
    <section aria-label={`PO draft for ${vendorName}`} className={SURFACE}>
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-200 px-5 py-3">
        <h2 className="text-[15px] font-semibold text-zinc-900">{vendorName}</h2>
        <MetaLine>
          <MetaItem label="Terms">{draft.paymentTerms || 'Not stated'}</MetaItem>
          {!isUsd && <MetaItem label="Currency">{draft.currency}</MetaItem>}
        </MetaLine>
      </header>
      <table className={TABLE.table}>
        <thead>
          <tr>
            <th scope="col" className={clsx(TABLE.th, 'pl-5')}>Item</th>
            <th scope="col" className={TABLE.thNum}>Qty</th>
            <th scope="col" className={TABLE.thNum}>Unit</th>
            <th scope="col" className={TABLE.thNum}>Ext</th>
            <th scope="col" className={clsx(TABLE.thNum, 'pr-5')}>Lead</th>
          </tr>
        </thead>
        <tbody>
          {draft.lines.map((line) => (
            <tr key={line.lineId} className={TABLE.row}>
              <td className="px-3 py-2 pl-5"><ItemLabel rfqNo={line.rfqNo} partNumber={line.partNumber} /></td>
              <td className={TABLE.tdNum}>{formatQty(line.qty)}</td>
              <td className={TABLE.tdNum}>{formatMoney(line.unitCost, line.currency)}</td>
              <td className={TABLE.tdNum}>{formatMoney(line.extended, line.currency)}</td>
              <td className={clsx(TABLE.tdNum, 'pr-5')}>{formatLeadTime(line.leadTime)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="space-y-1 px-5 py-3 text-[13px]">
        {draft.oneTimeCharges.length > 0 && (
          <>
            <div className="flex justify-between text-zinc-600"><dt>Parts</dt><dd className="tabular-nums">{formatMoney(draft.partsTotal, draft.currency)}</dd></div>
            {draft.oneTimeCharges.map((charge) => (
              <div key={charge.label} className="flex justify-between text-zinc-600"><dt>{charge.label}</dt><dd className="tabular-nums">{formatMoney(charge.amount, draft.currency)}</dd></div>
            ))}
          </>
        )}
        <div className="flex justify-between font-semibold text-zinc-900">
          <dt>Total</dt>
          <dd className="tabular-nums">{total}{!isUsd && <span className="ml-2 font-normal text-zinc-500">{formatApproxUsd(draft.subtotalUsd)}</span>}</dd>
        </div>
      </dl>
      {draft.isBelowMinimum && draft.minimumOrderUsd !== undefined && (
        <Banner className="mx-5 mb-4" title={`Below ${shortVendorName(vendorName)}'s ${formatMoney(draft.minimumOrderUsd)} minimum order by ${formatMoney(draft.minimumOrderUsd - draft.subtotalUsd)}.`} />
      )}
    </section>
  );
}
