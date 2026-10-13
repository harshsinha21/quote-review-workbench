// The vendor's quote laid out against the RFQ: one group per requested item with its lines, a plain row for
// each requested break nobody quoted, then the products the RFQ never asked for (folded away).
// Must not recompute rules (issues come from the review as given) or render vendor text as HTML.

import clsx from 'clsx';
import { Ban, ChevronRight, PenLine, TriangleAlert, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Flag, LineReview, ProductReview, RfqItem, RuleId, Severity, Span, VendorReview } from '../../domain/types';
import { useReview } from '../../store/useReview';
import { formatLeadTime, formatQty } from './format';
import { RULE_LABELS, VARIANCE_TOOLTIP } from './labels';
import { Badge, Money, Mono, SeverityIcon, StatusText } from './primitives';
import { FOCUS_RING, TABLE } from './styles';

/** Props contract (section 7.0). */
export interface QuoteTableProps { review: VendorReview;
  audience: 'ops' | 'vendor';          // vendor: hide internal flags, variance, decisions, other vendors
  selectedLineId?: string;
  onSelectLine?: (lineId: string, evidence?: Span) => void }

const COLUMN_COUNT = 5;
const SEVERITY_RANK: Record<Severity, number> = { blocker: 0, warning: 1, info: 2 };
/** Status label color per severity, so a blocker reads red at a glance. */
const ISSUE_LABEL_TONES: Record<Severity, string> = { blocker: 'font-medium text-red-700', warning: 'text-amber-800', info: 'text-zinc-600' };
/** Issues that mean a value exists in the vendor's text but is absent here: the cell says "Missing" in red. */
const MISSING_VALUE_RULES: ReadonlySet<RuleId> = new Set(['EXTRACTION_DROPPED_VALUE', 'MISSING_PRICE']);
const CELL = 'px-3 py-2';

/** Everything the row components need from the table, handed down as one prop. */
interface TableState {
  isOps: boolean;
  openFlags: Flag[];
  selectedLineId: string | undefined;
  expandedIds: ReadonlySet<string>;
  openFlagsByLine: Map<string, Flag[]>;
  allFlagsByLine: Map<string, Flag[]>;
  openFlagsByProduct: Map<string, Flag[]>;
  selectLine: ((lineReview: LineReview) => void) | undefined;
  setIncluded: ((lineId: string, included: boolean) => void) | undefined;
  toggleExpanded: (productReview: ProductReview) => void;
  selectEvidence: (span: Span | undefined) => void;
}

/** The most severe flag of a list (the first one wins a tie). */
function worstFlag(flags: readonly Flag[]): Flag | undefined {
  let worst: Flag | undefined;
  for (const flag of flags) if (!worst || SEVERITY_RANK[flag.severity] < SEVERITY_RANK[worst.severity]) worst = flag;
  return worst;
}

/** Buckets values by a key; values whose key is undefined are left out. */
function groupBy<T>(values: readonly T[], keyOf: (value: T) => string | undefined): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const key = keyOf(value);
    if (key !== undefined) groups.set(key, [...(groups.get(key) ?? []), value]);
  }
  return groups;
}

/** A product the vendor declined: no lines at all, or the vendor's own text says no bid. */
function isNoBid(productReview: ProductReview): boolean {
  return productReview.lines.length === 0 || productReview.source?.noBid === true;
}

/** "Yes", "No", or "" when the extraction has no value. */
function yesNo(value: boolean | null, yes = 'Yes', no = 'No'): string {
  return typeof value === 'boolean' ? (value ? yes : no) : '';
}

/** A keydown handler that runs the action on Enter or Space pressed on the row itself, not on a control in it. */
function onActivateKey(action: () => void) {
  return (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    action();
  };
}

