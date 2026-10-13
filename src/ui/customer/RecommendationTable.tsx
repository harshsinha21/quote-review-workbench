// Customer recommendation table: one row per item and price break with the recommended vendor and price; the other
// quotes fold under each row. Prices open the evidence drawer. Presentational: props in, no rules.

import clsx from 'clsx';
import { ChevronRight, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { CompareCell, CompareRow, ReviewModel } from '../../domain/types';
import { formatLeadTime, formatMoney, formatQty, shortVendorName } from '../shared/format';
import { CUSTOMER_TRUST_LABELS } from '../shared/labels';
import { ItemLabel, SectionHeader, TrustChip, UsdAmount } from '../shared/primitives';
import { SURFACE, TABLE } from '../shared/styles';
import { describeBadges, findOtherQuotes, groupRowsByItem, isSameTarget, type EvidenceTarget } from './customerView';

/** Props: the model, the price whose evidence is open (to tint its row), and how to open one. */
export interface RecommendationTableProps {
  model: ReviewModel;
  openTarget?: EvidenceTarget;
  onOpenEvidence: (target: EvidenceTarget) => void;
}

/** The recommendation table. */
export function RecommendationTable({ model, openTarget, onOpenEvidence }: RecommendationTableProps) {
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const vendorOrder = model.vendors.map((review) => review.vendor.id);
  const vendorName = (vendorId: string) => model.vendors.find((review) => review.vendor.id === vendorId)?.vendor.name ?? '';
  const toggle = (key: string) => setExpandedKeys((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  return (
    <section aria-label="Recommended quotes" className="mt-8">
      <SectionHeader
        className="mb-3"
        title="Recommended quotes"
        description="Every recommended price is checked against the vendor's own quote. Select a price to see the line."
      />
      <div className={clsx(SURFACE, 'overflow-hidden')}>
        <table className={TABLE.table}>
          <thead>
            <tr>
              <th scope="col" className={clsx(TABLE.thNum, 'w-24')}>Qty</th>
              <th scope="col" className={TABLE.th}>Vendor</th>
              <th scope="col" className={clsx(TABLE.thNum, 'w-32')}>Unit price</th>
              <th scope="col" className={clsx(TABLE.thNum, 'w-28')}>Lead time</th>
              <th scope="col" className={clsx(TABLE.th, 'w-48')}>Status</th>
            </tr>
          </thead>
          {groupRowsByItem(model).map((group) => (
            <tbody key={group.item.no}>
              <tr className={TABLE.groupRow}>
                <th scope="rowgroup" colSpan={5} className="px-3 py-2 text-left font-medium">
                  <ItemLabel rfqNo={group.item.no} partNumber={group.item.partNumber} />
                  <span className="ml-2 font-normal text-zinc-500">{group.description}</span>
                </th>
              </tr>
              {group.rows.map((row) => {
                const key = `${row.rfqNo}-${row.qty}`;
                return (
                  <RecommendationRows
                    key={key}
                    row={row}
                    others={findOtherQuotes(row, vendorOrder)}
                    isExpanded={expandedKeys.has(key)}
                    openTarget={openTarget}
                    vendorName={vendorName}
                    onToggle={() => toggle(key)}
                    onOpenEvidence={onOpenEvidence}
                  />
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}

/** One price break: the recommendation (or a "waiting on vendors" line), then the other quotes when expanded. */
function RecommendationRows({ row, others, isExpanded, openTarget, vendorName, onToggle, onOpenEvidence }: {
  row: CompareRow; others: CompareCell[]; isExpanded: boolean; openTarget?: EvidenceTarget;
  vendorName: (vendorId: string) => string; onToggle: () => void; onOpenEvidence: (target: EvidenceTarget) => void;
}) {
  const best = row.bestVendorId ? row.cells[row.bestVendorId] : undefined;
  const open = (cell: CompareCell) => onOpenEvidence({ vendorId: cell.vendorId, rfqNo: row.rfqNo, qty: row.qty });
  const isOpen = best !== undefined && isSameTarget(openTarget, row, best.vendorId);
  return (
    <>
      <tr className={clsx(TABLE.row, isOpen && 'bg-blue-50')}>
        <td className="px-3 py-2.5 text-right tabular-nums text-zinc-800">
          <span className="inline-flex items-center gap-1.5">
            {others.length > 0 && (
              <button type="button" aria-expanded={isExpanded} aria-label={`${isExpanded ? 'Hide' : 'Show'} other quotes`} onClick={onToggle} className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
                <ChevronRight aria-hidden className={clsx('size-3.5 transition-transform', isExpanded && 'rotate-90')} />
              </button>
            )}
            {formatQty(row.qty)}
          </span>
        </td>
        {best ? (
          <>
            <td className="px-3 py-2.5 text-[13px] text-zinc-900" title={vendorName(best.vendorId)}>
              {shortVendorName(vendorName(best.vendorId))}
              {others.length > 0 && <span className="ml-1.5 text-[12px] text-zinc-400">+{others.length}</span>}
            </td>
            <td className="px-3 py-2.5 text-right"><PriceButton cell={best} onOpen={() => open(best)} /></td>
            <td className="px-3 py-2.5 text-right tabular-nums text-zinc-700">{formatLeadTime(best.leadTime, 'long')}</td>
            <td className="px-3 py-2.5">{best.trust !== 'verified' && <TrustChip trust={best.trust} audience="customer" />}</td>
          </>
        ) : (
          <td colSpan={4} className="px-3 py-2.5">
            <span className="inline-flex items-center gap-1.5 text-[13px] text-amber-800">
              <TriangleAlert aria-hidden className="size-3.5 text-amber-600" />
              No compliant quote yet. We're following up with vendors.
            </span>
          </td>
        )}
      </tr>
      {isExpanded && others.map((cell) => (
        <tr key={cell.vendorId} className={clsx(TABLE.row, 'bg-zinc-50/60 text-zinc-600')}>
          <td />
          <td className="px-3 py-2 text-[13px]" title={vendorName(cell.vendorId)}>{shortVendorName(vendorName(cell.vendorId))}</td>
          <td className="px-3 py-2 text-right"><PriceButton cell={cell} onOpen={() => open(cell)} isMuted /></td>
          <td className="px-3 py-2 text-right tabular-nums">{formatLeadTime(cell.leadTime, 'long')}</td>
          <td className="px-3 py-2 text-[12px]">{otherQuoteNote(cell, best)}</td>
        </tr>
      ))}
    </>
  );
}

/** Why another quote did not win, or how far it is from the recommendation ("+$0.12 · Made outside the US"). */
function otherQuoteNote(cell: CompareCell, best: CompareCell | undefined): string {
  const notes = describeBadges(cell.badges);
  if (cell.trust !== 'verified') notes.unshift(CUSTOMER_TRUST_LABELS[cell.trust]);
  if (best?.usd != null && cell.usd != null && cell.eligible) notes.unshift(`+${formatMoney(cell.usd - best.usd)}`);
  return notes.join(' · ');
}

/** A price that opens its evidence: dark text with a dotted underline, blue on hover. */
function PriceButton({ cell, onOpen, isMuted = false }: { cell: CompareCell; onOpen: () => void; isMuted?: boolean }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={clsx(
        'rounded-sm underline decoration-dotted decoration-zinc-300 underline-offset-4 hover:text-blue-700 hover:decoration-blue-400',
        isMuted ? 'text-zinc-600' : 'font-medium text-zinc-900',
      )}
    >
      <UsdAmount usd={cell.usd} nativeAmount={cell.unitCost} nativeCurrency={cell.currency} />
    </button>
  );
}
