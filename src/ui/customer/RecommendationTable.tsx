// Customer recommendation table: one row per RFQ item and quantity break with the recommended vendor,
// its price, lead time and trust, plus the other vendors' quotes inline. Presentational: props in,
// markup out. It never reads the store or re-runs a rule, and vendor text renders only as React text.

import clsx from 'clsx';
import { ChevronDown, ChevronRight, CornerDownRight } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { CompareCell, CompareRow } from '../../domain/types';
import { formatMoney } from '../shared/format';
import { Badge, Mono, TrustChip } from '../shared/primitives';
import {
  describeBadges, findOtherQuotes, formatLeadTime, isSameTarget,
  type EvidenceTarget, type ItemGroup,
} from './customerView';

/** Number of columns, for the item header and empty rows that span the whole table. */
const COLUMN_COUNT = 6;

/** Shared classes for every body cell (borders sit on cells so they stay put under a sticky header). */
const BODY_CELL = 'border-b border-zinc-100 py-2.5 align-middle';

/** Props for RecommendationTable: grouped rows plus the lookups needed to name vendors. */
export interface RecommendationTableProps {
  groups: ItemGroup[];
  vendorNames: Record<string, string>;   // vendor id -> display name
  vendorOrder: string[];                 // vendor ids in nav order, used for "Other quotes"
  activeTarget?: EvidenceTarget;         // the quote open in the evidence drawer, shown as selected
  onOpenEvidence: (target: EvidenceTarget) => void;
}

/** Recommended vendor per item and quantity break; every price opens its evidence. */
export function RecommendationTable({ groups, vendorNames, vendorOrder, activeTarget, onOpenEvidence }: RecommendationTableProps) {
  const [expandedRowKeys, setExpandedRowKeys] = useState<ReadonlySet<string>>(() => new Set());

  const toggleRow = (rowKey: string) => {
    setExpandedRowKeys((current) => {
      const next = new Set(current);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  if (groups.length === 0) {
    return (
      <div className="rounded-md border border-zinc-200 bg-white px-4 py-10 text-center text-[13px] text-zinc-500">
        No requested parts to show yet.
      </div>
    );
  }

  return (
    <div className="overflow-clip rounded-md border border-zinc-200 bg-white">
      <table className="w-full table-fixed border-separate border-spacing-0 text-[13px]">
        <thead>
          <tr>
            <HeaderCell className="w-[112px] pl-4 pr-3 text-left">Qty</HeaderCell>
            <HeaderCell className="px-3 text-left">Recommended vendor</HeaderCell>
            <HeaderCell className="w-[150px] px-3 text-right">Unit price</HeaderCell>
            <HeaderCell className="w-[104px] px-3 text-right">Lead time</HeaderCell>
            <HeaderCell className="w-[200px] px-3 text-left">Status</HeaderCell>
            <HeaderCell className="w-[156px] pl-3 pr-4 text-right"><span className="sr-only">Other quotes</span></HeaderCell>
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody key={group.item.no}>
            <ItemHeaderRow group={group} />
            {group.rows.length === 0 ? (
              <tr>
                <td colSpan={COLUMN_COUNT} className={clsx(BODY_CELL, 'px-4 text-zinc-500')}>No quantity breaks for this part yet.</td>
              </tr>
            ) : (
              group.rows.map((row) => {
                const rowKey = `${row.rfqNo}:${row.qty}`;
                return (
                  <BreakRows
                    key={rowKey}
                    row={row}
                    vendorNames={vendorNames}
                    vendorOrder={vendorOrder}
                    activeTarget={activeTarget}
                    isExpanded={expandedRowKeys.has(rowKey)}
                    onToggle={() => toggleRow(rowKey)}
                    onOpenEvidence={onOpenEvidence}
                  />
                );
              })
            )}
          </tbody>
        ))}
      </table>
    </div>
  );
}

/** A sticky column header: 11px uppercase label. Padding and alignment come from the caller. */
function HeaderCell({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={clsx(
        'sticky top-0 z-10 border-b border-zinc-200 bg-white py-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500',
        className,
      )}
    >
      {children}
    </th>
  );
}