/** The extracted quote laid out against the RFQ, with a row for every requested break that is missing. */
export function QuoteTable({ review, audience, selectedLineId, onSelectLine }: QuoteTableProps) {
  const toggleInclude = useReview((state) => state.toggleInclude);
  const selectInStore = useReview((state) => state.select);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [isNotInRfqOpen, setIsNotInRfqOpen] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);

  const isOps = audience === 'ops';
  const vendorId = review.vendor.id;
  const items = review.rfq.items;
  // The vendor audience never sees internal issues, so it gets none.
  const openFlags = isOps ? review.open : [];
  const itemNos = new Set(items.map((item) => item.no));
  const isOnRfq = (productReview: ProductReview) => productReview.kind !== 'unrequested'
    && productReview.rfqNo !== undefined && itemNos.has(productReview.rfqNo);
  const productsByItem = groupBy(review.products.filter(isOnRfq), (productReview) => String(productReview.rfqNo));
  const notInRfq = review.products.filter((productReview) => !isOnRfq(productReview));
  const isSelectionNotInRfq = notInRfq.some((productReview) => productReview.lines.some((lineReview) => lineReview.line.id === selectedLineId));
  const showNotInRfq = isNotInRfqOpen || isSelectionNotInRfq;

  // Keep the selected line in view, so the extracted row and the source line it is checked against show together.
  useEffect(() => {
    if (selectedLineId) tableRef.current?.querySelector('tr[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selectedLineId]);

  const selectEvidence = (span: Span | undefined) => {
    if (isOps && span) selectInStore({ span });
  };
  const table: TableState = {
    isOps,
    openFlags,
    selectedLineId,
    expandedIds,
    openFlagsByLine: groupBy(openFlags, (flag) => flag.lineId),
    allFlagsByLine: groupBy(isOps ? review.flags : [], (flag) => flag.lineId),
    openFlagsByProduct: groupBy(openFlags, (flag) => flag.productId),
    selectLine: onSelectLine ? (lineReview) => onSelectLine(lineReview.line.id, lineReview.source?.span) : undefined,
    setIncluded: isOps ? (lineId, included) => toggleInclude(vendorId, lineId, included) : undefined,
    toggleExpanded: (productReview) => {
      const productId = productReview.product.id;
      const willExpand = !expandedIds.has(productId);
      setExpandedIds((current) => {
        const next = new Set(current);
        if (willExpand) next.add(productId);
        else next.delete(productId);
        return next;
      });
      if (willExpand) selectEvidence(productReview.source?.headerSpan ?? productReview.source?.span);
    },
    selectEvidence,
  };

  return (
    <table ref={tableRef} className={clsx(TABLE.table, 'table-fixed')}>
      {isOps && (
        <caption className="caption-top px-3 py-2 text-left text-[12px] text-zinc-500">
          Extracted values. They match the vendor's quote unless marked.
        </caption>
      )}
      <thead>
        <tr>
          <th scope="col" className={clsx(TABLE.thNum, 'w-20')}>Qty</th>
          <th scope="col" className={clsx(TABLE.thNum, 'w-24')}>Unit</th>
          <th scope="col" className={clsx(TABLE.thNum, 'w-24')}>Ext</th>
          <th scope="col" className={clsx(TABLE.thNum, 'w-16')}>Lead</th>
          <th scope="col" className={TABLE.th}>{isOps ? 'Status' : 'FAT'}</th>
        </tr>
      </thead>
      {items.map((item) => (
        <ItemGroup key={item.no} item={item} products={productsByItem.get(String(item.no)) ?? []} table={table} />
      ))}
      {notInRfq.length > 0 && (
        <tbody>
          <tr className={TABLE.groupRow}>
            <td colSpan={COLUMN_COUNT} className="p-0">
              <button
                type="button"
                aria-expanded={showNotInRfq}
                onClick={() => setIsNotInRfqOpen(!showNotInRfq)}
                className={clsx('flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-100', FOCUS_RING)}
              >
                <ChevronRight aria-hidden className={clsx('size-3.5 text-zinc-400 transition-transform', showNotInRfq && 'rotate-90')} />
                {isOps ? 'Not in RFQ' : 'Not requested, not included'}
                <span className="tabular-nums text-zinc-400">{notInRfq.length}</span>
              </button>
            </td>
          </tr>
          {showNotInRfq && notInRfq.map((productReview) => (
            <ProductBlock key={productReview.product.id} productReview={productReview} table={table} />
          ))}
        </tbody>
      )}
    </table>
  );
}

/** One RFQ item: each matched product with its lines (the first carries the item number), then missing breaks. */
function ItemGroup({ item, products, table }: { item: RfqItem; products: ProductReview[]; table: TableState }) {
  const quotedQtys = new Set(products.filter((productReview) => !isNoBid(productReview))
    .flatMap((productReview) => productReview.lines.map((lineReview) => lineReview.line.quantity)));
  const missingQtys = item.qtys.filter((qty) => !quotedQtys.has(qty));
  const isWholeItemNoBid = products.length > 0 && products.every(isNoBid);
  const productIds = new Set(products.map((productReview) => productReview.product.id));
  const coverage = missingQtys.length > 0 && !isWholeItemNoBid ? `${item.qtys.length - missingQtys.length} of ${item.qtys.length} breaks` : undefined;

  return (
    <tbody>
      {products.length === 0 && <HeaderRow itemNo={item.no} partNumber={item.partNumber} noBid />}
      {products.map((productReview, index) => (
        <ProductBlock
          key={productReview.product.id}
          productReview={productReview}
          table={table}
          itemNo={index === 0 ? item.no : undefined}
          coverage={index === 0 ? coverage : undefined}
          altFor={productReview.kind === 'alternate' ? item.partNumber : undefined}
        />
      ))}
      {!isWholeItemNoBid && missingQtys.map((qty) => <MissingBreakRow key={qty} qty={qty} flag={findBreakFlag(table.openFlags, item.no, productIds, qty)} isOps={table.isOps} />)}
    </tbody>
  );
}

/** The open issue for one missing break of an item: no lineId, same qty, matched by item number or product. */
function findBreakFlag(openFlags: readonly Flag[], rfqNo: number, productIds: ReadonlySet<string>, qty: number): Flag | undefined {
  return worstFlag(openFlags.filter((flag) => flag.lineId === undefined && flag.qty === qty
    && (flag.rfqNo === rfqNo || (flag.productId !== undefined && productIds.has(flag.productId)))));
}

/** One extracted product: its header, the details when expanded, then its lines or a single no-bid row. */
function ProductBlock({ productReview, table, itemNo, coverage, altFor }: {
  productReview: ProductReview; table: TableState; itemNo?: number; coverage?: string; altFor?: string;
}) {
  const { product, source } = productReview;
  const noBid = isNoBid(productReview);
  const isExpanded = !noBid && table.expandedIds.has(product.id);
  // A no-bid hides extracted fields, which may be invented; only the vendor's own description stays.
  const description = noBid ? (source?.description ?? '') : (product.description || source?.description || '');
  return (
    <>
      <HeaderRow
        itemNo={itemNo}
        partNumber={product.partNumber}
        description={description}
        altFor={altFor}
        coverage={coverage}
        noBid={noBid}
        expanded={isExpanded}
        onToggle={noBid ? undefined : () => table.toggleExpanded(productReview)}
      />
      {isExpanded && <DetailRow productReview={productReview} isOps={table.isOps} />}
      {noBid
        ? <NoBidRow productReview={productReview} table={table} />
        : productReview.lines.map((lineReview) => <LineRow key={lineReview.line.id} lineReview={lineReview} table={table} />)}
    </>
  );
}

/** An item or product header: "#1 MS27039-1-08 Screw…", plus a short note when something differs from the RFQ. */
function HeaderRow({ itemNo, partNumber, description = '', altFor, coverage, noBid, expanded = false, onToggle }: {
  itemNo?: number; partNumber: string; description?: string; altFor?: string; coverage?: string;
  noBid: boolean; expanded?: boolean; onToggle?: () => void;
}) {
  const content = (
    <>
      <ChevronRight aria-hidden className={clsx('size-3.5 shrink-0 text-zinc-400 transition-transform', !onToggle && 'invisible', expanded && 'rotate-90')} />
      <span className="w-7 shrink-0 tabular-nums text-zinc-400">{itemNo === undefined ? '' : `#${itemNo}`}</span>
      <Mono className="shrink-0 font-semibold text-zinc-900">{partNumber}</Mono>
      <span className="min-w-0 flex-1 truncate font-normal text-zinc-500" title={description}>{description}</span>
      {altFor && <span className="shrink-0 font-normal text-zinc-500">alt for <Mono>{altFor}</Mono></span>}
      {coverage && <span className="shrink-0 font-normal text-zinc-500">{coverage}</span>}
      {noBid && <Badge className="shrink-0">No bid</Badge>}
    </>
  );
  const layout = 'flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left';
  return (
    <tr className={clsx(TABLE.groupRow, onToggle && 'hover:bg-zinc-100')}>
      <td colSpan={COLUMN_COUNT} className="p-0">
        {onToggle ? (
          <button type="button" aria-expanded={expanded} onClick={onToggle} className={clsx(layout, FOCUS_RING)}>{content}</button>
        ) : (
          <div className={layout}>{content}</div>
        )}
      </td>
    </tr>
  );
}

/** Reference details of a product (NSN, manufacturer, terms), shown when its header is expanded. */
function DetailRow({ productReview, isOps }: { productReview: ProductReview; isOps: boolean }) {
  const { product, lines } = productReview;
  const currency = lines[0]?.line.currency || undefined;
  const variances = isOps ? lines.filter((lineReview) => lineReview.line.variance) : [];
  const fields: { label: string; value: ReactNode }[] = [
    { label: 'NSN', value: product.nsn && <Mono>{product.nsn}</Mono> },
    { label: 'Mfr PN', value: product.mfrPartNumber && <Mono>{product.mfrPartNumber}</Mono> },
    { label: 'Mfr CAGE', value: product.mfrCage && <Mono>{product.mfrCage}</Mono> },
    { label: 'Country of origin', value: product.coo },
    { label: 'Hazmat', value: yesNo(product.hazmatItem) },
    { label: 'Packaging', value: yesNo(product.packagingIncluded, 'Included', 'Not included') },
    { label: 'Shipping', value: yesNo(product.shippingIncluded, 'Included', 'Not included') },
    { label: 'Certifications', value: product.certifications },
    { label: 'NRE', value: product.nreCost === null ? '' : <Money amount={product.nreCost} currency={currency} /> },
  ];
  return (
    <tr className="border-b border-zinc-100">
      <td colSpan={COLUMN_COUNT} className="px-3 py-3 pl-[52px]">
        <dl className="grid grid-cols-3 gap-x-6 gap-y-1.5 text-[12px]">
          {fields.map(({ label, value }) => (
            <div key={label} className="min-w-0">
              <dt className="text-zinc-500">{label}</dt>
              <dd className="truncate text-zinc-800">{value || <span className="text-zinc-400">Not stated</span>}</dd>
            </div>
          ))}
        </dl>
        {variances.length > 0 && (
          <p className="mt-2 text-[12px] text-zinc-500" title={VARIANCE_TOOLTIP}>
            Variance (extraction only, not in the quote): {variances.map((lineReview) => `${formatQty(lineReview.line.quantity)} pcs ${lineReview.line.variance}`).join(' · ')}
          </p>
        )}
      </td>
    </tr>
  );
}

/** One quantity break: values as extracted (overrides applied) and, for Ops, its exception status. */
function LineRow({ lineReview, table }: { lineReview: LineReview; table: TableState }) {
  const { line, included } = lineReview;
  const isSelected = table.selectedLineId === line.id;
  const openFlags = table.openFlagsByLine.get(line.id) ?? [];
  const isMissing = openFlags.some((flag) => MISSING_VALUE_RULES.has(flag.rule));
  const hasBlocker = openFlags.some((flag) => flag.severity === 'blocker');
  const select = table.selectLine ? () => table.selectLine?.(lineReview) : undefined;
  const valueClass = !included && 'text-zinc-400 line-through';
  const missing = <span className="text-[12px] font-medium text-red-600">Missing</span>;
  const money = (amount: number | null) => (
    <Money amount={amount} currency={line.currency || undefined} emptyLabel={isMissing ? 'Missing' : '—'} emptyTone={isMissing ? 'blocker' : 'neutral'} />
  );
  return (
    <tr
      tabIndex={select ? 0 : undefined}
      aria-current={isSelected ? 'true' : undefined}
      onClick={select}
      onKeyDown={select && onActivateKey(select)}
      className={clsx('group border-b border-zinc-100', isSelected ? 'bg-blue-50' : hasBlocker ? 'bg-red-50 hover:bg-red-100/60' : 'hover:bg-zinc-50', select && clsx('cursor-pointer', FOCUS_RING))}
    >
      <td className={clsx(CELL, 'text-right font-medium tabular-nums', isSelected ? 'shadow-[inset_3px_0_0_var(--color-blue-700)]' : hasBlocker && 'shadow-[inset_3px_0_0_var(--color-red-500)]', valueClass)}>
        {table.isOps && line.isFat && <Badge className="mr-1.5">FAT</Badge>}
        {formatQty(line.quantity)}
      </td>
      <td className={clsx(CELL, 'text-right', valueClass)}>{money(line.unitCost)}</td>
      <td className={clsx(CELL, 'text-right', valueClass)}>{money(line.price)}</td>
      <td className={clsx(CELL, 'text-right tabular-nums', valueClass)}>
        {line.leadTime === null ? (isMissing ? missing : <span className="text-zinc-400">—</span>) : formatLeadTime(line.leadTime, table.isOps ? 'short' : 'long')}
      </td>
      <td className={CELL}>
        {table.isOps ? <OpsLineStatus lineReview={lineReview} table={table} isSelected={isSelected} /> : yesNo(line.isFat, 'Yes', '')}
      </td>
    </tr>
  );
}

/** Ops status, exceptions only: the worst open issue, "Excluded", "From quote", "Reviewed" or "Not checked". */
function OpsLineStatus({ lineReview, table, isSelected }: { lineReview: LineReview; table: TableState; isSelected: boolean }) {
  const { line, included } = lineReview;
  const openFlags = table.openFlagsByLine.get(line.id) ?? [];
  const decidedCount = (table.allFlagsByLine.get(line.id)?.length ?? 0) - openFlags.length;
  const worst = worstFlag(openFlags);
  let status: ReactNode = null;
  if (worst) status = <IssueLabel flag={worst} extraCount={openFlags.length - 1} />;
  else if (!included) status = <span className="text-[12px] text-zinc-500">Excluded</span>;
  else if (lineReview.overridden) status = <StatusText tone="accent" icon={PenLine} title="Value applied from the vendor's quote">From quote</StatusText>;
  else if (decidedCount > 0) status = <span className="text-[12px] text-zinc-500">Reviewed</span>;
  else if (lineReview.status === 'unverified') status = <span className="text-[12px] text-zinc-400">Not checked</span>;
  const toggleLabel = included ? `Exclude ${formatQty(line.quantity)} pcs from award` : `Include ${formatQty(line.quantity)} pcs in award`;
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <span className="min-w-0 truncate">{status}</span>
      {table.setIncluded && (
        <button
          type="button"
          aria-label={toggleLabel}
          title={toggleLabel}
          onClick={(event) => { event.stopPropagation(); table.setIncluded?.(line.id, !included); }}
          className={clsx('shrink-0 rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700', isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100', FOCUS_RING)}
        >
          {included ? <Ban aria-hidden className="size-3.5" /> : <Undo2 aria-hidden className="size-3.5" />}
        </button>
      )}
    </div>
  );
}

/** An issue as severity icon plus its short rule label, with "+n" when the row has more. */
function IssueLabel({ flag, extraCount }: { flag: Flag; extraCount: number }) {
  return (
    <span className={clsx('inline-flex min-w-0 items-center gap-1.5 text-[12px]', ISSUE_LABEL_TONES[flag.severity])} title={flag.detail}>
      <SeverityIcon severity={flag.severity} />
      <span className="truncate">{RULE_LABELS[flag.rule]}</span>
      {extraCount > 0 && <span className="tabular-nums text-zinc-400">+{extraCount}</span>}
    </span>
  );
}

/** The single row of a no-bid product: the vendor's note in italics, never the extracted values. */
function NoBidRow({ productReview, table }: { productReview: ProductReview; table: TableState }) {
  const { product, source } = productReview;
  // The vendor audience sees only the vendor's own words; Ops may also see the extraction's note.
  const note = table.isOps ? (source?.note || product.additionalNotes) : source?.note;
  const evidence = source?.noteSpan ?? source?.span;
  const worst = table.isOps ? worstFlag(table.openFlagsByProduct.get(product.id) ?? []) : undefined;
  const select = table.isOps && evidence ? () => table.selectEvidence(evidence) : undefined;
  return (
    <tr
      tabIndex={select ? 0 : undefined}
      onClick={select}
      onKeyDown={select && onActivateKey(select)}
      className={clsx('border-b border-zinc-100', select && clsx('cursor-pointer hover:bg-zinc-50', FOCUS_RING))}
    >
      <td colSpan={COLUMN_COUNT} className={clsx(CELL, 'pl-[52px]')}>
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 italic text-zinc-600">{note ? `“${note}”` : 'No bid. No reason given.'}</p>
          {worst && <IssueLabel flag={worst} extraCount={0} />}
        </div>
      </td>
    </tr>
  );
}

/** A requested break the vendor did not quote: the quantity and "not quoted", with the issue as a hint. */
function MissingBreakRow({ qty, flag, isOps }: { qty: number; flag: Flag | undefined; isOps: boolean }) {
  return (
    <tr className="border-b border-zinc-100">
      <td className={clsx(CELL, 'text-right tabular-nums text-zinc-400')}>{formatQty(qty)}</td>
      <td colSpan={COLUMN_COUNT - 1} className={CELL}>
        {isOps ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] italic text-zinc-400">
            not quoted
            {flag && <span title={flag.detail}><TriangleAlert aria-label="Missing qty break" className="size-3.5 text-amber-600" /></span>}
          </span>
        ) : (
          <span className="text-[12px] text-amber-700">Not quoted yet</span>
        )}
      </td>
    </tr>
  );
}