/** The item heading above its breaks: number, part number and description. */
function ItemHeaderRow({ group }: { group: ItemGroup }) {
  return (
    <tr>
      <th scope="colgroup" colSpan={COLUMN_COUNT} className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-left font-normal">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="shrink-0 text-[12px] font-semibold tabular-nums text-zinc-500">#{group.item.no}</span>
          <Mono className="shrink-0 font-semibold text-zinc-900">{group.item.partNumber}</Mono>
          {group.description && <span className="truncate text-zinc-600">{group.description}</span>}
        </div>
      </th>
    </tr>
  );
}

/** Props for one break: its row, the expanded state and the drawer callback. */
interface BreakRowsProps {
  row: CompareRow;
  vendorNames: Record<string, string>;
  vendorOrder: string[];
  activeTarget?: EvidenceTarget;
  isExpanded: boolean;
  onToggle: () => void;
  onOpenEvidence: (target: EvidenceTarget) => void;
}

/** One quantity break: the recommendation row, then the other vendors' rows when expanded. */
function BreakRows({ row, vendorNames, vendorOrder, activeTarget, isExpanded, onToggle, onOpenEvidence }: BreakRowsProps) {
  const bestCell = row.bestVendorId ? row.cells[row.bestVendorId] : undefined;
  const otherQuotes = findOtherQuotes(row, vendorOrder);
  const subRowIds = otherQuotes.map((cell) => `other-quote-${row.rfqNo}-${row.qty}-${cell.vendorId}`);
  const isBestActive = bestCell !== undefined && isSameTarget(activeTarget, row, bestCell.vendorId);
  const openEvidence = (vendorId: string) => onOpenEvidence({ vendorId, rfqNo: row.rfqNo, qty: row.qty });

  return (
    <>
      <tr className={clsx('transition-colors', isBestActive ? 'bg-blue-50' : 'hover:bg-zinc-50')}>
        <td className={clsx(BODY_CELL, 'pl-4 pr-3 tabular-nums text-zinc-900')}>
          {row.qty.toLocaleString('en-US')} <span className="text-zinc-500">pcs</span>
        </td>
        <td className={clsx(BODY_CELL, 'px-3')}>
          {bestCell
            ? <VendorLabel name={vendorNames[bestCell.vendorId] ?? bestCell.vendorId} badges={bestCell.badges} />
            : <span className="text-zinc-500">No recommendation yet</span>}
        </td>
        <td className={clsx(BODY_CELL, 'px-3 text-right')}>
          {bestCell
            ? (
              <PriceButton
                cell={bestCell}
                vendorName={vendorNames[bestCell.vendorId] ?? bestCell.vendorId}
                isActive={isBestActive}
                onClick={() => openEvidence(bestCell.vendorId)}
              />
            )
            : <span className="text-zinc-400">n/a</span>}
        </td>
        <td className={clsx(BODY_CELL, 'px-3 text-right tabular-nums', (!bestCell || bestCell.leadTime === null) ? 'text-zinc-400' : 'text-zinc-800')}>
          {formatLeadTime(bestCell ? bestCell.leadTime : null)}
        </td>
        <td className={clsx(BODY_CELL, 'px-3')}>
          <TrustChip trust={bestCell ? bestCell.trust : 'no-source'} />
        </td>
        <td className={clsx(BODY_CELL, 'pl-3 pr-4 text-right')}>
          {otherQuotes.length > 0 ? (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={isExpanded}
              aria-controls={isExpanded ? subRowIds.join(' ') : undefined}
              className={clsx(
                'inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-medium text-zinc-600 transition-colors',
                'hover:bg-zinc-100 hover:text-zinc-900',
                'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600',
              )}
            >
              {isExpanded
                ? <ChevronDown aria-hidden className="size-3.5 shrink-0" />
                : <ChevronRight aria-hidden className="size-3.5 shrink-0" />}
              Other quotes <span className="tabular-nums">({otherQuotes.length})</span>
            </button>
          ) : (
            <span className="text-[12px] text-zinc-400">No other quotes</span>
          )}
        </td>
      </tr>
      {isExpanded && otherQuotes.map((cell, index) => {
        const isActive = isSameTarget(activeTarget, row, cell.vendorId);
        const vendorName = vendorNames[cell.vendorId] ?? cell.vendorId;
        return (
          <tr
            key={cell.vendorId}
            id={subRowIds[index]}
            className={clsx('transition-colors', isActive ? 'bg-blue-50' : 'bg-zinc-50/60 hover:bg-zinc-50')}
          >
            <td className={clsx(BODY_CELL, 'pl-4 pr-3 text-zinc-400')}>
              <CornerDownRight aria-hidden className="ml-2 size-3.5" />
              <span className="sr-only">Other quote</span>
            </td>
            <td className={clsx(BODY_CELL, 'px-3')}>
              <VendorLabel name={vendorName} badges={cell.badges} isMuted />
            </td>
            <td className={clsx(BODY_CELL, 'px-3 text-right')}>
              <PriceButton cell={cell} vendorName={vendorName} isActive={isActive} onClick={() => openEvidence(cell.vendorId)} />
            </td>
            <td className={clsx(BODY_CELL, 'px-3 text-right tabular-nums', cell.leadTime === null ? 'text-zinc-400' : 'text-zinc-700')}>
              {formatLeadTime(cell.leadTime)}
            </td>
            <td className={clsx(BODY_CELL, 'px-3')}>
              <TrustChip trust={cell.trust} />
            </td>
            <td className={BODY_CELL} />
          </tr>
        );
      })}
    </>
  );
}

/** A vendor name with its quote badges in customer wording ("Alternate part number"). */
function VendorLabel({ name, badges, isMuted = false }: { name: string; badges: string[]; isMuted?: boolean }) {
  const badgeLabels = describeBadges(badges);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className={clsx('truncate', isMuted ? 'text-zinc-700' : 'font-medium text-zinc-900')}>{name}</span>
      {badgeLabels.map((label) => <Badge key={label}>{label}</Badge>)}
    </div>
  );
}

/** The unit price as a link-styled button that opens the evidence drawer for that quote. */
function PriceButton({ cell, vendorName, isActive, onClick }: {
  cell: CompareCell; vendorName: string; isActive: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={`${formatPrimaryPrice(cell)} from ${vendorName}. Show the vendor's source`}
      className={clsx(
        'inline-flex rounded-md px-1.5 py-0.5 transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600',
        isActive ? 'bg-blue-100 ring-1 ring-blue-600' : 'hover:bg-blue-50',
      )}
    >
      <UnitPrice cell={cell} isLink />
    </button>
  );
}

/** A quote's unit price in USD, with the amount as quoted underneath when it was not in USD. */
export function UnitPrice({ cell, isLink = false, align = 'end' }: { cell: CompareCell; isLink?: boolean; align?: 'start' | 'end' }) {
  const quotedPrice = formatQuotedPrice(cell);
  return (
    <span className={clsx('inline-flex flex-col leading-tight tabular-nums', align === 'end' ? 'items-end' : 'items-start')}>
      <span
        className={clsx(
          'font-medium',
          isLink ? 'text-blue-700 underline decoration-blue-300 underline-offset-2' : 'text-zinc-900',
        )}
      >
        {formatPrimaryPrice(cell)}
      </span>
      {quotedPrice && <span className="mt-0.5 text-[11px] font-normal text-zinc-500">{quotedPrice}</span>}
    </span>
  );
}

/** "$12.34" in USD; the quoted amount when no USD value exists; "No price" when neither does. */
function formatPrimaryPrice(cell: CompareCell): string {
  if (cell.usd !== null) return formatMoney(cell.usd);
  if (cell.unitCost !== null) return formatMoney(cell.unitCost, cell.currency || 'USD');
  return 'No price';
}

/** "Quoted 10.50 EUR" when the vendor priced in another currency and a USD value is shown above it. */
function formatQuotedPrice(cell: CompareCell): string | undefined {
  if (cell.usd === null || cell.unitCost === null || !cell.currency || cell.currency === 'USD') return undefined;
  return `Quoted ${formatMoney(cell.unitCost, cell.currency)}`;
}
